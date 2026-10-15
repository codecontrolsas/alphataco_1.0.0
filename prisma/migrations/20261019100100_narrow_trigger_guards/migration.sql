-- T2: acota los disparos de triggers a las columnas que realmente usan sus funciones.
-- Idempotente. Las funciones legacy de updated_at se conservan hasta T6.

-- 1) format_employee_names solo depende de firstname y lastname.
DROP TRIGGER IF EXISTS format_employee_names_trigger ON public.employees;
CREATE TRIGGER format_employee_names_trigger
  BEFORE INSERT OR UPDATE OF firstname, lastname ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.format_employee_names();

-- 2) Diagramas: la funcion registra diagram_type, day, month, year y employee_id.
--    En UPDATE solo se loguea si cambia alguno (antes se logueaban ediciones sin cambios).
DROP TRIGGER IF EXISTS trg_employees_diagram_changes ON public.employees_diagram;
DROP TRIGGER IF EXISTS trg_employees_diagram_changes_insert ON public.employees_diagram;
DROP TRIGGER IF EXISTS trg_employees_diagram_changes_update ON public.employees_diagram;
CREATE TRIGGER trg_employees_diagram_changes_insert
  AFTER INSERT ON public.employees_diagram
  FOR EACH ROW EXECUTE FUNCTION public.handle_employees_diagram_changes();
CREATE TRIGGER trg_employees_diagram_changes_update
  AFTER UPDATE OF diagram_type, day, month, year, employee_id ON public.employees_diagram
  FOR EACH ROW
  WHEN (OLD.diagram_type IS DISTINCT FROM NEW.diagram_type
     OR OLD.day IS DISTINCT FROM NEW.day
     OR OLD.month IS DISTINCT FROM NEW.month
     OR OLD.year IS DISTINCT FROM NEW.year
     OR OLD.employee_id IS DISTINCT FROM NEW.employee_id)
  EXECUTE FUNCTION public.handle_employees_diagram_changes();

-- 3) Mantenimiento: ambas funciones solo insertan en INSERT o cuando cambia status
--    (date_confirmed, workshop_entry, started/paused/resumed... se derivan del NUEVO status).
DROP TRIGGER IF EXISTS trigger_log_maintenance_order_activity ON public.maintenance_orders;
DROP TRIGGER IF EXISTS trigger_log_maintenance_order_activity_insert ON public.maintenance_orders;
DROP TRIGGER IF EXISTS trigger_log_maintenance_order_activity_update ON public.maintenance_orders;
CREATE TRIGGER trigger_log_maintenance_order_activity_insert
  AFTER INSERT ON public.maintenance_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_maintenance_order_activity();
CREATE TRIGGER trigger_log_maintenance_order_activity_update
  AFTER UPDATE OF status ON public.maintenance_orders
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_maintenance_order_activity();

DROP TRIGGER IF EXISTS trigger_log_work_order_activity ON public.work_orders;
DROP TRIGGER IF EXISTS trigger_log_work_order_activity_insert ON public.work_orders;
DROP TRIGGER IF EXISTS trigger_log_work_order_activity_update ON public.work_orders;
CREATE TRIGGER trigger_log_work_order_activity_insert
  AFTER INSERT ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_work_order_activity();
CREATE TRIGGER trigger_log_work_order_activity_update
  AFTER UPDATE OF status ON public.work_orders
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_work_order_activity();

-- 4) Una sola funcion de updated_at (equivalente a las 3 duplicadas).
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS update_empleado_aptitudes_updated_at ON public.empleado_aptitudes;
CREATE TRIGGER update_empleado_aptitudes_updated_at BEFORE UPDATE ON public.empleado_aptitudes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_maintenance_orders_updated_at ON public.maintenance_orders;
CREATE TRIGGER update_maintenance_orders_updated_at BEFORE UPDATE ON public.maintenance_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_maintenance_requests_updated_at ON public.maintenance_requests;
CREATE TRIGGER update_maintenance_requests_updated_at BEFORE UPDATE ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_work_orders_updated_at ON public.work_orders;
CREATE TRIGGER trigger_work_orders_updated_at BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_work_order_items_updated_at ON public.work_order_items;
CREATE TRIGGER trigger_work_order_items_updated_at BEFORE UPDATE ON public.work_order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_update_work_order_item_repairs_updated_at ON public.work_order_item_repairs;
CREATE TRIGGER trigger_update_work_order_item_repairs_updated_at BEFORE UPDATE ON public.work_order_item_repairs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
