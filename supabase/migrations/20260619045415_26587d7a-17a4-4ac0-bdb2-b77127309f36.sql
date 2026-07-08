DROP POLICY IF EXISTS customers_insert_auth ON public.customers;
CREATE POLICY customers_insert_priv ON public.customers
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));