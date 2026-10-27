-- Configuración de la instancia (ticket 807): pares clave/valor globales, SIN company_id. Primera clave:
-- `max_companies` (cuántas empresas puede tener la instancia; por defecto 1).
--
-- Igual que las tablas públicas (20261027120000_public_tables_read_only): la app (`alphataco_app`) solo LEE;
-- la escriben el dueño (migraciones, psql de mantenimiento) y el rol de sistema (seed, panel de administración
-- externo). Sin RLS: no hay datos por empresa.
CREATE TABLE IF NOT EXISTS public.instance_settings (
  key         text        PRIMARY KEY,
  value       jsonb       NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.instance_settings IS
  'Configuración global de la instancia (clave/valor). La app solo lee; la escriben el dueño o el rol de sistema.';

INSERT INTO public.instance_settings (key, value, description)
VALUES ('max_companies', '1'::jsonb, 'Cantidad máxima de empresas que se pueden crear en la instancia (entero >= 1).')
ON CONFLICT (key) DO NOTHING;

-- Los default privileges del esquema le dan escritura a la app sobre toda tabla nueva: se la quita.
-- Tolerante: si los roles no existen o quien migra no puede revocar, avisa y sigue.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alphataco_app') THEN
    GRANT SELECT ON public.instance_settings TO alphataco_app;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.instance_settings FROM alphataco_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alphataco_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.instance_settings TO alphataco_system;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'No se pudieron ajustar los permisos de instance_settings (sin permiso).';
END
$$;
