-- #786: notificaciones por rol. Campanita en la app + el email que ya existía, configurados en el
-- editor de cada rol. Reemplaza la tabla legacy `notifications` (sin uso ni filas).

-- 1. Tabla legacy: se borra solo si está vacía. Si tuviera filas queda en la base (fuera del schema de
--    Prisma, no la usa nadie) y se avisa, en vez de frenar el deploy.
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications) THEN
    RAISE NOTICE 'La tabla legacy notifications tiene filas: se conserva para revisarla a mano';
  ELSE
    DROP TABLE public.notifications;
    DROP TYPE IF EXISTS public.notification_categories;
  END IF;
END $$;

-- 2. Estructura nueva.
CREATE TYPE "notification_channel" AS ENUM ('in_app', 'email');

CREATE TABLE "notification_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "actor_id" UUID,
    "metadata" JSONB,
    "external_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "email_status" TEXT NOT NULL DEFAULT 'none',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "in_app" BOOLEAN NOT NULL DEFAULT false,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" BIGINT NOT NULL,
    "event_key" TEXT NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_events_company_id_created_at_idx" ON "notification_events"("company_id", "created_at");
CREATE UNIQUE INDEX "notification_events_company_id_dedupe_key_key" ON "notification_events"("company_id", "dedupe_key");
CREATE INDEX "idx_notification_deliveries_user_company_created" ON "notification_deliveries"("user_id", "company_id", "created_at" DESC);
CREATE UNIQUE INDEX "notification_deliveries_event_id_user_id_key" ON "notification_deliveries"("event_id", "user_id");
-- Contador de no leídas de la campanita. Índice parcial: Prisma no lo modela (ver el comentario del modelo).
CREATE INDEX "idx_notification_deliveries_unread" ON "notification_deliveries"("user_id", "company_id") WHERE "in_app" AND "read_at" IS NULL;
CREATE INDEX "role_notifications_event_key_idx" ON "role_notifications"("event_key");
CREATE UNIQUE INDEX "role_notifications_role_id_event_key_channel_key" ON "role_notifications"("role_id", "event_key", "channel");

ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "notification_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profile"("credential_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_notifications" ADD CONSTRAINT "role_notifications_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Resolución de destinatarios (copia de prisma/sql/permissions.sql).
-- function resolve_notification_recipients (#786)
-- Destinatarios de un aviso en UNA consulta: miembros activos de la empresa con algún rol activo que
-- tenga el evento, con los canales combinados de todos sus roles, y que además tengan alguno de los
-- permisos mínimos del evento (`p_permissions` = [{module, tab, action}]). El permiso se resuelve con
-- `user_has_permission`, la fórmula canónica, así respeta también los ajustes personales.
-- `p_only_user_ids` acota a personas puntuales (avisos para quien pidió o creó un documento).
CREATE OR REPLACE FUNCTION public.resolve_notification_recipients(
  p_company_id uuid,
  p_event_key text,
  p_permissions jsonb,
  p_only_user_ids uuid[] DEFAULT NULL
)
 RETURNS TABLE(user_id uuid, email text, in_app boolean, email_enabled boolean)
 LANGUAGE sql
 STABLE
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
  SELECT c.user_id, c.email, c.in_app, c.email_enabled
  FROM (
    SELECT p.credential_id AS user_id,
           NULLIF(btrim(p.email), '') AS email,
           bool_or(rn.channel = 'in_app') AS in_app,
           bool_or(rn.channel = 'email') AS email_enabled
    FROM public.share_company_users scu
    JOIN public.profile p ON p.id = scu.profile_id AND p.credential_id IS NOT NULL
    JOIN public.user_roles ur ON ur.user_id = p.credential_id AND ur.company_id = p_company_id
    JOIN public.roles r ON r.id = ur.role_id AND COALESCE(r.is_active, true)
    JOIN public.role_notifications rn ON rn.role_id = r.id AND rn.event_key = p_event_key
    WHERE scu.company_id = p_company_id
      AND scu.is_active
      AND (p_only_user_ids IS NULL OR p.credential_id = ANY(p_only_user_ids))
    GROUP BY p.credential_id, p.email
  ) c
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_permissions) perm
    WHERE public.user_has_permission(c.user_id, p_company_id, perm->>'module', perm->>'tab', perm->>'action')
  );
$function$;

-- 4. Configuración inicial, para que nadie deje de recibir lo que recibía:
-- a) Decisiones de compras (le llegan a quien pidió o creó el documento): campanita y email en TODOS
--    los roles, como el mail de hoy, que le llegaba a cualquiera.
INSERT INTO role_notifications (role_id, event_key, channel)
SELECT r.id, e.event_key, c.channel
FROM roles r
CROSS JOIN (VALUES ('purchases.request_decided'), ('purchases.order_decided')) AS e(event_key)
CROSS JOIN (VALUES ('in_app'::notification_channel), ('email'::notification_channel)) AS c(channel)
ON CONFLICT (role_id, event_key, channel) DO NOTHING;

-- b) Resúmenes de los jobs y avisos nuevos de aprobación: solo campanita, en los 3 roles de acceso
--    completo. El mail de los jobs sigue saliendo a la lista fija de la empresa (notification_settings);
--    activarlo por rol agregaría destinatarios en silencio, así que queda a criterio de cada admin.
INSERT INTO role_notifications (role_id, event_key, channel)
SELECT r.id, e.event_key, 'in_app'::notification_channel
FROM roles r
CROSS JOIN (VALUES
  ('documents.expiry_weekly'),
  ('operations.daily_report_deviations'),
  ('warehouses.batch_expiry'),
  ('purchases.request_submitted'),
  ('purchases.order_submitted')
) AS e(event_key)
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
ON CONFLICT (role_id, event_key, channel) DO NOTHING;
