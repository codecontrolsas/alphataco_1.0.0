-- Rollback de 20261019100000_drop_dead_triggers (textual del dump .mockups/triggers-dump.sql).
-- Las funciones siguen existiendo (se borran recien en T6).
DROP TRIGGER IF EXISTS before_update_log_reason ON public.dailyreportrows;
CREATE TRIGGER before_update_log_reason BEFORE UPDATE ON public.dailyreportrows FOR EACH ROW EXECUTE FUNCTION log_reassignment_reason_before_update();
DROP TRIGGER IF EXISTS tr_dailyreportrows_history_before_delete ON public.dailyreportrows;
CREATE TRIGGER tr_dailyreportrows_history_before_delete BEFORE DELETE ON public.dailyreportrows FOR EACH ROW EXECUTE FUNCTION log_dailyreport_changes();
DROP TRIGGER IF EXISTS after_service_update ON public.service_items;
CREATE TRIGGER after_service_update AFTER UPDATE OF is_active ON public.service_items FOR EACH ROW WHEN ((old.is_active IS DISTINCT FROM new.is_active)) EXECUTE FUNCTION deactivate_service_items();
