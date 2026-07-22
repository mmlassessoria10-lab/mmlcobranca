import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SaleItem = { description: string; quantity: number; unit_price: number };
type SaleInput = {
  id?: string;
  customer_id?: string | null;
  customer_snapshot: {
    name: string;
    document?: string;
    email?: string;
    phone?: string;
    address?: string;
    cep?: string;
    street?: string;
    number?: string;
    quadra?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    complement?: string;
  };
  vendor_id?: string | null;
  items: SaleItem[];
  discount: number;
  entry_amount: number;
  installments_count: number;
  first_due_date: string;
  notes?: string;
  receipt_number?: string;
};

function computeTotals(input: SaleInput) {
  const itemsTotal = input.items.reduce(
    (acc, i) => acc + Number(i.quantity || 0) * Number(i.unit_price || 0),
    0,
  );
  const discount = Number(input.discount || 0);
  const entry = Number(input.entry_amount || 0);
  const total = Math.max(0, itemsTotal - discount);
  const financed = Math.max(0, total - entry);
  const count = Math.max(1, Math.floor(input.installments_count || 1));
  const installmentAmount = Math.round((financed / count) * 100) / 100;
  return { itemsTotal, total, installmentAmount, count };
}

export const upsertSalesReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SaleInput) => input)
  .handler(async ({ data, context }) => {
    if (!data.customer_snapshot?.name?.trim()) throw new Error("Nome do cliente é obrigatório");
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("Adicione ao menos 1 item");
    if (!data.first_due_date) throw new Error("Informe o 1º vencimento");

    const { itemsTotal, total, installmentAmount, count } = computeTotals(data);

    const payload = {
      seller_user_id: context.userId,
      vendor_id: data.vendor_id || null,
      customer_id: data.customer_id || null,
      customer_snapshot: data.customer_snapshot,
      items: data.items,
      items_total: itemsTotal,
      discount: Number(data.discount || 0),
      entry_amount: Number(data.entry_amount || 0),
      installments_count: count,
      installment_amount: installmentAmount,
      first_due_date: data.first_due_date,
      total_amount: total,
      notes: data.notes || null,
      receipt_number: data.receipt_number || null,
    };

    if (data.id) {
      const { data: row, error } = await (context.supabase as any)
        .from("sales_receipts")
        .update(payload)
        .eq("id", data.id)
        .select("id, accept_token")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }

    const { data: row, error } = await (context.supabase as any)
      .from("sales_receipts")
      .insert(payload)
      .select("id, accept_token")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const markSaleSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("sales_receipts")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", data.id)
      .in("status", ["draft", "sent"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("sales_receipts")
      .update({ status: "canceled" })
      .eq("id", data.id)
      .neq("status", "accepted");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSaleSignedFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any)
      .from("sales_receipts")
      .select("selfie_path, signature_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message || "Recibo não encontrado");
    const paths = [row.selfie_path, row.signature_path].filter(Boolean) as string[];
    if (paths.length === 0) return { selfie_url: null, signature_url: null };
    const { data: signed } = await (context.supabase as any).storage
      .from("sales-signatures")
      .createSignedUrls(paths, 60 * 30);
    const map = new Map<string, string>();
    (signed || []).forEach((s: any) => { if (s?.path && s?.signedUrl) map.set(s.path, s.signedUrl); });
    return {
      selfie_url: row.selfie_path ? map.get(row.selfie_path) ?? null : null,
      signature_url: row.signature_path ? map.get(row.signature_path) ?? null : null,
    };
  });