-- Auto-generate sequential contract numbers and propagate to customers
CREATE OR REPLACE FUNCTION public.auto_generate_contract_numbers()
RETURNS TABLE(contracts_numbered INTEGER, customers_synced INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start INTEGER;
  v_numbered INTEGER := 0;
  v_synced INTEGER := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin')
     AND NOT public.has_role(auth.uid(),'financeiro') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Highest existing numeric suffix on C-#### style codes
  SELECT COALESCE(MAX(NULLIF(regexp_replace(contract_number,'\D','','g'),'')::int),0)
    INTO v_start
    FROM public.contracts
   WHERE contract_number ~ '^C-\d+$';

  -- Assign C-#### to contracts without a number, ordered by creation
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
      FROM public.contracts
     WHERE contract_number IS NULL OR contract_number = ''
  )
  UPDATE public.contracts c
     SET contract_number = 'C-' || LPAD((v_start + r.rn)::text, 4, '0')
    FROM ranked r
   WHERE c.id = r.id;
  GET DIAGNOSTICS v_numbered = ROW_COUNT;

  -- Sync customer.contract_number when customer has a single contract and no number yet
  WITH single_contract AS (
    SELECT customer_id, MIN(contract_number) AS num
      FROM public.contracts
     WHERE contract_number IS NOT NULL AND contract_number <> ''
     GROUP BY customer_id
    HAVING COUNT(*) = 1
  )
  UPDATE public.customers cu
     SET contract_number = sc.num
    FROM single_contract sc
   WHERE cu.id = sc.customer_id
     AND (cu.contract_number IS NULL OR cu.contract_number = '');
  GET DIAGNOSTICS v_synced = ROW_COUNT;

  RETURN QUERY SELECT v_numbered, v_synced;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_generate_contract_numbers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_generate_contract_numbers() TO authenticated;