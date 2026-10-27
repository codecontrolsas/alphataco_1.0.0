-- Portal de empleados, fase 1 (ticket 804): acceso del empleado otorgado por RR.HH. desde el legajo.
-- 1. Tablas `employee_portal_access` (estado del acceso por legajo) y `employee_portal_access_events` (bitacora).
-- 2. Contexto por empleado: `app_current_employee_id()` + helper `app_enable_employee_self` (mismo texto que
--    prisma/sql/tenant.sql). Primera politica restrictiva por actor: admitida fuera de los lotes de P2-C por la decision D8
--    del blueprint (docs/arquitectura/BLUEPRINT-PORTAL-EMPLEADOS-Y-HSE.md) y la regla de migraciones.
-- 3. Permisos: accion `portal_access` y tab `empleados:portal_empleado` (hija de detalle-empleado), solo para los 3 roles
--    de acceso completo.

-- ── 1. Tablas ────────────────────────────────────────────────────────────────────────────────
CREATE TYPE "portal_access_status" AS ENUM ('enabled', 'disabled');
CREATE TYPE "portal_access_method" AS ENUM ('invitation', 'temporary_password', 'existing_account');
CREATE TYPE "portal_access_event_action" AS ENUM ('enabled', 'disabled', 'invitation_sent', 'temporary_password_issued');

CREATE TABLE "employee_portal_access" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "employee_id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "status" "portal_access_status" NOT NULL,
    "method" "portal_access_method" NOT NULL,
    "created_credential" BOOLEAN NOT NULL DEFAULT false,
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_by" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_portal_access_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "employee_portal_access_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT app_current_company_id(),
    "employee_id" UUID NOT NULL,
    "action" "portal_access_event_action" NOT NULL,
    "performed_by" UUID NOT NULL,
    "detail" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_portal_access_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "employee_portal_access_employee_key" ON "employee_portal_access"("employee_id");
CREATE INDEX "idx_employee_portal_access_company_id" ON "employee_portal_access"("company_id");
CREATE INDEX "idx_employee_portal_access_credential_id" ON "employee_portal_access"("credential_id");
CREATE INDEX "idx_employee_portal_access_events_company_id" ON "employee_portal_access_events"("company_id");
CREATE INDEX "idx_employee_portal_access_events_employee" ON "employee_portal_access_events"("employee_id", "created_at" DESC);
ALTER TABLE "employee_portal_access" ADD CONSTRAINT "employee_portal_access_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_portal_access_events" ADD CONSTRAINT "employee_portal_access_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. Contexto por empleado y RLS ───────────────────────────────────────────────────────────
-- function app_current_actor_kind: se agrega `employee` a los valores documentados (la funcion no cambia).
COMMENT ON FUNCTION public.app_current_actor_kind() IS 'user | operator | employee | guest | api | job; NULL si no se fijo';

-- function app_current_employee_id: legajo de la sesion (portal de empleados); NULL si no se fijo.
-- Lo fija la app con set_config('app.employee_id', ..., true) cuando la sesion (no anonima) tiene un legajo vinculado de
-- la empresa activa. Nunca sale de un dato del cliente: lo resuelve `getTenantContext()` desde `profile.employee_id`.
CREATE OR REPLACE FUNCTION public.app_current_employee_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT nullif(current_setting('app.employee_id', true), '')::uuid
$function$;

