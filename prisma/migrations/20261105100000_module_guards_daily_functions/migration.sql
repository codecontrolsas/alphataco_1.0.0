-- F3.3: el mantenimiento diario de partes y prepartes recibe las empresas a procesar. El job las elige entre las que
-- tienen `operaciones` encendido: con el módulo apagado no se cierran partes ni se vencen prepartes de esa empresa.
-- `NULL` = todas (comportamiento anterior, para quien lo llame sin argumentos). Se borran las versiones sin parámetros
-- para no dejar dos sobrecargas ambiguas.

DROP FUNCTION IF EXISTS public.actualizar_estado_daily_reports();

CREATE OR REPLACE FUNCTION public.actualizar_estado_daily_reports(p_company_ids uuid[] DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
    report_record RECORD;
    tiene_filas BOOLEAN;
    todas_completas BOOLEAN;
BEGIN
    -- Parte 1: reconciliar el estado de las lineas de los partes abiertos (sube y baja segun recursos y flags)
    PERFORM public.reconcile_daily_report_rows_status(ARRAY(
        SELECT dr.id
        FROM dailyreportrows dr
        JOIN dailyreport d ON d.id = dr.daily_report_id
        WHERE d.status = 'abierto'
          AND dr.status IN ('pendiente', 'sin_recursos_asignados')
          AND (p_company_ids IS NULL OR d.company_id = ANY (p_company_ids))
    ));

    -- Parte 2: Cierre de reportes con fecha pasada
    FOR report_record IN
        SELECT id
        FROM dailyreport
        WHERE date < ( (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date )
        AND status IN ('abierto', 'cerrado_incompleto')
        AND (p_company_ids IS NULL OR company_id = ANY (p_company_ids))
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

DROP FUNCTION IF EXISTS public.marcar_prepartes_vencidos();

CREATE OR REPLACE FUNCTION public.marcar_prepartes_vencidos(p_company_ids uuid[] DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
AS $function$BEGIN
    UPDATE public.preparte
    SET 
        status = 'vencido',
        updated_at = NOW()
    WHERE status = 'pendiente'
    AND "executionDate" < CURRENT_DATE
    AND (
        "executionDate"::date < CURRENT_DATE
        OR 
        ("executionDate"::date = CURRENT_DATE AND "executionDate" < NOW())
    )
    AND (p_company_ids IS NULL OR company_id = ANY (p_company_ids));
END;$function$;
