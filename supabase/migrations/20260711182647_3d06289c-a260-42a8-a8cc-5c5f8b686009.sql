
-- Lock down SECURITY DEFINER functions from anonymous callers
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_commission_on_payment() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.backfill_contract_numbers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auto_generate_contract_numbers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_contract(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_invite(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.backfill_contract_numbers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_generate_contract_numbers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_contract(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;

-- has_role is used by RLS policies; keep executable
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
