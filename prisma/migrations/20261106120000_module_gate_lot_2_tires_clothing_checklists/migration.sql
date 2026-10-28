-- F3.4 · RLS por módulo, lote 2 de 6: Gomería, Indumentaria y Checklists (blueprint §5.3).
-- Política RESTRICTIVA `module_gate` (helper `app_enable_module_gate`, prisma/sql/modules.sql) sobre las tablas de cada
-- módulo, con las tablas del catálogo (`src/features/Modules/catalog.ts`). Con el módulo apagado para la empresa de la
-- transacción, `alphataco_app` no ve ni escribe esas filas; `alphataco_system` y el dueño de las tablas no pasan por ella.
-- Con el módulo encendido (la línea de base de la demo, dev, CI y e2e) la política deja pasar todo: es inerte.

-- gomeria (10 tablas)
SELECT public.app_enable_module_gate('public.tire_brands', ARRAY['gomeria']::text[]);
SELECT public.app_enable_module_gate('public.tire_types', ARRAY['gomeria']::text[]);
SELECT public.app_enable_module_gate('public.tire_materials', ARRAY['gomeria']::text[]);
SELECT public.app_enable_module_gate('public.tires', ARRAY['gomeria']::text[]);
SELECT public.app_enable_module_gate('public.tire_templates', ARRAY['gomeria']::text[]);
SELECT public.app_enable_module_gate('public.tire_template_axles', ARRAY['gomeria']::text[]);
SELECT public.app_enable_module_gate('public.vehicle_tire_positions', ARRAY['gomeria']::text[]);
SELECT public.app_enable_module_gate('public.vehicle_axle_tire_sizes', ARRAY['gomeria']::text[]);
SELECT public.app_enable_module_gate('public.tire_service_orders', ARRAY['gomeria']::text[]);
SELECT public.app_enable_module_gate('public.tire_service_items', ARRAY['gomeria']::text[]);

-- indumentaria (7 tablas)
SELECT public.app_enable_module_gate('public.clothing_brands', ARRAY['indumentaria']::text[]);
SELECT public.app_enable_module_gate('public.clothing_deliveries', ARRAY['indumentaria']::text[]);
SELECT public.app_enable_module_gate('public.clothing_delivery_items', ARRAY['indumentaria']::text[]);
SELECT public.app_enable_module_gate('public.clothing_item_brand_sizes', ARRAY['indumentaria']::text[]);
SELECT public.app_enable_module_gate('public.clothing_item_materials', ARRAY['indumentaria']::text[]);
SELECT public.app_enable_module_gate('public.clothing_items', ARRAY['indumentaria']::text[]);
SELECT public.app_enable_module_gate('public.clothing_sizes', ARRAY['indumentaria']::text[]);

-- checklists (7 tablas)
SELECT public.app_enable_module_gate('public.checklist_answers', ARRAY[]::text[], ARRAY['checklists', 'mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.checklist_deviations', ARRAY[]::text[], ARRAY['checklists', 'mantenimiento']::text[]);
SELECT public.app_enable_module_gate('public.checklist_templates', ARRAY['checklists']::text[]);
SELECT public.app_enable_module_gate('public.checklist_template_items', ARRAY['checklists']::text[]);
SELECT public.app_enable_module_gate('public.checklist_template_sections', ARRAY['checklists']::text[]);
SELECT public.app_enable_module_gate('public.checklist_template_sub_types', ARRAY['checklists']::text[]);
SELECT public.app_enable_module_gate('public.checklist_template_types', ARRAY['checklists']::text[]);
