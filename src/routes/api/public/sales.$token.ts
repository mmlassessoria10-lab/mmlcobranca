import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; contentType: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1];
  const base64 = m[2];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, contentType };
}

function extFromContentType(ct: string) {
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("jpg") || ct.includes("jpeg")) return "jpg";
  return "bin";
}

function generateInstallments(total: number, count: number, firstDueDate: string) {
  const base = Math.floor((total * 100) / count) / 100;
  const result: { number: number; due_date: string; amount: number }[] = [];
  let acc = 0;
  const [y, m, d] = firstDueDate.split("-").map(Number);
  for (let i = 0; i < count; i++) {
    const dt = new Date(y, m - 1 + i, d);
    const due = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const amt = i === count - 1 ? Math.round((total - acc) * 100) / 100 : base;
    acc += amt;
    result.push({ number: i + 1, due_date: due, amount: amt });
  }
  return result;
}

export const Route = createFileRoute("/api/public/sales/$token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [saleRes, companyRes] = await Promise.all([
          supabaseAdmin
            .from("sales_receipts")
            .select("id,receipt_number,customer_snapshot,items,items_total,discount,entry_amount,installments_count,installment_amount,first_due_date,total_amount,notes,status,sent_at,accepted_at,accepted_name,accepted_document,created_at,guarantor,guarantor_signed_at")
            .eq("accept_token", params.token)
            .maybeSingle(),
          supabaseAdmin.from("app_settings").select("value").eq("key", "company_info").maybeSingle(),
        ]);
        if (saleRes.error || !saleRes.data) return json({ error: "not_found" }, 404);
        return json({ sale: saleRes.data, company: companyRes.data?.value ?? null });
      },

      POST: async ({ params, request }) => {
        let body: any = {};
        try { body = await request.json(); } catch { return json({ error: "invalid_body" }, 400); }
        const kind = String(body.kind ?? "buyer");
        const name = String(body.name ?? "").trim();
        const document = String(body.document ?? "").trim();
        const selfie = String(body.selfie ?? "");
        const signature = String(body.signature ?? "");

        if (name.length < 3 || name.length > 200) return json({ error: "invalid_name" }, 400);
        if (document.length < 5 || document.length > 40) return json({ error: "invalid_document" }, 400);
        if (!selfie.startsWith("data:image/")) return json({ error: "missing_selfie" }, 400);
        if (!signature.startsWith("data:image/")) return json({ error: "missing_signature" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: sale, error: fetchErr } = await supabaseAdmin
          .from("sales_receipts")
          .select("*")
          .eq("accept_token", params.token)
          .maybeSingle();
        if (fetchErr || !sale) return json({ error: "not_found" }, 404);

        const selfieBytes = dataUrlToBytes(selfie);
        const signatureBytes = dataUrlToBytes(signature);
        if (!selfieBytes || !signatureBytes) return json({ error: "invalid_image" }, 400);
        if (selfieBytes.bytes.length > 5 * 1024 * 1024) return json({ error: "selfie_too_large" }, 400);
        if (signatureBytes.bytes.length > 1 * 1024 * 1024) return json({ error: "signature_too_large" }, 400);

        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        const ua = request.headers.get("user-agent")?.slice(0, 500) ?? null;

        if (kind === "guarantor") {
          if (!sale.guarantor) return json({ error: "no_guarantor" }, 400);
          if ((sale as any).guarantor_signed_at) return json({ ok: true, already: true });
          const gSelfiePath = `${sale.id}/guarantor-selfie.${extFromContentType(selfieBytes.contentType)}`;
          const gSigPath = `${sale.id}/guarantor-signature.${extFromContentType(signatureBytes.contentType)}`;
          const gu1 = await supabaseAdmin.storage.from("sales-signatures").upload(gSelfiePath, selfieBytes.bytes, { contentType: selfieBytes.contentType, upsert: true });
          if (gu1.error) return json({ error: gu1.error.message }, 500);
          const gu2 = await supabaseAdmin.storage.from("sales-signatures").upload(gSigPath, signatureBytes.bytes, { contentType: signatureBytes.contentType, upsert: true });
          if (gu2.error) return json({ error: gu2.error.message }, 500);
          const merged = { ...(sale.guarantor as any), name, document };
          const { error: gErr } = await (supabaseAdmin as any).from("sales_receipts").update({
            guarantor: merged,
            guarantor_selfie_path: gSelfiePath,
            guarantor_signature_path: gSigPath,
            guarantor_signed_at: new Date().toISOString(),
            guarantor_ip: ip,
            guarantor_user_agent: ua,
          }).eq("id", sale.id);
          if (gErr) return json({ error: gErr.message }, 500);
          return json({ ok: true, kind: "guarantor" });
        }

        if (sale.accepted_at) return json({ ok: true, already: true });

        const selfiePath = `${sale.id}/selfie.${extFromContentType(selfieBytes.contentType)}`;
        const signaturePath = `${sale.id}/signature.${extFromContentType(signatureBytes.contentType)}`;

        const up1 = await supabaseAdmin.storage.from("sales-signatures").upload(selfiePath, selfieBytes.bytes, {
          contentType: selfieBytes.contentType, upsert: true,
        });
        if (up1.error) return json({ error: up1.error.message }, 500);
        const up2 = await supabaseAdmin.storage.from("sales-signatures").upload(signaturePath, signatureBytes.bytes, {
          contentType: signatureBytes.contentType, upsert: true,
        });
        if (up2.error) return json({ error: up2.error.message }, 500);

        // Auto-create customer if none linked
        let customerId = sale.customer_id as string | null;
        const snap = (sale.customer_snapshot ?? {}) as any;
        if (!customerId) {
          const { data: newCustomer, error: cErr } = await supabaseAdmin
            .from("customers")
            .insert({
              name: snap.name || name,
              document: (snap.document || document) || null,
              email: snap.email || null,
              phone: snap.phone || null,
              address_street: snap.address || null,
            })
            .select("id")
            .single();
          if (cErr) return json({ error: `customer: ${cErr.message}` }, 500);
          customerId = newCustomer.id;
        }

        // Create contract + installments
        const contractDescription = `Venda ${sale.receipt_number || sale.id.slice(0, 8)}`;
        const financed = Math.max(0, Number(sale.total_amount) - Number(sale.entry_amount || 0));
        const count = Number(sale.installments_count || 1);
        if (!sale.first_due_date) return json({ error: "missing_first_due_date" }, 400);
        const { data: contract, error: kErr } = await supabaseAdmin
          .from("contracts")
          .insert({
            customer_id: customerId!,
            description: contractDescription,
            total_amount: financed,
            installments_count: count,
            first_due_date: sale.first_due_date,
            contract_number: sale.receipt_number || null,
            vendor_id: sale.vendor_id || null,
          })
          .select("id")
          .single();
        if (kErr) return json({ error: `contract: ${kErr.message}` }, 500);

        if (financed > 0 && count > 0 && sale.first_due_date) {
          const rows = generateInstallments(financed, count, sale.first_due_date).map((r) => ({
            ...r, contract_id: contract.id,
          }));
          const { error: iErr } = await supabaseAdmin.from("installments").insert(rows);
          if (iErr) return json({ error: `installments: ${iErr.message}` }, 500);
        }

        const { error: upErr } = await supabaseAdmin
          .from("sales_receipts")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
            accepted_name: name,
            accepted_document: document,
            accepted_ip: ip,
            accepted_user_agent: ua,
            selfie_path: selfiePath,
            signature_path: signaturePath,
            customer_id: customerId,
            contract_id: contract.id,
          })
          .eq("id", sale.id);
        if (upErr) return json({ error: upErr.message }, 500);

        return json({ ok: true, contract_id: contract.id });
      },
    },
  },
});