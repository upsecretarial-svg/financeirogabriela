
ALTER TABLE public.payables
  ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES public.payment_methods(id),
  ADD COLUMN IF NOT EXISTS recorrente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recorrencia_grupo uuid,
  ADD COLUMN IF NOT EXISTS recorrencia_parcela int,
  ADD COLUMN IF NOT EXISTS recorrencia_total int;
