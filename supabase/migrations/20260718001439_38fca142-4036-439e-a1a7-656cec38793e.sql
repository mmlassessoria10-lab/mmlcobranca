
-- Restrict suppliers read to staff roles only
DROP POLICY IF EXISTS "authenticated read suppliers" ON public.suppliers;
CREATE POLICY "staff read suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'financeiro') OR has_role(auth.uid(),'cobranca'));

-- Lock down SECURITY DEFINER functions: revoke public/anon/authenticated execute; regrant only where callable via API
REVOKE EXECUTE ON FUNCTION public.backfill_contract_numbers() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_generate_contract_numbers() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_contract(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_overdue_contracts_to_legal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_invite(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_commission_on_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_check_overdue_to_legal() FROM PUBLIC, anon, authenticated;

-- Regrant admin/staff-callable helpers to authenticated (they self-check role inside)
GRANT EXECUTE ON FUNCTION public.backfill_contract_numbers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_generate_contract_numbers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_contract(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;
