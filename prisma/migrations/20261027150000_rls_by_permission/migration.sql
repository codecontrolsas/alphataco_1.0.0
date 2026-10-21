-- RLS por permiso: la base decide quien puede escribir. Se agrega la funcion `app_has_permission` y las politicas
-- restrictivas de escritura, y se aplican al certificado de ARCA (clave privada y certificado de la empresa): solo quien
-- tiene el permiso de «Datos fiscales» puede crearlos, modificarlos o borrarlos, aunque una accion del servidor
-- olvidara chequearlo. Las lecturas (necesarias para facturar) quedan por empresa. Inerte mientras la app conecte
-- como el usuario duenio de las tablas.

-- function app_has_permission: el usuario de la transaccion tiene el permiso (modulo, tab, accion) en la empresa activa.
-- Es la misma regla que usa la app (`user_has_permission`: permisos del rol asignado en la empresa + permisos propios),
-- pero evaluada por la base. SECURITY DEFINER: las politicas la llaman sin recursion sobre las tablas de permisos.
CREATE OR REPLACE FUNCTION public.app_has_permission(p_module text, p_tab text, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
  SELECT public.app_current_user_id() IS NOT NULL
     AND public.app_current_company_id() IS NOT NULL
     AND public.user_has_permission(public.app_current_user_id(), public.app_current_company_id(), p_module, p_tab, p_action)
$function$;

-- function app_require_permission_for_writes: agrega politicas RESTRICTIVAS (se suman con AND a las demas) para que insertar,
-- modificar y borrar en la tabla exija un permiso. Las lecturas quedan como estaban. El sistema (BYPASSRLS) y el duenio
-- no pasan por ellas.
CREATE OR REPLACE FUNCTION public.app_require_permission_for_writes(p_table regclass, p_module text, p_tab text, p_action text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_check text := format('public.app_has_permission(%L, %L, %L)', p_module, p_tab, p_action);
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS perm_write_insert ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS perm_write_update ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS perm_write_delete ON %s', p_table);
  EXECUTE format('CREATE POLICY perm_write_insert ON %s AS RESTRICTIVE FOR INSERT WITH CHECK (%s)', p_table, v_check);
  EXECUTE format('CREATE POLICY perm_write_update ON %s AS RESTRICTIVE FOR UPDATE USING (%s) WITH CHECK (%s)', p_table, v_check, v_check);
  EXECUTE format('CREATE POLICY perm_write_delete ON %s AS RESTRICTIVE FOR DELETE USING (%s)', p_table, v_check);
END
$function$;

SELECT public.app_require_permission_for_writes('public.arca_credentials', 'configuracion', 'datos-fiscales', 'update');

-- Asignacion de roles y permisos de usuario: solo quien administra usuarios o roles puede escribirlas. Son los mismos
-- permisos que hoy chequean las acciones (detalle de usuario, gestion de roles, alta y edicion de usuarios), de modo que
-- nadie pueda darse permisos aunque una accion olvidara chequear. La lectura queda por empresa.
DO $$
DECLARE
  t text;
  v_check text := 'public.app_has_permission(''configuracion'', ''detalle-usuario'', ''update'')
    OR public.app_has_permission(''configuracion'', ''gestion-roles'', ''update'')
    OR public.app_has_permission(''configuracion'', ''usuarios-empleados'', ''create'')
    OR public.app_has_permission(''configuracion'', ''usuarios-empleados'', ''update'')';
BEGIN
  FOREACH t IN ARRAY ARRAY['user_roles', 'user_permissions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS perm_write_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS perm_write_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS perm_write_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY perm_write_insert ON public.%I AS RESTRICTIVE FOR INSERT WITH CHECK (%s)', t, v_check);
    EXECUTE format('CREATE POLICY perm_write_update ON public.%I AS RESTRICTIVE FOR UPDATE USING (%s) WITH CHECK (%s)', t, v_check, v_check);
    EXECUTE format('CREATE POLICY perm_write_delete ON public.%I AS RESTRICTIVE FOR DELETE USING (%s)', t, v_check);
  END LOOP;
END
$$;
