
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'vet');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::app_role)
$$;

-- profile policies
CREATE POLICY "users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "admin insert profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() OR id = auth.uid());

-- user_roles policies
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- ============ CLINICS ============
CREATE TABLE public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  percentual_repasse NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percentual_repasse >= 0 AND percentual_repasse <= 100),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read clinics" ON public.clinics FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write clinics" ON public.clinics FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin update clinics" ON public.clinics FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "admin delete clinics" ON public.clinics FOR DELETE TO authenticated USING (public.is_admin());

-- ============ PAYMENT METHODS ============
CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read pm" ON public.payment_methods FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin ins pm" ON public.payment_methods FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin upd pm" ON public.payment_methods FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "admin del pm" ON public.payment_methods FOR DELETE TO authenticated USING (public.is_admin());

-- seed default payment methods
INSERT INTO public.payment_methods (nome) VALUES
  ('Dinheiro'), ('Pix'), ('Cartão de Débito'), ('Cartão de Crédito'), ('Transferência'), ('Boleto');

-- ============ APPOINTMENTS ============
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_interno TEXT UNIQUE,
  tutor TEXT NOT NULL,
  pet TEXT NOT NULL,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  data_atendimento DATE NOT NULL,
  valor NUMERIC(12,2),
  observacoes TEXT,
  nf_emitida BOOLEAN NOT NULL DEFAULT false,
  nf_enviada BOOLEAN NOT NULL DEFAULT false,
  nf_pdf_path TEXT,
  nf_data_emissao DATE,
  nf_numero TEXT,
  pago BOOLEAN NOT NULL DEFAULT false,
  data_pagamento DATE,
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  valor_recebido NUMERIC(12,2),
  comprovante_path TEXT,
  obs_financeiras TEXT,
  status TEXT NOT NULL DEFAULT 'realizado',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_clinic ON public.appointments(clinic_id);
CREATE INDEX idx_app_data ON public.appointments(data_atendimento);
CREATE INDEX idx_app_pago ON public.appointments(pago);
CREATE INDEX idx_app_status ON public.appointments(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read appts" ON public.appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth ins appts" ON public.appointments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth upd appts" ON public.appointments FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin del appts" ON public.appointments FOR DELETE TO authenticated USING (public.is_admin());

-- sequence per year for numero_interno
CREATE OR REPLACE FUNCTION public.appointments_set_numero()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  yr TEXT;
  seq INT;
BEGIN
  IF NEW.numero_interno IS NOT NULL THEN RETURN NEW; END IF;
  yr := to_char(COALESCE(NEW.data_atendimento, CURRENT_DATE), 'YYYY');
  SELECT COALESCE(MAX(CAST(split_part(numero_interno, '-', 3) AS INT)), 0) + 1
    INTO seq FROM public.appointments
    WHERE numero_interno LIKE 'ATD-' || yr || '-%';
  NEW.numero_interno := 'ATD-' || yr || '-' || lpad(seq::TEXT, 4, '0');
  RETURN NEW;
END $$;

CREATE TRIGGER trg_appts_numero
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_set_numero();

-- status calc
CREATE OR REPLACE FUNCTION public.appointments_calc_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.pago AND NEW.nf_emitida AND NEW.nf_enviada THEN
    NEW.status := 'finalizado';
  ELSIF NEW.pago AND NOT NEW.nf_emitida THEN
    NEW.status := 'nf_pendente';
  ELSIF NEW.pago THEN
    NEW.status := 'pago';
  ELSIF NEW.valor IS NULL THEN
    NEW.status := 'sem_valor';
  ELSE
    NEW.status := 'aguardando_pagamento';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_appts_status
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_calc_status();

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tabela TEXT NOT NULL,
  registro_id UUID,
  acao TEXT NOT NULL,
  diff JSONB,
  ip TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tab ON public.audit_log(tabela, registro_id);
CREATE INDEX idx_audit_user ON public.audit_log(user_id);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read audit" ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth ins audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  rec_id UUID;
  diff_data JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec_id := OLD.id;
    diff_data := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    rec_id := NEW.id;
    diff_data := to_jsonb(NEW);
  ELSE
    rec_id := NEW.id;
    diff_data := jsonb_build_object('antes', to_jsonb(OLD), 'depois', to_jsonb(NEW));
  END IF;
  INSERT INTO public.audit_log(user_id, tabela, registro_id, acao, diff)
  VALUES (auth.uid(), TG_TABLE_NAME, rec_id, TG_OP, diff_data);
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_audit_appts AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER trg_audit_clinics AFTER INSERT OR UPDATE OR DELETE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER trg_audit_pm AFTER INSERT OR UPDATE OR DELETE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============ LOGIN EVENTS ============
CREATE TABLE public.login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read login" ON public.login_events FOR SELECT TO authenticated USING (public.is_admin() OR user_id = auth.uid());
CREATE POLICY "auth ins login" ON public.login_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============ PENDENCIAS VIEW ============
CREATE OR REPLACE VIEW public.pendencias_view AS
SELECT
  a.*,
  c.nome AS clinica_nome,
  CASE
    WHEN a.clinic_id IS NULL THEN 'sem_clinica'
    WHEN a.valor IS NULL THEN 'sem_valor'
    WHEN NOT a.nf_emitida THEN 'sem_nf'
    WHEN NOT a.pago AND a.comprovante_path IS NULL AND (now() - a.created_at) > INTERVAL '48 hours' THEN 'atrasado_48h'
    WHEN NOT a.pago THEN 'aguardando'
    ELSE 'ok'
  END AS tipo_pendencia
FROM public.appointments a
LEFT JOIN public.clinics c ON c.id = a.clinic_id
WHERE
  a.clinic_id IS NULL
  OR a.valor IS NULL
  OR NOT a.nf_emitida
  OR (NOT a.pago AND (now() - a.created_at) > INTERVAL '48 hours');

GRANT SELECT ON public.pendencias_view TO authenticated;

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
