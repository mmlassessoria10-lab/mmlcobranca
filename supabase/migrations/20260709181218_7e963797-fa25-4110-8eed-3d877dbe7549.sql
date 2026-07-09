
ALTER TABLE public.notifications_sent
  ADD COLUMN IF NOT EXISTS accept_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(18),'hex'),
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_ip TEXT,
  ADD COLUMN IF NOT EXISTS accepted_name TEXT,
  ADD COLUMN IF NOT EXISTS accepted_document TEXT,
  ADD COLUMN IF NOT EXISTS accepted_user_agent TEXT;

UPDATE public.notifications_sent SET accept_token = encode(gen_random_bytes(18),'hex') WHERE accept_token IS NULL;

CREATE INDEX IF NOT EXISTS notifications_sent_accept_token_idx ON public.notifications_sent(accept_token);
