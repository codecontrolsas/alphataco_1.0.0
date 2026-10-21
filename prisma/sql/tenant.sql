-- Contexto de empresa para RLS (ver docs/arquitectura/MODELO-DE-TRABAJO.md y la regla de migraciones).
-- La app fija estos valores por transaccion con set_config(nombre, valor, true); nunca con SET de sesion.
-- Este archivo solo define funciones: ninguna politica RLS depende de ellas todavia.

-- function app_current_company_id: empresa activa de la transaccion; NULL si no hay (jobs, psql, seeds).
CREATE OR REPLACE FUNCTION public.app_current_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT nullif(current_setting('app.company_id', true), '')::uuid
$function$;

-- function app_current_actor_kind: user | operator | guest | api | job; NULL si no se fijo.
CREATE OR REPLACE FUNCTION public.app_current_actor_kind()
 RETURNS text
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT nullif(current_setting('app.actor_kind', true), '')
$function$;

-- function app_rls_mode: off | shadow | enforce. Sin setting = off (comportamiento actual).
CREATE OR REPLACE FUNCTION public.app_rls_mode()
 RETURNS text
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT coalesce(nullif(current_setting('app.rls_mode', true), ''), 'off')
$function$;

-- function app_accessible_company_ids: empresas que el usuario de `app.user_id` puede usar como empresa activa.
-- Misma regla que `canUseCompanyAsTenant()` (src/shared/lib/company-membership.ts):
--   owner de la empresa, miembro activo de share_company_users, o empleado vinculado al profile.
-- SECURITY DEFINER: lee company/share_company_users/employees antes de que exista empresa activa.
CREATE OR REPLACE FUNCTION public.app_accessible_company_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT coalesce(array_agg(DISTINCT c.id), '{}'::uuid[])
  FROM public.profile p
  JOIN public.company c
    ON c.owner_id = p.id
    OR EXISTS (
      SELECT 1 FROM public.share_company_users s
      WHERE s.profile_id = p.id AND s.company_id = c.id AND s.is_active
    )
    OR (
      p.employee_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = p.employee_id AND e.company_id = c.id)
    )
  WHERE p.credential_id = public.app_current_user_id()
$function$;

-- function app_enable_tenant_isolation: aislamiento por empresa para una tabla con una columna de empresa `uuid NOT NULL`
-- (`company_id`, o la que se indique: p. ej. `documents_company.applies`).
-- Habilita RLS y deja la politica `tenant_isolation` (lectura y escritura solo de la empresa activa).
-- Falla si la tabla no tiene la columna o es nullable: esos casos llevan otra politica (catalogos mixtos, herencia).
-- El duenio de la tabla y alphataco_system (BYPASSRLS) no pasan por la politica; alphataco_app si.
CREATE OR REPLACE FUNCTION public.app_enable_tenant_isolation(p_table regclass, p_column text DEFAULT 'company_id')
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_nullable boolean;
BEGIN
  SELECT NOT a.attnotnull INTO v_nullable
  FROM pg_attribute a
  WHERE a.attrelid = p_table AND a.attname = p_column AND NOT a.attisdropped;

  IF v_nullable IS NULL THEN
    RAISE EXCEPTION 'La tabla % no tiene columna %', p_table, p_column;
  ELSIF v_nullable THEN
    RAISE EXCEPTION 'La columna % de % admite NULL: usar la politica de catalogo mixto', p_column, p_table;
  END IF;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', p_table);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (%I = public.app_current_company_id()) WITH CHECK (%I = public.app_current_company_id())',
    p_table, p_column, p_column
  );
END
$function$;
