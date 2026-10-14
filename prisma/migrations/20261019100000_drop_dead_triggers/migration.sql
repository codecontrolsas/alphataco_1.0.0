-- T1: elimina triggers muertos (limpieza de triggers, fuera de documentos).
-- Idempotente. Las funciones se conservan hasta T6.

-- Solo hacia RAISE LOG de un setting que nadie escribe.
DROP TRIGGER IF EXISTS before_update_log_reason ON public.dailyreportrows;

-- Insertaba el log DELETE en BEFORE DELETE, pero dailyreportrows_history tiene ON DELETE CASCADE
-- sobre la fila: el mismo DELETE lo borraba. Nunca dejo datos (0 filas action_type='DELETE').
DROP TRIGGER IF EXISTS tr_dailyreportrows_history_before_delete ON public.dailyreportrows;

-- Bug: deactivate_service_items usa customer_service_id = NEW.id con el id del item (0 filas).
-- OJO: el trigger homonimo de customer_services SE QUEDA.
DROP TRIGGER IF EXISTS after_service_update ON public.service_items;
