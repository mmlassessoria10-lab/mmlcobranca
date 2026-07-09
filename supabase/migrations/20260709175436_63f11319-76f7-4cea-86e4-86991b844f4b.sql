
CREATE TABLE public.notification_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_templates TO authenticated;
GRANT ALL ON public.notification_templates TO service_role;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff view templates" ON public.notification_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE POLICY "staff manage templates" ON public.notification_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE TRIGGER trg_nt_updated BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.notifications_sent (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  original_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  fine_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  interest_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  overdue_count INT NOT NULL DEFAULT 0,
  sent_by UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications_sent TO authenticated;
GRANT ALL ON public.notifications_sent TO service_role;
ALTER TABLE public.notifications_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff view sent" ON public.notifications_sent FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE POLICY "staff manage sent" ON public.notifications_sent FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro') OR public.has_role(auth.uid(),'cobranca'));
CREATE INDEX idx_ns_customer ON public.notifications_sent(customer_id);
CREATE INDEX idx_ns_contract ON public.notifications_sent(contract_id);
CREATE TRIGGER trg_ns_updated BEFORE UPDATE ON public.notifications_sent
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.notification_templates (name, subject, body) VALUES
('Notificação Extrajudicial - Padrão',
 'Notificação Extrajudicial de Cobrança',
 E'NOTIFICAÇÃO EXTRAJUDICIAL DE COBRANÇA\n\nAo(À) Sr(a). {{cliente_nome}}\nDocumento: {{cliente_documento}}\nEndereço/Contato: {{cliente_telefone}} — {{cliente_email}}\n\nData: {{data_hoje}}\n\nPrezado(a) Senhor(a),\n\nConsta em nossos registros débito referente ao contrato Nº {{contrato_numero}} ({{contrato_descricao}}), com {{parcelas_atrasadas}} parcela(s) em atraso.\n\nDetalhamento das parcelas vencidas:\n{{tabela_parcelas}}\n\nValor original em atraso: {{valor_original}}\nMulta (2%): {{multa}}\nJuros de mora (0,034% ao dia): {{juros}}\nVALOR TOTAL ATUALIZADO: {{valor_atualizado}}\n\nFica V.Sa. NOTIFICADO(A) a efetuar o pagamento no prazo de 05 (cinco) dias úteis a contar do recebimento desta, sob pena de inscrição do débito em cadastros de proteção ao crédito, protesto do título e propositura das medidas judiciais cabíveis, sem prejuízo de encargos adicionais.\n\nAtenciosamente,\nPhotogenic Image'),
('Notificação Extrajudicial - Última Chance',
 'Última Notificação Antes de Ação Judicial',
 E'ÚLTIMA NOTIFICAÇÃO EXTRAJUDICIAL\n\n{{cliente_nome}} — {{cliente_documento}}\nData: {{data_hoje}}\n\nApesar de tentativas anteriores, o débito do contrato Nº {{contrato_numero}} permanece em aberto.\n\nParcelas em atraso: {{parcelas_atrasadas}}\n{{tabela_parcelas}}\n\nValor atualizado (com multa de 2% e juros de mora de 0,034% ao dia): {{valor_atualizado}}\n\nConcedemos o prazo IMPRORROGÁVEL de 48 horas para quitação. Decorrido este prazo, o caso será encaminhado ao departamento jurídico para propositura de ação de cobrança, protesto e negativação, com acréscimo de honorários advocatícios.\n\nPhotogenic Image');
