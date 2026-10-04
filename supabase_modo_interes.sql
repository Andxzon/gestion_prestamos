-- Ejecutar en Supabase SQL Editor antes de desplegar la app.
-- Los préstamos existentes quedan como mensuales para conservar su cálculo actual.
ALTER TABLE public.prestamo
  ADD COLUMN IF NOT EXISTS modo_interes text NOT NULL DEFAULT 'mensual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prestamo_modo_interes_check'
      AND conrelid = 'public.prestamo'::regclass
  ) THEN
    ALTER TABLE public.prestamo
      ADD CONSTRAINT prestamo_modo_interes_check
      CHECK (modo_interes IN ('fijo', 'mensual'));
  END IF;
END
$$;

COMMENT ON COLUMN public.prestamo.modo_interes IS
  'fijo: porcentaje total por todo el plazo; mensual: porcentaje aplicado cada mes';
