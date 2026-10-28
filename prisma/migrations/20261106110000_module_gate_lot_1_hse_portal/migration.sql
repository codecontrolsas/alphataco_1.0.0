-- F3.4 · RLS por módulo, lote 1 de 6: HSE y Portal (los primeros que se apagan de verdad) (blueprint §5.3).
-- Política RESTRICTIVA `module_gate` (helper `app_enable_module_gate`, prisma/sql/modules.sql) sobre las tablas de cada
-- módulo, con las tablas del catálogo (`src/features/Modules/catalog.ts`). Con el módulo apagado para la empresa de la
-- transacción, `alphataco_app` no ve ni escribe esas filas; `alphataco_system` y el dueño de las tablas no pasan por ella.
-- Con el módulo encendido (la línea de base de la demo, dev, CI y e2e) la política deja pasar todo: es inerte.

-- hse (22 tablas)
SELECT public.app_enable_module_gate('public.hse_document_types', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_documents', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_document_versions', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_document_targets', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_document_acknowledgements', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_trainings', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_targets', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_materials', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_questions', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_options', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_answer_keys', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_assignments', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_attempts', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_answers', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_material_reads', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_instructors', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_records', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_record_instructors', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_record_attendees', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_certificates', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_training_document_types', ARRAY['hse']::text[]);
SELECT public.app_enable_module_gate('public.hse_expiry_notices', ARRAY['hse']::text[]);

-- portal (2 tablas)
SELECT public.app_enable_module_gate('public.employee_portal_access', ARRAY['portal']::text[]);
SELECT public.app_enable_module_gate('public.employee_portal_access_events', ARRAY['portal']::text[]);
