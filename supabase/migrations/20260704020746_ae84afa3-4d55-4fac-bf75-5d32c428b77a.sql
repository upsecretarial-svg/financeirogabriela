DROP POLICY IF EXISTS "admin insert payables" ON public.payables;
DROP POLICY IF EXISTS "admin update payables" ON public.payables;
CREATE POLICY "auth insert payables" ON public.payables FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update payables" ON public.payables FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);