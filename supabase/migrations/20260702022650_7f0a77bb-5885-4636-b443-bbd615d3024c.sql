
CREATE POLICY "auth read contas-pagar" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'contas-pagar');
CREATE POLICY "auth insert contas-pagar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'contas-pagar');
CREATE POLICY "auth update contas-pagar" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'contas-pagar');
CREATE POLICY "auth delete contas-pagar" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'contas-pagar');
