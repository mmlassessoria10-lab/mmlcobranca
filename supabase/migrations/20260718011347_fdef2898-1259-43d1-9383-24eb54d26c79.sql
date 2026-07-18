ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT;
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS asaas_invoice_url TEXT;
CREATE INDEX IF NOT EXISTS idx_installments_asaas_payment_id ON public.installments(asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_customers_asaas_customer_id ON public.customers(asaas_customer_id);