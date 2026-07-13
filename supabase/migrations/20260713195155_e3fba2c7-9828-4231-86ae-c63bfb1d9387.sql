
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS cnh_path text,
  ADD COLUMN IF NOT EXISTS rg_front_path text,
  ADD COLUMN IF NOT EXISTS rg_back_path text,
  ADD COLUMN IF NOT EXISTS residence_proof_path text;

-- Storage policies for customer-documents bucket
-- Path convention: {customer_id}/{filename}

CREATE POLICY "Staff manage customer documents"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'customer-documents'
  AND (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'financeiro')
    OR public.has_role(auth.uid(),'cobranca')
  )
)
WITH CHECK (
  bucket_id = 'customer-documents'
  AND (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'financeiro')
    OR public.has_role(auth.uid(),'cobranca')
  )
);

CREATE POLICY "Customers can view their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'customer-documents'
  AND EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.user_id = auth.uid()
      AND (storage.foldername(name))[1] = c.id::text
  )
);
