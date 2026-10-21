-- RLS del nucleo: empleados, equipos, pedidos, contactos, contratos, membresias, empresa y perfiles.
-- Inerte mientras la app conecte como el usuario duenio de las tablas; rige para alphataco_app.

-- function app_current_profile_id: `profile.id` del usuario de la transaccion (app.user_id = profile.credential_id).
-- SECURITY DEFINER: se usa dentro de politicas de `profile` y de `share_company_users`, que no pueden consultarse a si
-- mismas sin recursion.
CREATE OR REPLACE FUNCTION public.app_current_profile_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT p.id FROM public.profile p WHERE p.credential_id = public.app_current_user_id() LIMIT 1
$function$;

-- function app_profile_in_current_company: el profile pertenece a la empresa activa (miembro activo, dueno o empleado
-- vinculado). Misma regla que `canUseCompanyAsTenant()`. SECURITY DEFINER por la misma razon.
CREATE OR REPLACE FUNCTION public.app_profile_in_current_company(p_profile uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT p_profile IS NOT NULL AND public.app_current_company_id() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.share_company_users s
      WHERE s.profile_id = p_profile AND s.company_id = public.app_current_company_id() AND s.is_active
    )
    OR EXISTS (SELECT 1 FROM public.company c WHERE c.owner_id = p_profile AND c.id = public.app_current_company_id())
    OR EXISTS (
      SELECT 1 FROM public.profile p JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = p_profile AND e.company_id = public.app_current_company_id()
    )
  )
$function$;

-- Tablas directas (company_id NOT NULL desde company_id_default_and_not_null). Si alguna quedo nullable en una instancia
-- con filas huerfanas, se avisa y se sigue: quedara sin RLS hasta completarlas.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employees', 'vehicles', 'preparte', 'companies_employees', 'contacts', 'customer_services']
  LOOP
    BEGIN
      PERFORM public.app_enable_tenant_isolation(format('public.%I', t)::regclass);
    EXCEPTION WHEN raise_exception THEN
      RAISE WARNING 'RLS de % omitido: %', t, SQLERRM;
    END;
  END LOOP;
END
$$;

-- Membresias: se ven las de la empresa activa y las propias (para listar "mis empresas"); se escriben solo las de la
-- empresa activa (crear una empresa nueva corre con el cliente de sistema).
ALTER TABLE public.share_company_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.share_company_users;
DROP POLICY IF EXISTS membership_read ON public.share_company_users;
DROP POLICY IF EXISTS membership_insert ON public.share_company_users;
DROP POLICY IF EXISTS membership_update ON public.share_company_users;
DROP POLICY IF EXISTS membership_delete ON public.share_company_users;
CREATE POLICY membership_read ON public.share_company_users FOR SELECT
  USING (company_id = public.app_current_company_id() OR profile_id = public.app_current_profile_id());
CREATE POLICY membership_insert ON public.share_company_users FOR INSERT
  WITH CHECK (company_id = public.app_current_company_id());
CREATE POLICY membership_update ON public.share_company_users FOR UPDATE
  USING (company_id = public.app_current_company_id()) WITH CHECK (company_id = public.app_current_company_id());
CREATE POLICY membership_delete ON public.share_company_users FOR DELETE
  USING (company_id = public.app_current_company_id());

-- Empresa: se ve la activa y las que el usuario puede usar (selector de empresa); se edita solo la activa; alta y baja
-- las hace el sistema.
ALTER TABLE public.company ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_read ON public.company;
DROP POLICY IF EXISTS company_update ON public.company;
CREATE POLICY company_read ON public.company FOR SELECT
  USING (id = public.app_current_company_id() OR id = ANY (public.app_accessible_company_ids()));
CREATE POLICY company_update ON public.company FOR UPDATE
  USING (id = public.app_current_company_id()) WITH CHECK (id = public.app_current_company_id());

-- Perfiles: el propio y los de quienes pertenecen a la empresa activa; se edita lo mismo; el alta exige empresa activa
-- (invitar a un usuario); la baja la hace el sistema.
ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profile_read ON public.profile;
DROP POLICY IF EXISTS profile_insert ON public.profile;
DROP POLICY IF EXISTS profile_update ON public.profile;
CREATE POLICY profile_read ON public.profile FOR SELECT
  USING (credential_id = public.app_current_user_id() OR public.app_profile_in_current_company(id));
CREATE POLICY profile_insert ON public.profile FOR INSERT
  WITH CHECK (public.app_current_company_id() IS NOT NULL);
CREATE POLICY profile_update ON public.profile FOR UPDATE
  USING (credential_id = public.app_current_user_id() OR public.app_profile_in_current_company(id))
  WITH CHECK (credential_id = public.app_current_user_id() OR public.app_profile_in_current_company(id));