-- function app_enable_employee_self: capa RESTRICTIVA por empleado, que se SUMA (AND) a `tenant_isolation`.
-- Para tablas con filas de un empleado (`p_column`): una fila se lee solo si es del legajo de la transaccion o si el
-- usuario tiene el permiso de lectura del dashboard (`'modulo:tab:accion'`). Escribir exige el permiso de escritura; con
-- `p_self_write` el empleado tambien puede escribir SUS filas (aceptaciones, intentos, lecturas de HSE).
-- Falla cerrada: sin `app.employee_id` y sin permiso no se ve ninguna fila, aunque la action se olvide de filtrar.
-- Los `(SELECT ...)` hacen que la funcion se evalue una vez por consulta (initplan) y no una vez por fila.
-- Llamarla DESPUES de `app_enable_tenant_isolation`: una politica restrictiva sola no deja pasar nada.
CREATE OR REPLACE FUNCTION public.app_enable_employee_self(
  p_table regclass,
  p_read_perm text,
  p_write_perm text,
  p_column text DEFAULT 'employee_id',
  p_self_write boolean DEFAULT false
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_self text := format('%I = (SELECT public.app_current_employee_id())', p_column);
  v_read text := format('(SELECT public.app_has_permission(%L, %L, %L))',
    split_part(p_read_perm, ':', 1), split_part(p_read_perm, ':', 2), split_part(p_read_perm, ':', 3));
  v_write text := format('(SELECT public.app_has_permission(%L, %L, %L))',
    split_part(p_write_perm, ':', 1), split_part(p_write_perm, ':', 2), split_part(p_write_perm, ':', 3));
  v_read_check text := format('(%s OR %s)', v_self, v_read);
  v_write_check text := CASE WHEN p_self_write THEN format('(%s OR %s)', v_self, v_write) ELSE v_write END;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a WHERE a.attrelid = p_table AND a.attname = p_column AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'La tabla % no tiene columna %', p_table, p_column;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE format('%I.%I', schemaname, tablename)::regclass = p_table AND policyname = 'tenant_isolation') THEN
    RAISE EXCEPTION 'La tabla % no tiene tenant_isolation: llamar antes a app_enable_tenant_isolation', p_table;
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS employee_self_select ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS employee_self_insert ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS employee_self_update ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS employee_self_delete ON %s', p_table);
  EXECUTE format('CREATE POLICY employee_self_select ON %s AS RESTRICTIVE FOR SELECT USING %s', p_table, v_read_check);
  EXECUTE format('CREATE POLICY employee_self_insert ON %s AS RESTRICTIVE FOR INSERT WITH CHECK (%s)', p_table, v_write_check);
  EXECUTE format('CREATE POLICY employee_self_update ON %s AS RESTRICTIVE FOR UPDATE USING (%s) WITH CHECK (%s)', p_table, v_write_check, v_write_check);
  EXECUTE format('CREATE POLICY employee_self_delete ON %s AS RESTRICTIVE FOR DELETE USING (%s)', p_table, v_write_check);
END
$function$;

SELECT public.app_enable_tenant_isolation('public.employee_portal_access');
SELECT public.app_enable_tenant_isolation('public.employee_portal_access_events');
-- El empleado lee su propia fila (estado de su acceso) pero no la escribe: habilitar o revocar es de RR.HH.
SELECT public.app_enable_employee_self('public.employee_portal_access',
  'empleados:portal_empleado:view', 'empleados:portal_empleado:portal_access');
SELECT public.app_enable_employee_self('public.employee_portal_access_events',
  'empleados:portal_empleado:view', 'empleados:portal_empleado:portal_access');

-- ── 3. Permisos ──────────────────────────────────────────────────────────────────────────────
INSERT INTO actions (slug, name, description)
VALUES ('portal_access', 'Habilitar portal', 'Habilitar o deshabilitar el acceso del empleado al portal')
ON CONFLICT (slug) DO NOTHING;

-- El módulo de Empleados y su pestaña padre los siembra `npm run db:seed` desde permissions-map.ts: en una base
-- recién migrada (sin seed) todavía no existen y la inserción se omite; el seed crea la pestaña igual.
INSERT INTO tabs (id, module_id, slug, name, description, order_index, parent_tab_id)
SELECT '9bd3625c-4245-4428-b2cf-fec178038f90', '3c54a757-162c-4afc-8ea5-dca462f92e0c', 'portal_empleado',
  'Portal del empleado', 'Acceso del empleado al portal: estado, invitación y bitácora', 5,
  '20000000-0000-0000-0000-000000000006'
WHERE EXISTS (SELECT 1 FROM modules WHERE id = '3c54a757-162c-4afc-8ea5-dca462f92e0c')
  AND EXISTS (SELECT 1 FROM tabs WHERE id = '20000000-0000-0000-0000-000000000006')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, tab_id, action_id)
SELECT r.id, '9bd3625c-4245-4428-b2cf-fec178038f90'::uuid, a.id
FROM roles r
JOIN actions a ON a.slug IN ('view', 'portal_access')
WHERE r.slug IN ('admin', 'administrador', 'full-access-provisional')
  AND EXISTS (SELECT 1 FROM tabs WHERE id = '9bd3625c-4245-4428-b2cf-fec178038f90')
ON CONFLICT (role_id, tab_id, action_id) DO NOTHING;
