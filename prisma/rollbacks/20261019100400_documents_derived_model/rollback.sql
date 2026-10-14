-- Rollback de 20261019100400_documents_derived_model (triggers textuales de .mockups/triggers-dump.sql).
-- Las funciones nunca se borraron (las retira M2), asi que recrear los triggers alcanza.
-- Requiere que existan las tablas _bak_documents_empty_20261019 y _bak_documents_empty_logs_20261019.

-- 1. Reinsertar las filas vacias y sus logs. Se desactiva la auditoria para no duplicar logs.
ALTER TABLE public.documents_employees DISABLE TRIGGER document_employee_changes_trigger;
ALTER TABLE public.documents_equipment DISABLE TRIGGER document_equipment_changes_trigger;

INSERT INTO public.documents_employees
SELECT (jsonb_populate_record(NULL::public.documents_employees, row_data)).*
FROM public._bak_documents_empty_20261019 WHERE source = 'documents_employees'
ON CONFLICT DO NOTHING;
INSERT INTO public.documents_equipment
SELECT (jsonb_populate_record(NULL::public.documents_equipment, row_data)).*
FROM public._bak_documents_empty_20261019 WHERE source = 'documents_equipment'
ON CONFLICT DO NOTHING;
INSERT INTO public.documents_company
SELECT (jsonb_populate_record(NULL::public.documents_company, row_data)).*
FROM public._bak_documents_empty_20261019 WHERE source = 'documents_company'
ON CONFLICT DO NOTHING;
INSERT INTO public.documents_employees_logs
SELECT (jsonb_populate_record(NULL::public.documents_employees_logs, row_data)).*
FROM public._bak_documents_empty_logs_20261019 WHERE source = 'documents_employees_logs'
ON CONFLICT DO NOTHING;
INSERT INTO public.documents_equipment_logs
SELECT (jsonb_populate_record(NULL::public.documents_equipment_logs, row_data)).*
FROM public._bak_documents_empty_logs_20261019 WHERE source = 'documents_equipment_logs'
ON CONFLICT DO NOTHING;

ALTER TABLE public.documents_employees ENABLE TRIGGER document_employee_changes_trigger;
ALTER TABLE public.documents_equipment ENABLE TRIGGER document_equipment_changes_trigger;

