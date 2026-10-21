-- Lote L1 de RLS: catalogos y configuracion por empresa (company_id NOT NULL).
-- Es inerte mientras la app conecte como el usuario duenio de las tablas (no pasa por las politicas): el aislamiento
-- recien rige para alphataco_app. Ver docs/arquitectura/LOOP-ESTADO.md (P2-C) y docs/deploy/runbook.md.
SELECT public.app_enable_tenant_isolation('public.aptitudes_tecnicas');
SELECT public.app_enable_tenant_isolation('public.checklist_template_types');
SELECT public.app_enable_tenant_isolation('public.clothing_brands');
SELECT public.app_enable_tenant_isolation('public.clothing_sizes');
SELECT public.app_enable_tenant_isolation('public.company_positions');
SELECT public.app_enable_tenant_isolation('public.cost_center');
SELECT public.app_enable_tenant_isolation('public.covenant');
SELECT public.app_enable_tenant_isolation('public.custom_form');
SELECT public.app_enable_tenant_isolation('public.diagram_type');
SELECT public.app_enable_tenant_isolation('public.hierarchy');
SELECT public.app_enable_tenant_isolation('public.kpis');
SELECT public.app_enable_tenant_isolation('public.material_categories');
SELECT public.app_enable_tenant_isolation('public.measurement_units');
SELECT public.app_enable_tenant_isolation('public.model_vehicles');
SELECT public.app_enable_tenant_isolation('public.notification_settings');
SELECT public.app_enable_tenant_isolation('public.org_chart_positions');
SELECT public.app_enable_tenant_isolation('public.price_update_rules');
SELECT public.app_enable_tenant_isolation('public.purchase_expense_categories');
SELECT public.app_enable_tenant_isolation('public.supplier_categories');
SELECT public.app_enable_tenant_isolation('public.tire_brands');
SELECT public.app_enable_tenant_isolation('public.tire_materials');
SELECT public.app_enable_tenant_isolation('public.tire_types');
SELECT public.app_enable_tenant_isolation('public.treasury_concepts');
SELECT public.app_enable_tenant_isolation('public.type_hitch_types');
SELECT public.app_enable_tenant_isolation('public.types_of_contract');
SELECT public.app_enable_tenant_isolation('public.types_of_repairs');
SELECT public.app_enable_tenant_isolation('public.user_dashboards');
SELECT public.app_enable_tenant_isolation('public.warehouse_settings');
SELECT public.app_enable_tenant_isolation('public.withholding_regimes');
SELECT public.app_enable_tenant_isolation('public.workshop_sectors');
SELECT public.app_enable_tenant_isolation('public.workshops');
