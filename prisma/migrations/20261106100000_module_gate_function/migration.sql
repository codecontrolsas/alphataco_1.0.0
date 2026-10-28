-- F3.4 · Compuerta de RLS por módulo: funciones (blueprint §5.3). Copia de prisma/sql/modules.sql.
-- Los lotes que la aplican a las tablas van en las migraciones siguientes (`module_gate_lot_*`), uno por grupo de módulos,
-- cada uno desplegable por separado.

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
