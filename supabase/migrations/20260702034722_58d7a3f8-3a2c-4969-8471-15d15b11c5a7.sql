
CREATE OR REPLACE FUNCTION public.redeem_invite(_token text)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.invites%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT * INTO v_invite FROM public.invites WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite not found'; END IF;
  IF v_invite.used_at IS NOT NULL THEN RAISE EXCEPTION 'invite already used'; END IF;
  IF v_invite.expires_at < now() THEN RAISE EXCEPTION 'invite expired'; END IF;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, v_invite.role)
    ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.invites
    SET used_at = now(), used_by = v_uid
    WHERE id = v_invite.id;

  RETURN v_invite.role;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;
