
-- Soft delete em appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_appointments_deleted_at ON public.appointments(deleted_at);

-- Atualiza pendencias_view para ignorar excluídos
DROP VIEW IF EXISTS public.pendencias_view;
CREATE VIEW public.pendencias_view AS
SELECT
  a.id, a.numero_interno, a.tutor, a.pet, a.data_atendimento, a.valor,
  a.clinic_id, a.pago, a.nf_emitida, a.comprovante_path,
  CASE
    WHEN a.valor IS NULL THEN 'sem_valor'
    WHEN a.clinic_id IS NULL THEN 'sem_clinica'
    WHEN NOT a.pago AND a.data_atendimento < (CURRENT_DATE - INTERVAL '2 days') THEN 'pagamento_atrasado'
    WHEN a.pago AND NOT a.nf_emitida THEN 'nf_pendente'
    WHEN a.pago AND a.comprovante_path IS NULL THEN 'sem_comprovante'
  END AS tipo_pendencia
FROM public.appointments a
WHERE a.deleted_at IS NULL
  AND (
    a.valor IS NULL
    OR a.clinic_id IS NULL
    OR (NOT a.pago AND a.data_atendimento < (CURRENT_DATE - INTERVAL '2 days'))
    OR (a.pago AND NOT a.nf_emitida)
    OR (a.pago AND a.comprovante_path IS NULL)
  );
GRANT SELECT ON public.pendencias_view TO authenticated;

-- Configurações da aplicação (singleton)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  meta_mensal NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos autenticados leem settings"
  ON public.app_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Apenas admin grava settings"
  ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Apenas admin atualiza settings"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.app_settings (id, meta_mensal) VALUES (TRUE, 0)
  ON CONFLICT (id) DO NOTHING;
