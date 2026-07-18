import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BILLING_TYPE = "UNDEFINED"; // permite PIX, Boleto e Cartão no checkout Asaas

function asaasHeaders() {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY não configurada");
  return {
    "Content-Type": "application/json",
    access_token: key,
    "User-Agent": "MML-Cobranca/1.0",
  };
}

function asaasBase() {
  return process.env.ASAAS_API_URL || "https://api.asaas.com/v3";
}

async function asaasFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${asaasBase()}${path}`, {
    ...init,
    headers: { ...asaasHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = body?.errors?.[0]?.description || body?.message || `Asaas ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

function onlyDigits(v: string | null | undefined) {
  return (v || "").replace(/\D/g, "");
}

async function ensureCustomer(context: any, customer: any): Promise<string> {
  if (customer.asaas_customer_id) return customer.asaas_customer_id;
  const cpfCnpj = onlyDigits(customer.document);
  const payload: Record<string, any> = {
    name: customer.name,
    email: customer.email || undefined,
    mobilePhone: onlyDigits(customer.phone) || undefined,
    cpfCnpj: cpfCnpj || undefined,
    postalCode: onlyDigits(customer.zip_code) || undefined,
    address: customer.address || undefined,
    addressNumber: customer.address_number || undefined,
    complement: customer.address_complement || undefined,
    province: customer.neighborhood || undefined,
    externalReference: customer.id,
  };
  const created = await asaasFetch("/customers", { method: "POST", body: JSON.stringify(payload) });
  const asaasId = created.id as string;
  await context.supabase.from("customers").update({ asaas_customer_id: asaasId }).eq("id", customer.id);
  return asaasId;
}

export const createAsaasPaymentForInstallment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { installmentId: string }) => input)
  .handler(async ({ data, context }) => {
    const { installmentId } = data;
    const { data: inst, error } = await context.supabase
      .from("installments")
      .select("id, number, due_date, amount, asaas_invoice_url, asaas_payment_id, contract_id, contracts:contract_id (id, description, customer_id, customers:customer_id (*))")
      .eq("id", installmentId)
      .single();
    if (error || !inst) throw new Error(error?.message || "Parcela não encontrada");
    if (inst.asaas_invoice_url) return { invoiceUrl: inst.asaas_invoice_url, paymentId: inst.asaas_payment_id, reused: true };

    const contract: any = (inst as any).contracts;
    const customer: any = contract?.customers;
    if (!customer) throw new Error("Cliente do contrato não encontrado");
    if (!onlyDigits(customer.document)) throw new Error("CPF/CNPJ do cliente é obrigatório para gerar cobrança Asaas");

    const asaasCustomerId = await ensureCustomer(context, customer);

    const paymentBody: Record<string, any> = {
      customer: asaasCustomerId,
      billingType: BILLING_TYPE,
      value: Number(inst.amount),
      dueDate: inst.due_date,
      description: `${contract.description || "Contrato"} - Parcela ${inst.number}`,
      externalReference: inst.id,
    };
    const created = await asaasFetch("/payments", { method: "POST", body: JSON.stringify(paymentBody) });
    const invoiceUrl: string = created.invoiceUrl;
    const paymentId: string = created.id;

    await context.supabase
      .from("installments")
      .update({ asaas_invoice_url: invoiceUrl, asaas_payment_id: paymentId })
      .eq("id", inst.id);

    return { invoiceUrl, paymentId, reused: false };
  });

export const syncCustomerToAsaas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customerId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: customer, error } = await context.supabase
      .from("customers")
      .select("*")
      .eq("id", data.customerId)
      .single();
    if (error || !customer) throw new Error(error?.message || "Cliente não encontrado");
    if (!onlyDigits(customer.document)) throw new Error("CPF/CNPJ obrigatório para exportar ao Asaas");
    const asaasCustomerId = await ensureCustomer(context, customer);
    return { asaasCustomerId, reused: !!customer.asaas_customer_id };
  });

export const syncContractToAsaas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contractId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: contract, error } = await context.supabase
      .from("contracts")
      .select("id, description, customer_id, customers:customer_id (*), installments (id, number, due_date, amount, asaas_invoice_url, asaas_payment_id, paid_at)")
      .eq("id", data.contractId)
      .single();
    if (error || !contract) throw new Error(error?.message || "Contrato não encontrado");
    const customer: any = (contract as any).customers;
    if (!customer) throw new Error("Cliente do contrato não encontrado");
    if (!onlyDigits(customer.document)) throw new Error("CPF/CNPJ do cliente é obrigatório");

    const asaasCustomerId = await ensureCustomer(context, customer);
    const pendings: any[] = ((contract as any).installments || [])
      .filter((i: any) => !i.paid_at && !i.asaas_invoice_url)
      .sort((a: any, b: any) => a.number - b.number);

    let created = 0;
    const errors: string[] = [];
    for (const inst of pendings) {
      try {
        const paymentBody: Record<string, any> = {
          customer: asaasCustomerId,
          billingType: BILLING_TYPE,
          value: Number(inst.amount),
          dueDate: inst.due_date,
          description: `${(contract as any).description || "Contrato"} - Parcela ${inst.number}`,
          externalReference: inst.id,
        };
        const res = await asaasFetch("/payments", { method: "POST", body: JSON.stringify(paymentBody) });
        await context.supabase
          .from("installments")
          .update({ asaas_invoice_url: res.invoiceUrl, asaas_payment_id: res.id })
          .eq("id", inst.id);
        created++;
      } catch (e: any) {
        errors.push(`Parcela ${inst.number}: ${e?.message || e}`);
      }
    }
    return { asaasCustomerId, created, skipped: pendings.length - created, errors };
  });