-- Ultimo lote de RLS con las tablas conocidas: usuarios y permisos por empresa, datos personales, contratistas y recambios de
-- pedidos de mantenimiento; y se cierran las tablas de autenticacion al rol de aplicacion.
-- Inerte mientras la app conecte como el usuario duenio de las tablas; rige para alphataco_app.

-- function app_enable_user_isolation: tabla de datos PERSONALES (preferencias, vistas): cada usuario ve y escribe solo
-- sus filas (`user_id = app_current_user_id()`), en cualquier empresa. `p_text` para columnas `text` en vez de `uuid`.
CREATE OR REPLACE FUNCTION public.app_enable_user_isolation(p_table regclass, p_column text DEFAULT 'user_id', p_text boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_expr text := CASE WHEN p_text THEN 'public.app_current_user_id()::text' ELSE 'public.app_current_user_id()' END;
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS user_isolation ON %s', p_table);
  EXECUTE format('CREATE POLICY user_isolation ON %s USING (%I = %s) WITH CHECK (%I = %s)', p_table, p_column, v_expr, p_column, v_expr);
END
$function$;

DO $$
DECLARE
  t text;
BEGIN
  -- Roles asignados, permisos y notificaciones por empresa (company_id NOT NULL).
  FOREACH t IN ARRAY ARRAY['user_roles', 'user_permissions', 'notification_deliveries']
  LOOP
    BEGIN
      PERFORM public.app_enable_tenant_isolation(format('public.%I', t)::regclass);
    EXCEPTION WHEN raise_exception THEN
      RAISE WARNING 'RLS de % omitido: %', t, SQLERRM;
    END;
  END LOOP;
END
$$;

-- Datos personales: cada usuario ve solo lo suyo.
SELECT public.app_enable_user_isolation('public.support_ticket_views');
SELECT public.app_enable_user_isolation('public.user_equipment_type_visibility');
SELECT public.app_enable_user_isolation('public.user_table_preferences', 'user_id', true);

-- Hijas: company_id derivado del padre.
SELECT public.app_add_company_id_from_parents('public.contractor_employee',
  ARRAY['contractor_id', 'employee_id'], ARRAY['public.customers', 'public.employees']::regclass[]);
SELECT public.app_add_company_id_from_parents('public.contractor_equipment',
  ARRAY['contractor_id', 'equipment_id'], ARRAY['public.customers', 'public.vehicles']::regclass[]);
SELECT public.app_add_company_id_from_parent('public.maintenance_group_type_of_repairs', 'group_id', 'public.maintenance_request_groups');
-- documents_contracts.contract_id es texto (no uuid): queda para un paso aparte.

-- Autenticacion (hashes de contrasena, sesiones, tokens): la app ya no los toca; solo el cliente de sistema.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alphataco_app') THEN
    REVOKE ALL ON public.auth_user, public.auth_account, public.auth_session, public.auth_verification FROM alphataco_app;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'No se pudieron cerrar las tablas de autenticacion al rol de aplicacion (sin permiso).';
END
$$;
