-- F3.1 · Control de módulos por instancia y por empresa (blueprint `BLUEPRINT-F3-CONTROL-DE-MODULOS.md`, §5.1 y §7).
--
-- 1. Estado: `instance_modules`, `company_modules`, `module_change_log` (auditoría, solo INSERT) y `module_tab_owners`
--    (pertenencia pestaña → clave, la sincroniza `scripts/sync-module-catalog.ts`). SIN FILA = APAGADO.
-- 2. Funciones `app_enabled_modules`, `app_module_enabled` y `app_disabled_tab_ids` (copia de prisma/sql/modules.sql).
-- 3. `get_user_permissions` excluye las pestañas de las claves apagadas (copia de prisma/sql/permissions.sql).
-- 4. Línea de base: SOLO si la base ya tiene empresas (una instancia desplegada) se encienden las claves que hoy se ven,
--    salvo `hse` y `portal` (pedido del usuario: un módulo nuevo entra oculto, también los ya implementados). En una
--    base recién migrada (sin empresas, sin seed) no se escribe nada: todo queda apagado salvo el núcleo, y lo
--    contratado se enciende por la API de administración (o `scripts/enable-all-modules.ts` en dev, CI y e2e).
--
-- Tolerante a una base vacía: no depende de que existan pestañas, roles ni empresas.

CREATE TABLE "instance_modules" (
    "module_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "instance_modules_pkey" PRIMARY KEY ("module_key"),
    CONSTRAINT "instance_modules_not_core" CHECK ("module_key" <> 'nucleo')
);

CREATE TABLE "company_modules" (
    "company_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "company_modules_pkey" PRIMARY KEY ("company_id","module_key"),
    CONSTRAINT "company_modules_not_core" CHECK ("module_key" <> 'nucleo')
);

CREATE TABLE "module_change_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "company_id" UUID,
    "module_key" TEXT NOT NULL,
    "from_enabled" BOOLEAN,
    "to_enabled" BOOLEAN NOT NULL,
    "cause" TEXT NOT NULL,
    "actor_email" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_change_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "module_change_log_scope_check" CHECK ("scope" IN ('instance', 'company')),
    CONSTRAINT "module_change_log_cause_check" CHECK ("cause" IN ('requested', 'cascade', 'dependency')),
    CONSTRAINT "module_change_log_origin_check" CHECK ("origin" IN ('taskapp', 'script', 'migration'))
);

CREATE TABLE "module_tab_owners" (
    "tab_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,

    CONSTRAINT "module_tab_owners_pkey" PRIMARY KEY ("tab_id","module_key")
);

CREATE INDEX "module_change_log_created_at_idx" ON "module_change_log"("created_at" DESC);
CREATE INDEX "module_change_log_request_id_idx" ON "module_change_log"("request_id");

ALTER TABLE "company_modules" ADD CONSTRAINT "company_modules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "module_change_log" ADD CONSTRAINT "module_change_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "module_tab_owners" ADD CONSTRAINT "module_tab_owners_tab_id_fkey" FOREIGN KEY ("tab_id") REFERENCES "tabs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La app no lee ni escribe el estado: RLS habilitada SIN políticas (cero filas para un rol sin BYPASSRLS) y, además,
-- sin privilegios (los default privileges del esquema le daban escritura a toda tabla nueva). Lee por las funciones
-- SECURITY DEFINER de abajo. El rol de sistema (BYPASSRLS) y el dueño escriben.
ALTER TABLE "instance_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "module_change_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "module_tab_owners" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alphataco_app') THEN
    REVOKE ALL ON public.instance_modules, public.company_modules, public.module_change_log, public.module_tab_owners
      FROM alphataco_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alphataco_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.instance_modules, public.company_modules, public.module_tab_owners
      TO alphataco_system;
    -- La auditoría es solo de alta: ni el rol de sistema la corrige ni la borra.
    GRANT SELECT, INSERT ON public.module_change_log TO alphataco_system;
    REVOKE UPDATE, DELETE, TRUNCATE ON public.module_change_log FROM alphataco_system;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'No se pudieron ajustar los permisos de las tablas de control de módulos (sin permiso).';
