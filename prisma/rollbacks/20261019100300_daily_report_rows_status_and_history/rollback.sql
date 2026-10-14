-- Rollback de 20261019100300_daily_report_rows_status_and_history (textual del dump .mockups/triggers-dump.sql).
-- Las funciones nuevas (reconcile_daily_report_rows_status, log_dailyreportrows_*_history) se conservan:
-- son inofensivas y el codigo desplegado de T4a llama a reconcile_daily_report_rows_status.

-- Historial de lineas: triggers por fila con la funcion original.
DROP TRIGGER IF EXISTS tr_dailyreportrows_history_after_insert ON public.dailyreportrows;
CREATE TRIGGER tr_dailyreportrows_history_after_insert AFTER INSERT ON public.dailyreportrows FOR EACH ROW EXECUTE FUNCTION log_dailyreport_changes();
DROP TRIGGER IF EXISTS tr_dailyreportrows_history_before_update ON public.dailyreportrows;
CREATE TRIGGER tr_dailyreportrows_history_before_update BEFORE UPDATE ON public.dailyreportrows FOR EACH ROW EXECUTE FUNCTION log_dailyreport_changes();

-- Trigger que recalculaba el estado de las lineas.
DROP TRIGGER IF EXISTS tr_after_dailyreportrows_update_optimized ON public.dailyreportrows;
CREATE TRIGGER tr_after_dailyreportrows_update_optimized AFTER INSERT OR DELETE OR UPDATE ON public.dailyreportrows FOR EACH ROW EXECUTE FUNCTION after_dailyreportrows_update_optimized();

-- Parte 1 vieja de actualizar_estado_daily_reports (fila por fila, sin flags).
CREATE OR REPLACE FUNCTION public.actualizar_estado_daily_reports()
 RETURNS void
 LANGUAGE plpgsql
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
    report_record RECORD;
    row_record RECORD;
    tiene_filas BOOLEAN;
    todas_completas BOOLEAN;
    tiene_recursos BOOLEAN;
BEGIN
    -- Parte 1: Actualizar filas 'sin_recursos_asignados' que ya tienen recursos asignados
    FOR row_record IN
        SELECT dr.id
        FROM dailyreportrows dr
        WHERE dr.status = 'sin_recursos_asignados'
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM dailyreportemployeerelations
            WHERE daily_report_row_id = row_record.id
            UNION
            SELECT 1 FROM dailyreportequipmentrelations
            WHERE daily_report_row_id = row_record.id
        ) INTO tiene_recursos;

        IF tiene_recursos THEN
            UPDATE dailyreportrows
            SET status = 'pendiente',
                updated_at = (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')
            WHERE id = row_record.id;
        END IF;
    END LOOP;

    -- Parte 2: Cierre de reportes con fecha pasada
    FOR report_record IN
        SELECT id
        FROM dailyreport
        WHERE date < ( (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date )
        AND status IN ('abierto', 'cerrado_incompleto')
    LOOP
        SELECT EXISTS (SELECT 1 FROM dailyreportrows WHERE daily_report_id = report_record.id) INTO tiene_filas;

        IF NOT tiene_filas THEN
            UPDATE dailyreport
            SET status = 'cerrado_completo',
                updated_at = (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')
            WHERE id = report_record.id;
        ELSE
            -- Estados completos: ejecutado, reprogramado, cancelado, en_certificacion
            -- NO se verifica document_path (el remito no es requisito para cierre)
            SELECT NOT EXISTS (
                SELECT 1
                FROM dailyreportrows
                WHERE daily_report_id = report_record.id
                AND status NOT IN ('ejecutado', 'reprogramado', 'cancelado', 'en_certificacion')
            ) INTO todas_completas;

            IF todas_completas THEN
                UPDATE dailyreport
                SET status = 'cerrado_completo',
                    updated_at = (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')
                WHERE id = report_record.id;
            ELSE
                UPDATE dailyreport
                SET status = 'cerrado_incompleto',
                    updated_at = (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')
                WHERE id = report_record.id;
            END IF;
        END IF;
    END LOOP;
END;
$function$;
