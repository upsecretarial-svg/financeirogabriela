
CREATE TABLE public.appointment_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  payment_method_id UUID NOT NULL REFERENCES public.payment_methods(id),
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  data_pagamento DATE,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointment_payments_appointment ON public.appointment_payments(appointment_id);
CREATE INDEX idx_appointment_payments_method ON public.appointment_payments(payment_method_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_payments TO authenticated;
GRANT ALL ON public.appointment_payments TO service_role;

ALTER TABLE public.appointment_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ver pagamentos"
  ON public.appointment_payments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin gerencia pagamentos"
  ON public.appointment_payments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Veterinária registra pagamentos"
  ON public.appointment_payments FOR INSERT TO authenticated WITH CHECK (true);
