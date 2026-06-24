
DROP POLICY IF EXISTS "Veterinária registra pagamentos" ON public.appointment_payments;

CREATE POLICY "Autenticados registram pagamentos"
  ON public.appointment_payments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_id AND a.deleted_at IS NULL
    )
  );
