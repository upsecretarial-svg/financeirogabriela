-- Track who marked the appointment as paid
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_by_name text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Trigger: when pago flips to true, record who did it (auth.uid()) and snapshot name from profile
CREATE OR REPLACE FUNCTION public.appointments_set_paid_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  u uuid;
  nm text;
BEGIN
  IF NEW.pago = true AND (OLD.pago IS DISTINCT FROM true OR NEW.paid_by IS NULL) THEN
    u := auth.uid();
    IF u IS NOT NULL THEN
      NEW.paid_by := u;
      NEW.paid_at := COALESCE(NEW.paid_at, now());
      SELECT nome INTO nm FROM public.profiles WHERE id = u;
      NEW.paid_by_name := COALESCE(nm, (SELECT email FROM public.profiles WHERE id = u));
    END IF;
  ELSIF NEW.pago = false THEN
    NEW.paid_by := NULL;
    NEW.paid_by_name := NULL;
    NEW.paid_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_appointments_set_paid_by ON public.appointments;
CREATE TRIGGER trg_appointments_set_paid_by
  BEFORE UPDATE OF pago, valor_recebido, data_pagamento ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_set_paid_by();

-- Ensure default profile names exist for known emails
UPDATE public.profiles SET nome = 'Douglas Rodrigues' WHERE email = 'upsecretarial@gmail.com' AND (nome IS NULL OR nome = '' OR nome = 'DOUGLAS RODRIGUES');