-- Funciones de contexto de empresa para RLS. Copia de prisma/sql/tenant.sql; ninguna politica las usa todavia.

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
