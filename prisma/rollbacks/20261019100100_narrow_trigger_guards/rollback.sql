-- Rollback de 20261019100100_narrow_trigger_guards (textual del dump .mockups/triggers-dump.sql).
-- set_updated_at() se conserva (inofensiva); se vuelve a las funciones legacy.
DROP TRIGGER IF EXISTS format_employee_names_trigger ON public.employees;
CREATE TRIGGER format_employee_names_trigger BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION format_employee_names();

DROP TRIGGER IF EXISTS trg_employees_diagram_changes_insert ON public.employees_diagram;
DROP TRIGGER IF EXISTS trg_employees_diagram_changes_update ON public.employees_diagram;
DROP TRIGGER IF EXISTS trg_employees_diagram_changes ON public.employees_diagram;
CREATE TRIGGER trg_employees_diagram_changes AFTER INSERT OR UPDATE ON public.employees_diagram FOR EACH ROW EXECUTE FUNCTION handle_employees_diagram_changes();

DROP TRIGGER IF EXISTS trigger_log_maintenance_order_activity_insert ON public.maintenance_orders;
DROP TRIGGER IF EXISTS trigger_log_maintenance_order_activity_update ON public.maintenance_orders;
DROP TRIGGER IF EXISTS trigger_log_maintenance_order_activity ON public.maintenance_orders;
CREATE TRIGGER trigger_log_maintenance_order_activity AFTER INSERT OR UPDATE ON public.maintenance_orders FOR EACH ROW EXECUTE FUNCTION log_maintenance_order_activity();

DROP TRIGGER IF EXISTS trigger_log_work_order_activity_insert ON public.work_orders;
DROP TRIGGER IF EXISTS trigger_log_work_order_activity_update ON public.work_orders;
DROP TRIGGER IF EXISTS trigger_log_work_order_activity ON public.work_orders;
CREATE TRIGGER trigger_log_work_order_activity AFTER INSERT OR UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION log_work_order_activity();

DROP TRIGGER IF EXISTS update_empleado_aptitudes_updated_at ON public.empleado_aptitudes;
CREATE TRIGGER update_empleado_aptitudes_updated_at BEFORE UPDATE ON public.empleado_aptitudes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_maintenance_orders_updated_at ON public.maintenance_orders;
CREATE TRIGGER update_maintenance_orders_updated_at BEFORE UPDATE ON public.maintenance_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_maintenance_requests_updated_at ON public.maintenance_requests;
CREATE TRIGGER update_maintenance_requests_updated_at BEFORE UPDATE ON public.maintenance_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trigger_work_orders_updated_at ON public.work_orders;
CREATE TRIGGER trigger_work_orders_updated_at BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION update_work_orders_updated_at();
DROP TRIGGER IF EXISTS trigger_work_order_items_updated_at ON public.work_order_items;
CREATE TRIGGER trigger_work_order_items_updated_at BEFORE UPDATE ON public.work_order_items FOR EACH ROW EXECUTE FUNCTION update_work_orders_updated_at();
DROP TRIGGER IF EXISTS trigger_update_work_order_item_repairs_updated_at ON public.work_order_item_repairs;
CREATE TRIGGER trigger_update_work_order_item_repairs_updated_at BEFORE UPDATE ON public.work_order_item_repairs FOR EACH ROW EXECUTE FUNCTION update_work_order_item_repairs_updated_at();
