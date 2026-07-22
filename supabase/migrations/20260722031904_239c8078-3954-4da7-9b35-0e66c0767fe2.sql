ALTER TABLE public.agreements
  ADD COLUMN IF NOT EXISTS accepted_signature text,
  ADD COLUMN IF NOT EXISTS accepted_selfie text,
  ADD COLUMN IF NOT EXISTS promissory_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS promissory_signature text,
  ADD COLUMN IF NOT EXISTS promissory_selfie text,
  ADD COLUMN IF NOT EXISTS promissory_name text,
  ADD COLUMN IF NOT EXISTS promissory_document text,
  ADD COLUMN IF NOT EXISTS promissory_ip text,
  ADD COLUMN IF NOT EXISTS promissory_user_agent text;