
-- Restore role-based RLS on customers, contracts, installments
-- SELECT/INSERT/UPDATE: admin OR financeiro OR cobranca; DELETE: admin only

DROP POLICY IF EXISTS customers_select_auth ON public.customers;
DROP POLICY IF EXISTS customers_insert_auth ON public.customers;
DROP POLICY IF EXISTS customers_update_auth ON public.customers;
DROP POLICY IF EXISTS customers_delete_auth ON public.customers;

CREATE POLICY customers_select_priv ON public.customers FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'));
CREATE POLICY customers_insert_priv ON public.customers FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'));
CREATE POLICY customers_update_priv ON public.customers FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'))
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'));
CREATE POLICY customers_delete_admin ON public.customers FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS contracts_select_auth ON public.contracts;
DROP POLICY IF EXISTS contracts_insert_auth ON public.contracts;
DROP POLICY IF EXISTS contracts_update_auth ON public.contracts;
DROP POLICY IF EXISTS contracts_delete_auth ON public.contracts;

CREATE POLICY contracts_select_priv ON public.contracts FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'));
CREATE POLICY contracts_insert_priv ON public.contracts FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'));
CREATE POLICY contracts_update_priv ON public.contracts FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'))
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'));
CREATE POLICY contracts_delete_admin ON public.contracts FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS installments_select_auth ON public.installments;
DROP POLICY IF EXISTS installments_insert_auth ON public.installments;
DROP POLICY IF EXISTS installments_update_auth ON public.installments;
DROP POLICY IF EXISTS installments_delete_auth ON public.installments;

CREATE POLICY installments_select_priv ON public.installments FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'));
CREATE POLICY installments_insert_priv ON public.installments FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'));
CREATE POLICY installments_update_priv ON public.installments FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'))
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'));
CREATE POLICY installments_delete_admin ON public.installments FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'));
