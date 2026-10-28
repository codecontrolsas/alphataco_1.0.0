-- F3.4 · RLS por módulo, lote 6 de 6: Documentación, Selección y Formularios (blueprint §5.3).
-- Política RESTRICTIVA `module_gate` (helper `app_enable_module_gate`, prisma/sql/modules.sql) sobre las tablas de cada
-- módulo, con las tablas del catálogo (`src/features/Modules/catalog.ts`). Con el módulo apagado para la empresa de la
-- transacción, `alphataco_app` no ve ni escribe esas filas; `alphataco_system` y el dueño de las tablas no pasan por ella.
-- Con el módulo encendido (la línea de base de la demo, dev, CI y e2e) la política deja pasar todo: es inerte.

-- documentacion (5 tablas)
SELECT public.app_enable_module_gate('public.documents_company', ARRAY['documentacion']::text[]);
SELECT public.app_enable_module_gate('public.documents_employees', ARRAY['documentacion', 'empleados']::text[]);
SELECT public.app_enable_module_gate('public.documents_employees_logs', ARRAY['documentacion', 'empleados']::text[]);
SELECT public.app_enable_module_gate('public.documents_equipment', ARRAY['documentacion', 'equipos']::text[]);
SELECT public.app_enable_module_gate('public.documents_equipment_logs', ARRAY['documentacion', 'equipos']::text[]);

-- seleccion (2 tablas)
SELECT public.app_enable_module_gate('public.pre_employees', ARRAY['seleccion']::text[]);
SELECT public.app_enable_module_gate('public.documents_pre_employees', ARRAY['seleccion']::text[]);

-- formularios (2 tablas)
SELECT public.app_enable_module_gate('public.custom_form', ARRAY['formularios']::text[]);
SELECT public.app_enable_module_gate('public.form_answers', ARRAY['formularios']::text[]);
