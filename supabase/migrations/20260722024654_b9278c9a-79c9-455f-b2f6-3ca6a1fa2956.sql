
CREATE POLICY "Staff read sales signatures"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'sales-signatures'
    AND (
      public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'cobranca')
    )
  );
