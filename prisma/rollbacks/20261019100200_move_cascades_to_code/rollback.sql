-- Rollback de 20261019100200_move_cascades_to_code (textual del dump .mockups/triggers-dump.sql).
-- Las funciones siguen existiendo (se borran recien en T6).
DROP INDEX IF EXISTS public.company_one_default_per_owner;
DROP TRIGGER IF EXISTS update_company_by_defect_trigger ON public.company;
CREATE TRIGGER update_company_by_defect_trigger AFTER INSERT OR UPDATE OF by_defect ON public.company FOR EACH ROW EXECUTE FUNCTION update_company_by_defect();
DROP TRIGGER IF EXISTS after_service_update ON public.customer_services;
CREATE TRIGGER after_service_update AFTER UPDATE OF is_active ON public.customer_services FOR EACH ROW WHEN ((old.is_active IS DISTINCT FROM new.is_active)) EXECUTE FUNCTION deactivate_service_items();
DROP TRIGGER IF EXISTS after_employee_insert ON public.employees;
CREATE TRIGGER after_employee_insert AFTER INSERT ON public.employees FOR EACH ROW EXECUTE FUNCTION add_to_companies_employees();
DROP TRIGGER IF EXISTS add_contractor_equipment_after_insert ON public.vehicles;
CREATE TRIGGER add_contractor_equipment_after_insert AFTER INSERT ON public.vehicles FOR EACH ROW EXECUTE FUNCTION equipment_allocated_to();
