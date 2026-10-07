-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.cliente (
  id_cliente bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nombre text NOT NULL,
  telefono text NOT NULL,
  direccion text NOT NULL,
  documento text UNIQUE,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cliente_pkey PRIMARY KEY (id_cliente)
);
CREATE TABLE public.referencia (
  id_cliente bigint NOT NULL,
  nombre text NOT NULL,
  telefono text NOT NULL,
  parentesco text NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT referencia_pkey PRIMARY KEY (id_cliente, nombre),
  CONSTRAINT referencia_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente)
);
CREATE TABLE public.prestamo (
  id_prestamo bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_cliente bigint NOT NULL,
  monto numeric NOT NULL CHECK (monto > 0::numeric),
  tasa_interes numeric NOT NULL CHECK (tasa_interes >= 0::numeric),
  tipo_interes text NOT NULL CHECK (tipo_interes = ANY (ARRAY['simple'::text, 'compuesto'::text])),
  fecha_inicio date NOT NULL DEFAULT CURRENT_DATE,
  plazo_semanas integer NOT NULL CHECK (plazo_semanas > 0),
  comision numeric NOT NULL DEFAULT 0 CHECK (comision >= 0::numeric),
  comision_modo text NOT NULL DEFAULT 'descontada'::text CHECK (comision_modo = ANY (ARRAY['descontada'::text, 'sumada'::text])),
  tasa_mora numeric CHECK (tasa_mora >= 0::numeric),
  dias_gracia integer NOT NULL DEFAULT 0 CHECK (dias_gracia >= 0),
  estado text NOT NULL DEFAULT 'activo'::text CHECK (estado = ANY (ARRAY['activo'::text, 'pagado'::text])),
  updated_at timestamp with time zone DEFAULT now(),
  modo_interes text NOT NULL DEFAULT 'mensual'::text CHECK (modo_interes = ANY (ARRAY['fijo'::text, 'mensual'::text])),
  CONSTRAINT prestamo_pkey PRIMARY KEY (id_prestamo),
  CONSTRAINT prestamo_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.cliente(id_cliente)
);
CREATE TABLE public.cuota (
  id_prestamo bigint NOT NULL,
  numero_cuota integer NOT NULL,
  fecha_vencimiento date NOT NULL,
  valor_cuota numeric NOT NULL CHECK (valor_cuota > 0::numeric),
  estado text NOT NULL DEFAULT 'pendiente'::text CHECK (estado = ANY (ARRAY['pendiente'::text, 'parcial'::text, 'pagada'::text])),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cuota_pkey PRIMARY KEY (id_prestamo, numero_cuota),
  CONSTRAINT cuota_id_prestamo_fkey FOREIGN KEY (id_prestamo) REFERENCES public.prestamo(id_prestamo)
);
CREATE TABLE public.pago (
  id_pago bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_prestamo bigint NOT NULL,
  numero_cuota integer NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  valor numeric NOT NULL CHECK (valor >= 0::numeric),
  a_mora numeric NOT NULL DEFAULT 0 CHECK (a_mora >= 0::numeric),
  a_interes numeric NOT NULL DEFAULT 0 CHECK (a_interes >= 0::numeric),
  a_capital numeric NOT NULL DEFAULT 0 CHECK (a_capital >= 0::numeric),
  nota text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pago_pkey PRIMARY KEY (id_pago),
  CONSTRAINT pago_id_prestamo_numero_cuota_fkey FOREIGN KEY (id_prestamo) REFERENCES public.cuota(id_prestamo),
  CONSTRAINT pago_id_prestamo_numero_cuota_fkey FOREIGN KEY (numero_cuota) REFERENCES public.cuota(numero_cuota)
);