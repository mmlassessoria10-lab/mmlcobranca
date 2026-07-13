
DROP POLICY IF EXISTS "Customers can view their own documents" ON storage.objects;

CREATE POLICY "Customers can view their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'customer-documents'
  AND EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.user_id = auth.uid()
      AND c.id::text = (storage.foldername(storage.objects.name))[1]
  )
);
