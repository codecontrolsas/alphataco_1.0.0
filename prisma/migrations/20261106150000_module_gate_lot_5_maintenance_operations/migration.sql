-- F3.4 · RLS por módulo, lote 5 de 6: Mantenimiento y Operaciones (blueprint §5.3).
-- Política RESTRICTIVA `module_gate` (helper `app_enable_module_gate`, prisma/sql/modules.sql) sobre las tablas de cada
-- módulo, con las tablas del catálogo (`src/features/Modules/catalog.ts`). Con el módulo apagado para la empresa de la
-- transacción, `alphataco_app` no ve ni escribe esas filas; `alphataco_system` y el dueño de las tablas no pasan por ella.
-- Con el módulo encendido (la línea de base de la demo, dev, CI y e2e) la política deja pasar todo: es inerte.

-- mantenimiento (16 tablas)
SELECT public.app_enable_module_gate('public.maintenance_activity_log', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.maintenance_group_type_of_repairs', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.maintenance_order_item_repair_types', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.maintenance_order_items', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.maintenance_orders', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.maintenance_request_groups', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.maintenance_request_items', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.maintenance_requests', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.sector_repair_types', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.types_of_repairs', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.work_order_item_repairs', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.work_order_items', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.work_orders', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.employee_workshop_sectors', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.workshop_sectors', ARRAY['mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.workshops', ARRAY['mantenimiento']::text[]);

-- operaciones (10 tablas)
SELECT public.app_enable_module_gate('public.dailyreport', ARRAY['operaciones']::text[]);
SELECT public.app_enable_module_gate('public.dailyreportrows', ARRAY['operaciones']::text[]);
SELECT public.app_enable_module_gate('public.dailyreportrows_history', ARRAY['operaciones']::text[]);
SELECT public.app_enable_module_gate('public.dailyreportemployeerelations', ARRAY['operaciones']::text[]);
SELECT public.app_enable_module_gate('public.dailyreportequipmentrelations', ARRAY['operaciones']::text[]);
SELECT public.app_enable_module_gate('public.dailyreport_customer_equipment_relations', ARRAY['operaciones']::text[]);
SELECT public.app_enable_module_gate('public.preparte', ARRAY['operaciones']::text[]);
SELECT public.app_enable_module_gate('public.preparte_change_logs', ARRAY['operaciones']::text[]);
SELECT public.app_enable_module_gate('public.remitos', ARRAY['operaciones']::text[]);
SELECT public.app_enable_module_gate('public.remito_documents', ARRAY['operaciones']::text[]);
