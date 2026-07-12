
CREATE OR REPLACE FUNCTION public.promote_overdue_contracts_to_legal()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH eligible AS (
    SELECT c.id
      FROM public.contracts c
      JOIN public.installments i ON i.contract_id = c.id
     WHERE COALESCE(c.legal_status,'') <> 'juridico'
       AND i.paid_at IS NULL
       AND i.due_date < CURRENT_DATE
     GROUP BY c.id
    HAVING COUNT(*) >= 3
  ),
  upd AS (
    UPDATE public.contracts c
       SET legal_status = 'juridico', updated_at = now()
      FROM eligible e
     WHERE c.id = e.id
    RETURNING c.id
  )
  INSERT INTO public.legal_cases (contract_id, stage, opened_at, notes)
  SELECT u.id, 'notificacao_extrajudicial', now(),
         'Aberto automaticamente: 3 ou mais parcelas vencidas em aberto.'
    FROM upd u
   WHERE NOT EXISTS (
     SELECT 1 FROM public.legal_cases lc
      WHERE lc.contract_id = u.id AND lc.closed_at IS NULL
   );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Trigger runs after installment changes (payment reversal, new overdue etc.)
CREATE OR REPLACE FUNCTION public.trg_check_overdue_to_legal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract uuid;
  v_overdue integer;
  v_status text;
BEGIN
  v_contract := COALESCE(NEW.contract_id, OLD.contract_id);
  IF v_contract IS NULL THEN RETURN NEW; END IF;

  SELECT legal_status INTO v_status FROM public.contracts WHERE id = v_contract;
  IF v_status = 'juridico' THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_overdue
    FROM public.installments
   WHERE contract_id = v_contract
     AND paid_at IS NULL
     AND due_date < CURRENT_DATE;

  IF v_overdue >= 3 THEN
    UPDATE public.contracts
       SET legal_status = 'juridico', updated_at = now()
     WHERE id = v_contract;
    INSERT INTO public.legal_cases (contract_id, stage, opened_at, notes)
    SELECT v_contract, 'notificacao_extrajudicial', now(),
           'Aberto automaticamente: 3 ou mais parcelas vencidas em aberto.'
     WHERE NOT EXISTS (
       SELECT 1 FROM public.legal_cases lc
        WHERE lc.contract_id = v_contract AND lc.closed_at IS NULL
     );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS installments_auto_legal ON public.installments;
CREATE TRIGGER installments_auto_legal
AFTER INSERT OR UPDATE OF paid_at, due_date ON public.installments
FOR EACH ROW EXECUTE FUNCTION public.trg_check_overdue_to_legal();

-- Daily cron job at 03:00 UTC
SELECT cron.unschedule('promote-overdue-to-legal') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'promote-overdue-to-legal'
);
SELECT cron.schedule(
  'promote-overdue-to-legal',
  '0 3 * * *',
  $$ SELECT public.promote_overdue_contracts_to_legal(); $$
);
