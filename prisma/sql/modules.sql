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
-- CTE MATERIALIZED evalúa las claves encendidas UNA vez por llamada (sin MATERIALIZED, Postgres lo inlinea y llama a
-- `app_enabled_modules` por cada fila: ~7 ms por llamada en vez de décimas).
CREATE OR REPLACE FUNCTION public.app_disabled_tab_ids(p_company uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  WITH enabled AS MATERIALIZED (SELECT public.app_enabled_modules(p_company) AS keys)
  SELECT DISTINCT o.tab_id
  FROM public.module_tab_owners o, enabled e
  WHERE NOT (o.module_key = ANY (e.keys))
$function$;

-- function app_modules_gate: ¿la compuerta de módulos deja pasar? TODAS las claves de `p_all` encendidas y, si `p_any` no
-- está vacío, AL MENOS UNA de `p_any`, para la empresa de la transacción (F3.4). Lee el estado UNA vez por llamada.
-- Lo usan las políticas `module_gate` dentro de un `(SELECT …)`, así que el planner la evalúa como initplan: una vez por
-- consulta, no por fila. En plpgsql y sin SECURITY DEFINER a propósito: envolver `app_enabled_modules` (ya SECURITY DEFINER)
-- en otra SQL SECURITY DEFINER costaba ~0,33 ms por llamada contra ~0,035 ms así (medido con 1000 llamadas).
CREATE OR REPLACE FUNCTION public.app_modules_gate(p_all text[], p_any text[] DEFAULT '{}')
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_keys text[] := public.app_enabled_modules(public.app_current_company_id());
BEGIN
  RETURN p_all <@ v_keys AND (cardinality(p_any) = 0 OR p_any && v_keys);
END
$function$;

-- function app_enable_module_gate: compuerta de RLS por módulo para una tabla (F3.4). Agrega la política RESTRICTIVA
-- `module_gate` (se suma con AND a la de empresa): con el módulo apagado para la empresa de la transacción, la app no ve
-- ni escribe filas de la tabla. `alphataco_system` (BYPASSRLS) y el dueño de las tablas no pasan por ella.
--   p_all: claves que tienen que estar TODAS encendidas (casi siempre la clave dueña).
--   p_any: si no está vacío, además al menos una de estas (tablas compartidas por dos módulos).
-- Falla si la tabla no tiene una política PERMISIVA de empresa (`tenant_isolation` o la de catálogo mixto): una
-- RESTRICTIVA sola no deja pasar nada. Las tablas sin RLS (plantillas globales) van en `UNGATED_TABLES` del catálogo.
-- Los lotes son migraciones con `SELECT public.app_enable_module_gate(...)`; nada de políticas escritas a mano.
CREATE OR REPLACE FUNCTION public.app_enable_module_gate(p_table regclass, p_all text[] DEFAULT '{}', p_any text[] DEFAULT '{}')
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_expr text;
BEGIN
  IF cardinality(p_all) + cardinality(p_any) = 0 THEN
    RAISE EXCEPTION 'La compuerta de % necesita al menos una clave de módulo', p_table;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE format('%I.%I', schemaname, tablename)::regclass = p_table AND permissive = 'PERMISSIVE'
  ) THEN
    RAISE EXCEPTION 'La tabla % no tiene política de empresa: la compuerta de módulo no puede ir sola', p_table;
  END IF;
  v_expr := format('(SELECT public.app_modules_gate(%L::text[], %L::text[]))', p_all, p_any);
  EXECUTE format('DROP POLICY IF EXISTS module_gate ON %s', p_table);
  EXECUTE format('CREATE POLICY module_gate ON %s AS RESTRICTIVE FOR ALL USING (%s) WITH CHECK (%s)', p_table, v_expr, v_expr);
END
$function$;