-- 2. Recrear los 12 triggers.
DROP TRIGGER IF EXISTS controlar_alertas_employees ON public.employees;
CREATE TRIGGER controlar_alertas_employees AFTER UPDATE ON public.employees FOR EACH ROW WHEN (((old.is_active IS DISTINCT FROM new.is_active) OR (old.company_id IS DISTINCT FROM new.company_id) OR (old.company_position IS DISTINCT FROM new.company_position) OR (old.category_id IS DISTINCT FROM new.category_id) OR (old.cost_center_id IS DISTINCT FROM new.cost_center_id) OR (old.covenants_id IS DISTINCT FROM new.covenants_id) OR (old.guild_id IS DISTINCT FROM new.guild_id) OR (old.hierarchical_position IS DISTINCT FROM new.hierarchical_position))) EXECUTE FUNCTION trg_controlar_alertas_employees();
DROP TRIGGER IF EXISTS controlar_alertas_employees_insert ON public.employees;
CREATE TRIGGER controlar_alertas_employees_insert AFTER INSERT ON public.employees FOR EACH ROW EXECUTE FUNCTION trg_controlar_alertas_employees();
DROP TRIGGER IF EXISTS controlar_alertas_vehicles ON public.vehicles;
CREATE TRIGGER controlar_alertas_vehicles AFTER UPDATE ON public.vehicles FOR EACH ROW WHEN (((old.is_active IS DISTINCT FROM new.is_active) OR (old.company_id IS DISTINCT FROM new.company_id) OR (old.type IS DISTINCT FROM new.type) OR (old.type_of_vehicle IS DISTINCT FROM new.type_of_vehicle) OR (old."subType" IS DISTINCT FROM new."subType"))) EXECUTE FUNCTION trg_controlar_alertas_vehicles();
DROP TRIGGER IF EXISTS controlar_alertas_vehicles_insert ON public.vehicles;
CREATE TRIGGER controlar_alertas_vehicles_insert AFTER INSERT ON public.vehicles FOR EACH ROW EXECUTE FUNCTION trg_controlar_alertas_vehicles();
DROP TRIGGER IF EXISTS document_types_after_insert ON public.document_types;
CREATE TRIGGER document_types_after_insert AFTER INSERT ON public.document_types FOR EACH ROW EXECUTE FUNCTION trg_document_types_insert();
DROP TRIGGER IF EXISTS document_types_after_update ON public.document_types;
CREATE TRIGGER document_types_after_update AFTER UPDATE ON public.document_types FOR EACH ROW EXECUTE FUNCTION trg_document_types_update();
DROP TRIGGER IF EXISTS trg_update_documents_employees ON public.documents_employees;
CREATE TRIGGER trg_update_documents_employees AFTER UPDATE ON public.documents_employees REFERENCING NEW TABLE AS affected_rows FOR EACH STATEMENT EXECUTE FUNCTION update_status_trigger();
DROP TRIGGER IF EXISTS trg_update_documents_employees_ins ON public.documents_employees;
CREATE TRIGGER trg_update_documents_employees_ins AFTER INSERT ON public.documents_employees REFERENCING NEW TABLE AS affected_rows FOR EACH STATEMENT EXECUTE FUNCTION update_status_trigger();
DROP TRIGGER IF EXISTS trg_update_documents_employees_del ON public.documents_employees;
CREATE TRIGGER trg_update_documents_employees_del AFTER DELETE ON public.documents_employees REFERENCING OLD TABLE AS affected_rows FOR EACH STATEMENT EXECUTE FUNCTION update_status_trigger();
DROP TRIGGER IF EXISTS trg_update_documents_equipment ON public.documents_equipment;
CREATE TRIGGER trg_update_documents_equipment AFTER UPDATE ON public.documents_equipment REFERENCING NEW TABLE AS affected_rows FOR EACH STATEMENT EXECUTE FUNCTION update_status_trigger();
DROP TRIGGER IF EXISTS trg_update_documents_equipment_ins ON public.documents_equipment;
CREATE TRIGGER trg_update_documents_equipment_ins AFTER INSERT ON public.documents_equipment REFERENCING NEW TABLE AS affected_rows FOR EACH STATEMENT EXECUTE FUNCTION update_status_trigger();
DROP TRIGGER IF EXISTS trg_update_documents_equipment_del ON public.documents_equipment;
CREATE TRIGGER trg_update_documents_equipment_del AFTER DELETE ON public.documents_equipment REFERENCING OLD TABLE AS affected_rows FOR EACH STATEMENT EXECUTE FUNCTION update_status_trigger();

-- 3. Indices nuevos (se pueden dejar; si se quieren quitar):
-- DROP INDEX IF EXISTS idx_documents_employees_applies_type, idx_documents_employees_type,
--   idx_documents_equipment_applies_type, idx_documents_equipment_type;

-- 4. Para volver POR COMPLETO al modelo viejo, despues del rollback (el modelo viejo materializa filas
--    pendientes que el codigo nuevo ya no crea y deja status desactualizado):
--    a) por cada empleado:  SELECT controlar_alertas_documentos_single_employee(id, company_id) FROM employees;
--       por cada vehiculo:  SELECT controlar_alertas_documentos_single_vehicle(id, company_id) FROM vehicles;
--       (retornan void: desde Prisma usar $executeRaw, nunca $queryRaw)
--    b) recalcular status: SELECT recalcular_status_documentacion(ARRAY(SELECT id FROM employees), 'Persona');
--       y SELECT recalcular_status_documentacion(ARRAY(SELECT id FROM vehicles), 'Equipos');
--    c) Revertir tambien el codigo de la app (el motor derivado ignora las filas vacias, no rompe).
