-- Dominio: modules — control de módulos por instancia y por empresa (F3 de la sala de control).
--
-- Estado: `instance_modules` (lo que contrató la instancia) y `company_modules` (lo que una empresa apaga). Encendido
-- efectivo de una clave para una empresa = `nucleo` O (fila de instancia encendida Y ninguna fila de la empresa apagada).
-- SIN FILA = APAGADO: un módulo nuevo entra oculto en todas las instancias. El catálogo (claves, dependencias, pestañas)
-- vive en código (`src/features/Modules/catalog.ts`); acá solo está la pertenencia pestaña → clave (`module_tab_owners`,
-- la escribe `scripts/sync-module-catalog.ts`).
--
-- Las tablas de estado no se abren a `alphataco_app` (REVOKE + RLS sin políticas): la app las lee por estas funciones
-- SECURITY DEFINER. Las escribe el rol de sistema (API de administración, scripts) o el dueño (migraciones).

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
