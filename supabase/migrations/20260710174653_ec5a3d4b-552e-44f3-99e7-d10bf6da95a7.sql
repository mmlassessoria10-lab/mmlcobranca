-- Lock down SECURITY DEFINER trigger functions: not meant to be called via the API.
-- Triggers still fire regardless of EXECUTE grants.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_commission_on_payment() FROM PUBLIC, anon, authenticated;

-- Admin/financeiro RPCs: enforce internal role checks; restrict to signed-in users only.
REVOKE ALL ON FUNCTION public.backfill_contract_numbers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_contract_numbers() TO authenticated;

REVOKE ALL ON FUNCTION public.auto_generate_contract_numbers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_generate_contract_numbers() TO authenticated;

REVOKE ALL ON FUNCTION public.transfer_contract(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_contract(uuid, uuid) TO authenticated;

-- Invite redemption: signed-in users only.
REVOKE ALL ON FUNCTION public.redeem_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;

-- Role check used by RLS policies: signed-in users only (anon no longer needs it after policy scoping below).
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- Scope the client self-read policies to authenticated (clientes are always signed in),
-- so anon never evaluates has_role.
DROP POLICY IF EXISTS contracts_select_own_cliente ON public.contracts;
CREATE POLICY contracts_select_own_cliente ON public.contracts
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'cliente'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = contracts.customer_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS customers_select_own_cliente ON public.customers;
CREATE POLICY customers_select_own_cliente ON public.customers
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'cliente'::app_role)
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS installments_select_own_cliente ON public.installments;
CREATE POLICY installments_select_own_cliente ON public.installments
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'cliente'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.contracts ct
      JOIN public.customers c ON c.id = ct.customer_id
      WHERE ct.id = installments.contract_id AND c.user_id = auth.uid()
    )
  );