-- Controles de instancia que opera TaskApp (`/api/admin/v1/instance`): pausa del sistema, banners globales y la
-- auditoría de sus cambios. El límite de empresas ya vive en `instance_settings.max_companies` (ticket 807).
--
-- 1. Claves nuevas en `instance_settings` (clave/valor, sin empresa), todas APAGADAS: una base existente, la demo y el
--    CI no cambian de comportamiento. `max_companies` no se toca. La app solo las lee (permiso que ya tenía).
-- 2. `instance_change_log`: auditoría solo de alta. La app no la ve (RLS sin políticas y sin permisos); el rol de
--    sistema la lee y le agrega filas, nada más.
-- 3. Las empresas no se borran desde la app: se le quita al rol de la app el DELETE/TRUNCATE sobre `company` (ya no
--    tenía política de borrado, así que hoy borraba cero filas en silencio; ahora falla). El borrado es una acción de
--    soporte (dueño o rol de sistema).
--
-- Tolerante a una base vacía y a una sin los roles (avisa y sigue).

INSERT INTO public.instance_settings (key, value, description) VALUES
  ('instance_pause', '{"active": false, "message": "", "since": null}'::jsonb,
   'Pausa del sistema (modo mantenimiento): active, message (texto plano), since (ISO al activarse).'),
  ('banner_login', '{"enabled": false, "message": "", "severity": "info"}'::jsonb,
   'Banner del login y las pantallas previas a la sesión: enabled, message (máx. 280), severity info|warning|critical.'),
  ('banner_dashboard', '{"enabled": false, "message": "", "severity": "info"}'::jsonb,
   'Banner de todas las vistas del dashboard: enabled, message (máx. 280), severity info|warning|critical.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE "instance_change_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "from_value" JSONB,
    "to_value" JSONB,
    "actor_email" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instance_change_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "instance_change_log_origin_check" CHECK ("origin" IN ('taskapp', 'script', 'migration'))
);

CREATE INDEX "instance_change_log_created_at_idx" ON "instance_change_log"("created_at" DESC);
CREATE INDEX "instance_change_log_request_id_idx" ON "instance_change_log"("request_id");

COMMENT ON TABLE public.instance_change_log IS
  'Auditoría de los controles de instancia (límite de empresas, pausa, banners). Solo de alta.';

ALTER TABLE "instance_change_log" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alphataco_app') THEN
    REVOKE ALL ON public.instance_change_log FROM alphataco_app;
    REVOKE DELETE, TRUNCATE ON public.company FROM alphataco_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alphataco_system') THEN
    GRANT SELECT, INSERT ON public.instance_change_log TO alphataco_system;
    REVOKE UPDATE, DELETE, TRUNCATE ON public.instance_change_log FROM alphataco_system;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'No se pudieron ajustar los permisos de los controles de instancia (sin permiso).';
END
$$;
