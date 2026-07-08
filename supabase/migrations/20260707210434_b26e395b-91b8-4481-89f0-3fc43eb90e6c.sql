
-- Add user_id link on customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_user_id_key ON public.customers(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_email_lower_idx ON public.customers (lower(email));

-- SELECT policies for cliente role
CREATE POLICY "customers_select_own_cliente"
  ON public.customers FOR SELECT
  USING (public.has_role(auth.uid(), 'cliente') AND user_id = auth.uid());

CREATE POLICY "contracts_select_own_cliente"
  ON public.contracts FOR SELECT
  USING (
    public.has_role(auth.uid(), 'cliente')
    AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = contracts.customer_id AND c.user_id = auth.uid())
  );

CREATE POLICY "installments_select_own_cliente"
  ON public.installments FOR SELECT
  USING (
    public.has_role(auth.uid(), 'cliente')
    AND EXISTS (
      SELECT 1 FROM public.contracts ct
      JOIN public.customers c ON c.id = ct.customer_id
      WHERE ct.id = installments.contract_id AND c.user_id = auth.uid()
    )
  );

-- Update handle_new_user to auto-link customer + grant cliente role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_count INT;
  matched_customer_id uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO user_count FROM public.profiles;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- Auto-link to existing customer by email (case-insensitive)
  SELECT id INTO matched_customer_id
  FROM public.customers
  WHERE user_id IS NULL AND lower(email) = lower(NEW.email)
  LIMIT 1;

  IF matched_customer_id IS NOT NULL THEN
    UPDATE public.customers SET user_id = NEW.id WHERE id = matched_customer_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'cliente')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
