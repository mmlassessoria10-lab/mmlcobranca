ALTER TABLE public.sales_receipts
  ADD COLUMN IF NOT EXISTS guarantor JSONB,
  ADD COLUMN IF NOT EXISTS guarantor_selfie_path TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_signature_path TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guarantor_ip TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_user_agent TEXT;