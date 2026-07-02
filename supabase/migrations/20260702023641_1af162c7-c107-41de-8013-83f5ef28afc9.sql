
-- Restrict audit log reads to admins
DROP POLICY IF EXISTS "auth read audit" ON public.audit_log;
CREATE POLICY "admin read audit" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

-- Restrict payables writes to admins
DROP POLICY IF EXISTS "auth insert payables" ON public.payables;
DROP POLICY IF EXISTS "auth update payables" ON public.payables;
CREATE POLICY "admin insert payables" ON public.payables
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin update payables" ON public.payables
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Restrict services writes to admins
DROP POLICY IF EXISTS "Authenticated can insert services" ON public.services;
DROP POLICY IF EXISTS "Authenticated can update services" ON public.services;
CREATE POLICY "Admins can insert services" ON public.services
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update services" ON public.services
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
