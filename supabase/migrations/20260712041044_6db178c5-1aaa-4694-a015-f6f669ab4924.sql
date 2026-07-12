REVOKE EXECUTE ON FUNCTION public.backfill_contract_numbers() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_generate_contract_numbers() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_contract(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_commission_on_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.backfill_contract_numbers() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_generate_contract_numbers() TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_contract(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_commission_on_payment() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;