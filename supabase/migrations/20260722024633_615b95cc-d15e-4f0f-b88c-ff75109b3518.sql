
CREATE TABLE public.sales_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  receipt_number TEXT,
  customer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  items_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  entry_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  installments_count INTEGER NOT NULL DEFAULT 1,
  installment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  first_due_date DATE,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  accept_token TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text,'-','') UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','canceled')),
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_name TEXT,
  accepted_document TEXT,
  accepted_ip TEXT,
  accepted_user_agent TEXT,
  selfie_path TEXT,
  signature_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_receipts TO authenticated;
GRANT ALL ON public.sales_receipts TO service_role;

ALTER TABLE public.sales_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage sales"
  ON public.sales_receipts FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'financeiro')
    OR public.has_role(auth.uid(),'cobranca')
    OR seller_user_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'financeiro')
    OR public.has_role(auth.uid(),'cobranca')
    OR seller_user_id = auth.uid()
  );

CREATE TRIGGER trg_sales_receipts_updated_at
  BEFORE UPDATE ON public.sales_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_sales_receipts_status ON public.sales_receipts(status);
CREATE INDEX idx_sales_receipts_token ON public.sales_receipts(accept_token);
CREATE INDEX idx_sales_receipts_customer ON public.sales_receipts(customer_id);
