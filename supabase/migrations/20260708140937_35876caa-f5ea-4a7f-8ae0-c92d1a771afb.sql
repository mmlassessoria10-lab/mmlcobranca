
-- VENDORS
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  commission_rate numeric(6,3) NOT NULL DEFAULT 0 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendors_select_staff" ON public.vendors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE POLICY "vendors_insert_admin_fin" ON public.vendors FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "vendors_update_admin_fin" ON public.vendors FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "vendors_delete_admin" ON public.vendors FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER set_vendors_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CONTRACTS.vendor_id
ALTER TABLE public.contracts ADD COLUMN vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
CREATE INDEX idx_contracts_vendor_id ON public.contracts(vendor_id);

-- COMMISSIONS
CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  installment_id uuid NOT NULL UNIQUE REFERENCES public.installments(id) ON DELETE CASCADE,
  installment_amount numeric(12,2) NOT NULL,
  rate numeric(6,3) NOT NULL,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;
CREATE INDEX idx_commissions_vendor ON public.commissions(vendor_id);
CREATE INDEX idx_commissions_status ON public.commissions(status);
CREATE INDEX idx_commissions_contract ON public.commissions(contract_id);
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commissions_select_staff" ON public.commissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE POLICY "commissions_insert_admin_fin" ON public.commissions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "commissions_update_admin_fin" ON public.commissions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "commissions_delete_admin" ON public.commissions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER set_commissions_updated_at BEFORE UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: create commission when installment marked paid
CREATE OR REPLACE FUNCTION public.create_commission_on_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vendor_id uuid;
  v_rate numeric(6,3);
BEGIN
  IF NEW.status = 'paga' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paga') THEN
    SELECT c.vendor_id, v.commission_rate INTO v_vendor_id, v_rate
    FROM public.contracts c
    LEFT JOIN public.vendors v ON v.id = c.vendor_id
    WHERE c.id = NEW.contract_id;

    IF v_vendor_id IS NOT NULL AND v_rate IS NOT NULL AND v_rate > 0 THEN
      INSERT INTO public.commissions (vendor_id, contract_id, installment_id, installment_amount, rate, amount, status)
      VALUES (v_vendor_id, NEW.contract_id, NEW.id, NEW.amount, v_rate, ROUND(NEW.amount * v_rate / 100, 2), 'pendente')
      ON CONFLICT (installment_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER commission_on_installment_paid
AFTER INSERT OR UPDATE OF status, paid_at ON public.installments
FOR EACH ROW EXECUTE FUNCTION public.create_commission_on_payment();