END
$$;

-- ── prisma/sql/modules.sql ──
-- function app_enabled_modules: claves encendidas para una empresa (o solo las de la instancia si p_company es NULL).
-- Única fórmula: la usan la app, get_user_permissions y la RLS por módulo (F3.4).
-- Sin lecturas cruzadas: con un rol sin BYPASSRLS (la app) y una empresa en el contexto de la transacción, pedir OTRA
-- empresa devuelve solo `nucleo` (falla cerrada). Los jobs y el panel usan el rol de sistema.
CREATE OR REPLACE FUNCTION public.app_enabled_modules(p_company uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT CASE
    WHEN p_company IS NOT NULL
     AND public.app_current_company_id() IS NOT NULL
     AND p_company <> public.app_current_company_id()
     AND NOT coalesce((SELECT r.rolbypassrls FROM pg_catalog.pg_roles r WHERE r.rolname = session_user), false)
      THEN ARRAY['nucleo']::text[]
    ELSE ARRAY['nucleo']::text[] || coalesce((
      SELECT array_agg(im.module_key ORDER BY im.module_key)
      FROM public.instance_modules im
      WHERE im.enabled
        AND NOT EXISTS (
          SELECT 1 FROM public.company_modules cm
          WHERE cm.company_id = p_company AND cm.module_key = im.module_key AND NOT cm.enabled
        )
    ), '{}'::text[])
  END
$function$;

-- function app_module_enabled: ¿la clave está encendida para la empresa de la transacción? (la usa la RLS por módulo).
CREATE OR REPLACE FUNCTION public.app_module_enabled(p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT p_key = ANY (public.app_enabled_modules(public.app_current_company_id()))
$function$;

-- function app_disabled_tab_ids: pestañas apagadas para la empresa (alguna clave que la habilita no está encendida).
-- `module_tab_owners` ya trae la herencia expandida (una fila por cada clave del nodo y de sus ancestros). El
-- CTE evalúa las claves encendidas UNA vez por llamada, no por fila.
CREATE OR REPLACE FUNCTION public.app_disabled_tab_ids(p_company uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  WITH enabled AS (SELECT public.app_enabled_modules(p_company) AS keys)
  SELECT DISTINCT o.tab_id
  FROM public.module_tab_owners o, enabled e
  WHERE NOT (o.module_key = ANY (e.keys))
$function$;

-- ── prisma/sql/permissions.sql: get_user_permissions ──
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id uuid, p_company_id uuid)
 RETURNS TABLE(module_id uuid, module_slug text, module_name text, tab_id uuid, tab_slug text, tab_name text, action_id uuid, action_slug text, action_name text, source text, is_granted boolean, role_id bigint, role_name text, role_color text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    RETURN QUERY
    WITH user_role_permissions AS (
        -- Get permissions from user's roles
        SELECT DISTINCT
            m.id as module_id,
            m.slug as module_slug,
            m.name as module_name,
            t.id as tab_id,
            t.slug as tab_slug,
            t.name as tab_name,
            a.id as action_id,
            a.slug as action_slug,
            a.name as action_name,
            'role' as source,
            true as is_granted,
            r.id as role_id,
            r.name as role_name,
            r.color as role_color
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        JOIN public.role_permissions rp ON ur.role_id = rp.role_id
        JOIN public.tabs t ON rp.tab_id = t.id
        JOIN public.modules m ON t.module_id = m.id
        JOIN public.actions a ON rp.action_id = a.id
        WHERE ur.user_id = p_user_id
            AND ur.company_id = p_company_id
            AND m.is_active = true
            AND t.is_active = true
            AND r.is_active = true
            -- F3: pestañas de módulos apagados en la instancia o en la empresa (una evaluación por llamada).
            AND t.id NOT IN (SELECT public.app_disabled_tab_ids(p_company_id))
    ),
    user_custom_permissions AS (
        -- Get custom permissions (overrides)
        SELECT
            m.id as module_id,
            m.slug as module_slug,
            m.name as module_name,
            t.id as tab_id,
            t.slug as tab_slug,
            t.name as tab_name,
            a.id as action_id,
            a.slug as action_slug,
            a.name as action_name,
            'custom' as source,
            up.is_granted,
            NULL::bigint as role_id,
            NULL::text as role_name,
            NULL::text as role_color
        FROM public.user_permissions up
        JOIN public.tabs t ON up.tab_id = t.id
        JOIN public.modules m ON t.module_id = m.id
        JOIN public.actions a ON up.action_id = a.id
        WHERE up.user_id = p_user_id
            AND up.company_id = p_company_id
            AND m.is_active = true
            AND t.is_active = true
            AND t.id NOT IN (SELECT public.app_disabled_tab_ids(p_company_id))
    )
    -- Combine both, with custom permissions taking precedence
    SELECT DISTINCT ON (
        COALESCE(ucp.module_id, urp.module_id), 
        COALESCE(ucp.tab_id, urp.tab_id), 
        COALESCE(ucp.action_id, urp.action_id)
    )
        COALESCE(ucp.module_id, urp.module_id),
        COALESCE(ucp.module_slug, urp.module_slug),
        COALESCE(ucp.module_name, urp.module_name),
        COALESCE(ucp.tab_id, urp.tab_id),
        COALESCE(ucp.tab_slug, urp.tab_slug),
        COALESCE(ucp.tab_name, urp.tab_name),
        COALESCE(ucp.action_id, urp.action_id),
        COALESCE(ucp.action_slug, urp.action_slug),
        COALESCE(ucp.action_name, urp.action_name),
        COALESCE(ucp.source, urp.source),
        COALESCE(ucp.is_granted, urp.is_granted),
        COALESCE(ucp.role_id, urp.role_id),
        COALESCE(ucp.role_name, urp.role_name),
        COALESCE(ucp.role_color, urp.role_color)
    FROM user_role_permissions urp
    FULL OUTER JOIN user_custom_permissions ucp 
        ON urp.tab_id = ucp.tab_id AND urp.action_id = ucp.action_id
    WHERE COALESCE(ucp.is_granted, urp.is_granted) = true
    ORDER BY 
        COALESCE(ucp.module_id, urp.module_id), 
        COALESCE(ucp.tab_id, urp.tab_id), 
        COALESCE(ucp.action_id, urp.action_id), 
        ucp.source NULLS LAST;
END;
$function$;


-- Línea de base (solo en una instancia que ya tiene empresas). Lista FIJA: es la foto del momento; un módulo que se
-- agregue después no tiene fila y queda apagado. `hse` y `portal` entran apagados (hoy se ven por HSE_ENABLED y
-- PORTAL_ENABLED: hay que encenderlos desde el panel si se quieren seguir mostrando).
WITH baseline AS (
  INSERT INTO public.instance_modules (module_key, enabled, changed_by, reason)
  SELECT k, k NOT IN ('hse', 'portal'), 'migration', 'Línea de base F3: estado previo de la instancia'
  FROM unnest(ARRAY[
    'empleados', 'equipos', 'documentacion', 'clientes', 'operaciones', 'certificacion', 'facturacion',
    'mantenimiento', 'gomeria', 'checklists', 'formularios', 'seleccion', 'almacenes', 'indumentaria', 'compras',
    'pagos', 'tesoreria', 'hse', 'portal', 'movil'
  ]) AS k
  WHERE EXISTS (SELECT 1 FROM public.company)
  ON CONFLICT (module_key) DO NOTHING
  RETURNING module_key, enabled
), request AS (
  SELECT gen_random_uuid() AS id
)
INSERT INTO public.module_change_log (request_id, scope, company_id, module_key, from_enabled, to_enabled, cause,
                                      actor_email, origin, reason)
SELECT request.id, 'instance', NULL, baseline.module_key, NULL, baseline.enabled, 'requested', 'migration',
       'migration', 'Línea de base F3: estado previo de la instancia'
FROM baseline, request;
