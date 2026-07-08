
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contract_number TEXT;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS contract_number TEXT;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS legal_status TEXT NOT NULL DEFAULT 'ativo' CHECK (legal_status IN ('ativo','juridico'));
CREATE INDEX IF NOT EXISTS idx_contracts_contract_number ON public.contracts(contract_number);
CREATE INDEX IF NOT EXISTS idx_contracts_legal_status ON public.contracts(legal_status);

-- LEGAL CASES
CREATE TABLE IF NOT EXISTS public.legal_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'notificacao_extrajudicial'
    CHECK (stage IN ('notificacao_extrajudicial','protesto','acao_judicial','acordo','encerrado')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  attorney_name TEXT,
  honorary_amount NUMERIC(14,2),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_cases_contract ON public.legal_cases(contract_id);
CREATE INDEX IF NOT EXISTS idx_legal_cases_stage ON public.legal_cases(stage);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_cases TO authenticated;
GRANT ALL ON public.legal_cases TO service_role;
ALTER TABLE public.legal_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_cases_select_priv" ON public.legal_cases FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE POLICY "legal_cases_insert_priv" ON public.legal_cases FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE POLICY "legal_cases_update_priv" ON public.legal_cases FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE POLICY "legal_cases_delete_admin" ON public.legal_cases FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_legal_cases_updated BEFORE UPDATE ON public.legal_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- LEGAL CASE EVENTS
CREATE TABLE IF NOT EXISTS public.legal_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.legal_cases(id) ON DELETE CASCADE,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  event_type TEXT NOT NULL DEFAULT 'contato'
    CHECK (event_type IN ('contato','notificacao','protocolo','audiencia','acordo','baixa','outro')),
  description TEXT NOT NULL,
  amount NUMERIC(14,2),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_case_events_case ON public.legal_case_events(case_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_case_events TO authenticated;
GRANT ALL ON public.legal_case_events TO service_role;
ALTER TABLE public.legal_case_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_events_select_priv" ON public.legal_case_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE POLICY "legal_events_insert_priv" ON public.legal_case_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE POLICY "legal_events_update_priv" ON public.legal_case_events FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE POLICY "legal_events_delete_admin" ON public.legal_case_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_legal_case_events_updated BEFORE UPDATE ON public.legal_case_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill contract_number no contracts a partir do cliente
CREATE OR REPLACE FUNCTION public.backfill_contract_numbers()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin')
     AND NOT public.has_role(auth.uid(),'financeiro') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.contracts c
     SET contract_number = cu.contract_number
    FROM public.customers cu
   WHERE c.customer_id = cu.id
     AND (c.contract_number IS NULL OR c.contract_number = '')
     AND cu.contract_number IS NOT NULL
     AND cu.contract_number <> '';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.backfill_contract_numbers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_contract_numbers() TO authenticated;

-- Transferência de contrato inteiro (move todas as parcelas ainda não pagas + reatribui commissions)
CREATE OR REPLACE FUNCTION public.transfer_contract(
  _source_contract_id UUID,
  _target_contract_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
  v_moved INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin')
     AND NOT public.has_role(auth.uid(),'financeiro') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _source_contract_id = _target_contract_id THEN
    RAISE EXCEPTION 'source and target must differ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = _target_contract_id) THEN
    RAISE EXCEPTION 'target contract not found';
  END IF;

  SELECT COALESCE(MAX(number),0)+1 INTO v_next
    FROM public.installments WHERE contract_id = _target_contract_id;

  WITH src AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY number) AS rn
      FROM public.installments WHERE contract_id = _source_contract_id
  )
  UPDATE public.installments i
     SET contract_id = _target_contract_id,
         number = v_next + src.rn - 1
    FROM src
   WHERE i.id = src.id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  UPDATE public.commissions SET contract_id = _target_contract_id
   WHERE contract_id = _source_contract_id;

  -- Recalcula total do destino
  UPDATE public.contracts
     SET total_amount = COALESCE((SELECT SUM(amount) FROM public.installments WHERE contract_id = _target_contract_id),0),
         installments_count = COALESCE((SELECT COUNT(*) FROM public.installments WHERE contract_id = _target_contract_id),0)
   WHERE id = _target_contract_id;

  -- Remove contrato de origem (agora vazio)
  DELETE FROM public.contracts WHERE id = _source_contract_id;

  RETURN v_moved;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.transfer_contract(UUID,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_contract(UUID,UUID) TO authenticated;
