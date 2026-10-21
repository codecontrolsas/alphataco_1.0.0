-- RLS por permiso, variante con varios permisos alternativos ('modulo:tab:accion'): alcanza con tener alguno. Sirve para
-- tablas cuyas acciones piden create, update o delete segun la operacion.
CREATE OR REPLACE FUNCTION public.app_require_any_permission_for_writes(p_table regclass, p_perms text[])
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_check text;
BEGIN
  SELECT string_agg(format('public.app_has_permission(%L, %L, %L)', split_part(p, ':', 1), split_part(p, ':', 2), split_part(p, ':', 3)), ' OR ')
    INTO v_check FROM unnest(p_perms) AS p;
  EXECUTE format('DROP POLICY IF EXISTS perm_write_insert ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS perm_write_update ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS perm_write_delete ON %s', p_table);
  EXECUTE format('CREATE POLICY perm_write_insert ON %s AS RESTRICTIVE FOR INSERT WITH CHECK (%s)', p_table, v_check);
  EXECUTE format('CREATE POLICY perm_write_update ON %s AS RESTRICTIVE FOR UPDATE USING (%s) WITH CHECK (%s)', p_table, v_check, v_check);
  EXECUTE format('CREATE POLICY perm_write_delete ON %s AS RESTRICTIVE FOR DELETE USING (%s)', p_table, v_check);
END
$function$;

-- Cuentas y conceptos de tesoreria: solo se escriben desde la configuracion de tesoreria.
SELECT public.app_require_any_permission_for_writes('public.treasury_accounts',
  ARRAY['tesoreria:config-tesoreria:create', 'tesoreria:config-tesoreria:update', 'tesoreria:config-tesoreria:delete']);
SELECT public.app_require_any_permission_for_writes('public.treasury_concepts',
  ARRAY['tesoreria:config-tesoreria:create', 'tesoreria:config-tesoreria:update', 'tesoreria:config-tesoreria:delete']);

-- Regimenes de retencion: solo se escriben desde la configuracion de compras.
SELECT public.app_require_any_permission_for_writes('public.withholding_regimes', ARRAY['compras:config-compras:update']);
SELECT public.app_require_any_permission_for_writes('public.purchase_expense_categories', ARRAY['compras:config-compras:update']);
SELECT public.app_require_any_permission_for_writes('public.supplier_categories', ARRAY['compras:config-compras:update']);

-- Limite de salida directa de almacenes: solo desde la configuracion de almacenes.
SELECT public.app_require_any_permission_for_writes('public.warehouse_settings', ARRAY['almacenes:config-almacen:update']);
