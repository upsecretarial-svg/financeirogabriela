
CREATE TABLE public.payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','vencido','agendado','cancelado')),
  codigo_barras TEXT,
  anexo_path TEXT,
  observacoes TEXT,
  paid_by UUID,
  paid_by_name TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payables TO authenticated;
GRANT ALL ON public.payables TO service_role;

ALTER TABLE public.payables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read payables" ON public.payables FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert payables" ON public.payables FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update payables" ON public.payables FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin delete payables" ON public.payables FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX idx_payables_status ON public.payables(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_payables_venc ON public.payables(data_vencimento) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.payables_calc_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('cancelado','agendado') THEN
    IF NEW.data_pagamento IS NOT NULL THEN
      NEW.status := 'pago';
    ELSIF NEW.data_vencimento < CURRENT_DATE THEN
      NEW.status := 'vencido';
    ELSE
      NEW.status := 'pendente';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_payables_status
BEFORE INSERT OR UPDATE ON public.payables
FOR EACH ROW EXECUTE FUNCTION public.payables_calc_status();

CREATE OR REPLACE FUNCTION public.payables_set_paid_by()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE u uuid; nm text;
BEGIN
  IF NEW.data_pagamento IS NOT NULL AND (OLD.data_pagamento IS NULL OR NEW.paid_by IS NULL) THEN
    u := auth.uid();
    IF u IS NOT NULL THEN
      NEW.paid_by := u;
      SELECT nome INTO nm FROM public.profiles WHERE id = u;
      NEW.paid_by_name := COALESCE(nm, (SELECT email FROM public.profiles WHERE id = u));
    END IF;
  ELSIF NEW.data_pagamento IS NULL THEN
    NEW.paid_by := NULL;
    NEW.paid_by_name := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_payables_paid_by
BEFORE UPDATE ON public.payables
FOR EACH ROW EXECUTE FUNCTION public.payables_set_paid_by();
