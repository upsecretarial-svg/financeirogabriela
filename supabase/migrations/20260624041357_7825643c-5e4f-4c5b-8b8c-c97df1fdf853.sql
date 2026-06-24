
-- 1) Tabela
CREATE TABLE public.appointment_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('servico','material')),
  descricao TEXT NOT NULL,
  quantidade NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_unitario NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  valor_total NUMERIC(12,2) GENERATED ALWAYS AS (quantidade * valor_unitario) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointment_items_appointment ON public.appointment_items(appointment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_items TO authenticated;
GRANT ALL ON public.appointment_items TO service_role;

ALTER TABLE public.appointment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem itens"
  ON public.appointment_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin gerencia itens"
  ON public.appointment_items FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Autenticados criam itens"
  ON public.appointment_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND a.deleted_at IS NULL)
  );

CREATE POLICY "Autenticados editam itens"
  ON public.appointment_items FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND a.deleted_at IS NULL)
  );

CREATE POLICY "Autenticados removem itens"
  ON public.appointment_items FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND a.deleted_at IS NULL)
  );

-- 2) Recalcula appointments.valor quando há itens
CREATE OR REPLACE FUNCTION public.recalc_appointment_valor()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ap_id UUID;
  total NUMERIC(12,2);
  qtd INT;
BEGIN
  ap_id := COALESCE(NEW.appointment_id, OLD.appointment_id);
  SELECT COALESCE(SUM(valor_total), 0), COUNT(*) INTO total, qtd
    FROM public.appointment_items WHERE appointment_id = ap_id;
  IF qtd > 0 THEN
    UPDATE public.appointments SET valor = total, updated_at = now() WHERE id = ap_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_appointment_items_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.appointment_items
FOR EACH ROW EXECUTE FUNCTION public.recalc_appointment_valor();
