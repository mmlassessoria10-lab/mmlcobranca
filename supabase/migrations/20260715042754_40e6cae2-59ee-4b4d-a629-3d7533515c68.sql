
CREATE TABLE public.payables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  category TEXT,
  supplier TEXT,
  sector TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  paid_at DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','paga','atrasada','cancelada')),
  notes TEXT,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payables_due_date_idx ON public.payables(due_date);
CREATE INDEX payables_contract_id_idx ON public.payables(contract_id);
CREATE INDEX payables_sector_idx ON public.payables(sector);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payables TO authenticated;
GRANT ALL ON public.payables TO service_role;

ALTER TABLE public.payables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_fin_select_payables" ON public.payables FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "admin_fin_insert_payables" ON public.payables FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "admin_fin_update_payables" ON public.payables FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "admin_fin_delete_payables" ON public.payables FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

CREATE TRIGGER payables_set_updated_at
  BEFORE UPDATE ON public.payables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
