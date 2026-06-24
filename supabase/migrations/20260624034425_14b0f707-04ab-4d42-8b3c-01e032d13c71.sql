
ALTER VIEW public.pendencias_view SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.appointments_set_numero() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.appointments_calc_status() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_any_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Storage policies para bucket notas-fiscais
CREATE POLICY "auth upload nf" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notas-fiscais');
CREATE POLICY "auth read nf" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'notas-fiscais');
CREATE POLICY "auth update nf" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'notas-fiscais' AND (owner = auth.uid() OR public.is_admin()));
CREATE POLICY "admin delete nf" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'notas-fiscais' AND public.is_admin());
