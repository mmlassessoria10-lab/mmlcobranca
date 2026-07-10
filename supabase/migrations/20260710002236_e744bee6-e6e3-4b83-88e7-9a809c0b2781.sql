
-- app_settings: restrict public reads to a whitelist of keys
DROP POLICY IF EXISTS "Public can read settings" ON public.app_settings;

CREATE POLICY "Public can read whitelisted settings"
  ON public.app_settings FOR SELECT
  TO anon
  USING (key IN ('agreement_logo'));

CREATE POLICY "Staff can read all settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (
    key IN ('agreement_logo')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'cobranca')
  );

-- agreement_templates: restrict SELECT to staff roles
DROP POLICY IF EXISTS "staff read agreement templates" ON public.agreement_templates;

CREATE POLICY "staff read agreement templates"
  ON public.agreement_templates FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'cobranca')
  );
