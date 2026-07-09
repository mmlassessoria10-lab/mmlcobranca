
CREATE TABLE IF NOT EXISTS public.agreement_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  has_entry BOOLEAN NOT NULL DEFAULT false,
  default_installments INT NOT NULL DEFAULT 6,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agreement_templates TO authenticated;
GRANT ALL ON public.agreement_templates TO service_role;
ALTER TABLE public.agreement_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage agreement templates" ON public.agreement_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE POLICY "staff read agreement templates" ON public.agreement_templates FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.agreement_templates(id) ON DELETE SET NULL,
  subject TEXT,
  body TEXT NOT NULL,
  original_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  fine_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  interest_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  overdue_count INT NOT NULL DEFAULT 0,
  entry_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  installments_count INT NOT NULL DEFAULT 1,
  installment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  first_due_date DATE,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  accept_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(18),'hex'),
  accepted_at TIMESTAMPTZ,
  accepted_ip TEXT,
  accepted_name TEXT,
  accepted_document TEXT,
  accepted_user_agent TEXT,
  sent_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agreements TO authenticated;
GRANT ALL ON public.agreements TO service_role;
CREATE INDEX IF NOT EXISTS agreements_accept_token_idx ON public.agreements(accept_token);
CREATE INDEX IF NOT EXISTS agreements_customer_idx ON public.agreements(customer_id);
ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage agreements" ON public.agreements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE POLICY "clients read own agreements" ON public.agreements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = agreements.customer_id AND c.user_id = auth.uid()));

CREATE TRIGGER set_agreement_templates_updated_at BEFORE UPDATE ON public.agreement_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_agreements_updated_at BEFORE UPDATE ON public.agreements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.agreement_templates (name, subject, body, has_entry, default_installments) VALUES
('Acordo com entrada', 'Proposta de Acordo Extrajudicial',
'Prezado(a) {{cliente_nome}} (CPF/CNPJ {{cliente_documento}}),

Referente ao contrato {{contrato_numero}} — {{contrato_descricao}} — apuramos um débito atualizado (multa 2% + juros 0,034%/dia) no valor de {{valor_atualizado}} sobre {{parcelas_atrasadas}} parcela(s) em atraso.

PROPOSTA DE ACORDO:
  • Entrada: {{entrada}}
  • Saldo: {{saldo}} em {{qtd_parcelas}} parcela(s) de {{valor_parcela}}
  • Primeiro vencimento: {{primeiro_vencimento}}
  • Total do acordo: {{total_acordo}}

O aceite deste acordo por assinatura digital extingue a cobrança do débito original nas condições aqui pactuadas, sujeito ao pagamento pontual de cada parcela.

{{data_hoje}}', true, 6),
('Acordo sem entrada', 'Proposta de Acordo Extrajudicial (sem entrada)',
'Prezado(a) {{cliente_nome}} (CPF/CNPJ {{cliente_documento}}),

Referente ao contrato {{contrato_numero}} — {{contrato_descricao}} — apuramos um débito atualizado (multa 2% + juros 0,034%/dia) no valor de {{valor_atualizado}} sobre {{parcelas_atrasadas}} parcela(s) em atraso.

PROPOSTA DE ACORDO:
  • Sem entrada
  • {{qtd_parcelas}} parcela(s) de {{valor_parcela}}
  • Primeiro vencimento: {{primeiro_vencimento}}
  • Total do acordo: {{total_acordo}}

O aceite deste acordo por assinatura digital extingue a cobrança do débito original nas condições aqui pactuadas, sujeito ao pagamento pontual de cada parcela.

{{data_hoje}}', false, 6);
