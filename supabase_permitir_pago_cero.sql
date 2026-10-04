-- Permite registrar un pago de valor 0 como constancia de inasistencia/no pago.
-- Los valores negativos siguen rechazándose.
ALTER TABLE public.pago
  DROP CONSTRAINT IF EXISTS pago_valor_check;

ALTER TABLE public.pago
  ADD CONSTRAINT pago_valor_check
  CHECK (valor >= 0);
