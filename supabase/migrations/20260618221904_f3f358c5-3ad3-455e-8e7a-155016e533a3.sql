
-- Restrict SELECT policies
DROP POLICY IF EXISTS profiles_select_auth ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS customers_select_all_auth ON public.customers;
CREATE POLICY customers_select_priv ON public.customers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro') OR public.has_role(auth.uid(), 'cobranca'));

DROP POLICY IF EXISTS contracts_select_all_auth ON public.contracts;
CREATE POLICY contracts_select_priv ON public.contracts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro') OR public.has_role(auth.uid(), 'cobranca'));

DROP POLICY IF EXISTS installments_select_all_auth ON public.installments;
CREATE POLICY installments_select_priv ON public.installments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro') OR public.has_role(auth.uid(), 'cobranca'));

-- Lock down SECURITY DEFINER trigger functions from API callers
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
