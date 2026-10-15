-- T4: el estado de las lineas de los partes diarios (dailyreportrows) deja de calcularlo un trigger
-- row-level que se dispara a si mismo. Pasa a UNA sola formula set-based que llaman los escritores
-- (reconcile_daily_report_rows_status) y el job nocturno. El historial de lineas pasa a triggers
-- de SENTENCIA con tablas de transicion. Idempotente. SIN backfill (ver prisma/rollbacks/...).
-- Las funciones legacy (after_dailyreportrows_update_optimized, log_dailyreport_changes) se conservan hasta T6.

-- 1) Formula unica del estado de una linea (decision D1, opcion B: sube y baja).
--    Solo toca lineas 'pendiente' / 'sin_recursos_asignados' (los estados terminales no se tocan) y solo si
--    el valor cambia. Cuenta empleados y equipos (dailyreportemployeerelations / dailyreportequipmentrelations)
--    segun los flags needs_personnel / needs_equipment del item, igual que el trigger que reemplaza; los
--    equipos de cliente NO cuentan como recurso (tampoco contaban antes).
CREATE OR REPLACE FUNCTION public.reconcile_daily_report_rows_status(p_row_ids uuid[])
 RETURNS integer
 LANGUAGE sql
AS $function$
  WITH calc AS (
    SELECT r.id,
           CASE
             WHEN (NOT COALESCE(si.needs_personnel, true) OR EXISTS (
                     SELECT 1 FROM public.dailyreportemployeerelations e WHERE e.daily_report_row_id = r.id))
              AND (NOT COALESCE(si.needs_equipment, true) OR EXISTS (
                     SELECT 1 FROM public.dailyreportequipmentrelations q WHERE q.daily_report_row_id = r.id))
             THEN 'pendiente'::daily_report_status
             ELSE 'sin_recursos_asignados'::daily_report_status
           END AS new_status
    FROM public.dailyreportrows r
    JOIN public.service_items si ON si.id = r.item_id
    WHERE r.id = ANY (p_row_ids)
      AND r.status IN ('pendiente', 'sin_recursos_asignados')
  ),
  upd AS (
    UPDATE public.dailyreportrows dr
    SET status = calc.new_status,
        updated_at = now()
    FROM calc
    WHERE dr.id = calc.id
      AND dr.status IS DISTINCT FROM calc.new_status
    RETURNING 1
  )
  SELECT count(*)::integer FROM upd;
$function$;

-- 2) Job nocturno: la parte 1 (promover lineas) pasa a la formula unica, set-based, sobre las lineas
--    pendientes / sin recursos de los partes ABIERTOS. La parte 2 (cierre de partes) queda intacta.
CREATE OR REPLACE FUNCTION public.actualizar_estado_daily_reports()
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
    ));

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

-- 3) Fuera el trigger row-level que recalculaba (y se re-disparaba a si mismo). La funcion se conserva hasta T6.
DROP TRIGGER IF EXISTS tr_after_dailyreportrows_update_optimized ON public.dailyreportrows;

-- 4) Historial de lineas: triggers de SENTENCIA con tablas de transicion (un trigger por evento).
--    Mismo contenido que log_dailyreport_changes, sin subtransaccion EXCEPTION, sin EXISTS sobre la propia
--    fila y sin RAISE NOTICE. changed_by solo se informa si el actor existe en profile (antes una FK rota
--    se tragaba el historial entero de la fila). Motivo de reasignacion (D6): sigue leyendo myapp.reassignment_reason.
CREATE OR REPLACE FUNCTION public.log_dailyreportrows_insert_history()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_user uuid := public.app_current_user_id();
BEGIN
    -- Un trigger de sentencia se dispara aunque no afecte filas: no hacer nada en ese caso
    IF NOT EXISTS (SELECT 1 FROM new_rows) THEN
        RETURN NULL;
    END IF;
    INSERT INTO dailyreportrows_history (
        daily_report_row_id, related_table, related_id, action_type,
        changed_fields, changed_data, changed_by, reassignment_reason
    )
    SELECT n.id, TG_TABLE_NAME, n.id, 'CREATE',
           '{}'::jsonb,
           jsonb_build_object(
               'customer_name', c.name,
               'service_name', cs.service_name,
               'item_name', si.item_name,
               'working_day', n.working_day,
               'status', n.status,
               'type_service', n.type_service
           ),
           (SELECT p.credential_id FROM profile p WHERE p.credential_id = v_user),
           NULL
    FROM new_rows n
    LEFT JOIN customers c ON c.id = n.customer_id
    LEFT JOIN customer_services cs ON cs.id = n.service_id
    LEFT JOIN service_items si ON si.id = n.item_id;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_dailyreportrows_update_history()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_user uuid := public.app_current_user_id();
    v_reason text := NULLIF(current_setting('myapp.reassignment_reason', true), '');
    v_logged integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM new_rows) THEN
        RETURN NULL;
    END IF;
    INSERT INTO dailyreportrows_history (
        daily_report_row_id, related_table, related_id, action_type,
        changed_fields, changed_data, changed_by, reassignment_reason
    )
    SELECT d.id, TG_TABLE_NAME, d.id, 'UPDATE', d.changed_fields,
           jsonb_build_object(
               'customer_name', c.name,
               'service_name', cs.service_name,
               'item_name', si.item_name,
               'working_day', d.working_day,
               'status', d.status,
               'type_service', d.type_service
           ),
           (SELECT p.credential_id FROM profile p WHERE p.credential_id = v_user),
           v_reason
    FROM (
        SELECT n.id, n.customer_id, n.service_id, n.item_id, n.working_day, n.status, n.type_service,
               (CASE WHEN n.customer_id IS DISTINCT FROM o.customer_id THEN jsonb_build_object('customer_id', jsonb_build_object('old', o.customer_id, 'new', n.customer_id)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.service_id IS DISTINCT FROM o.service_id THEN jsonb_build_object('service_id', jsonb_build_object('old', o.service_id, 'new', n.service_id)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.completed_night IS DISTINCT FROM o.completed_night THEN jsonb_build_object('completed_night', jsonb_build_object('old', o.completed_night, 'new', n.completed_night)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.completed_day IS DISTINCT FROM o.completed_day THEN jsonb_build_object('completed_day', jsonb_build_object('old', o.completed_day, 'new', n.completed_day)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.item_id IS DISTINCT FROM o.item_id THEN jsonb_build_object('item_id', jsonb_build_object(
                    'old', (SELECT item_name FROM service_items WHERE id = o.item_id),
                    'new', (SELECT item_name FROM service_items WHERE id = n.item_id))) ELSE '{}'::jsonb END)
            || (CASE WHEN n.working_day IS DISTINCT FROM o.working_day THEN jsonb_build_object('working_day', jsonb_build_object('old', o.working_day, 'new', n.working_day)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.start_time IS DISTINCT FROM o.start_time THEN jsonb_build_object('start_time', jsonb_build_object('old', o.start_time::text, 'new', n.start_time::text)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.end_time IS DISTINCT FROM o.end_time THEN jsonb_build_object('end_time', jsonb_build_object('old', o.end_time::text, 'new', n.end_time::text)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.description IS DISTINCT FROM o.description THEN jsonb_build_object('description', jsonb_build_object('old', o.description, 'new', n.description)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.status IS DISTINCT FROM o.status THEN jsonb_build_object('status', jsonb_build_object('old', o.status::text, 'new', n.status::text)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.sector_service_id IS DISTINCT FROM o.sector_service_id THEN jsonb_build_object('sector_service_id', jsonb_build_object('old', o.sector_service_id, 'new', n.sector_service_id)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.areas_service_id IS DISTINCT FROM o.areas_service_id THEN jsonb_build_object('areas_service_id', jsonb_build_object('old', o.areas_service_id, 'new', n.areas_service_id)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.remit_number IS DISTINCT FROM o.remit_number THEN jsonb_build_object('remit_number', jsonb_build_object('old', o.remit_number, 'new', n.remit_number)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.cancel_reason IS DISTINCT FROM o.cancel_reason THEN jsonb_build_object('cancel_reason', jsonb_build_object('old', o.cancel_reason, 'new', n.cancel_reason)) ELSE '{}'::jsonb END)
            || (CASE WHEN n.type_service IS DISTINCT FROM o.type_service THEN jsonb_build_object('type_service', jsonb_build_object('old', o.type_service::text, 'new', n.type_service::text)) ELSE '{}'::jsonb END)
            AS changed_fields
        FROM new_rows n
        JOIN old_rows o ON o.id = n.id
    ) d
    LEFT JOIN customers c ON c.id = d.customer_id
    LEFT JOIN customer_services cs ON cs.id = d.service_id
    LEFT JOIN service_items si ON si.id = d.item_id
    WHERE d.changed_fields <> '{}'::jsonb;

    GET DIAGNOSTICS v_logged = ROW_COUNT;
    -- El motivo de reasignacion se consume una sola vez (igual que antes)
    IF v_logged > 0 AND v_reason IS NOT NULL THEN
        PERFORM set_config('myapp.reassignment_reason', NULL, false);
    END IF;
    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS tr_dailyreportrows_history_after_insert ON public.dailyreportrows;
CREATE TRIGGER tr_dailyreportrows_history_after_insert
  AFTER INSERT ON public.dailyreportrows
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.log_dailyreportrows_insert_history();

DROP TRIGGER IF EXISTS tr_dailyreportrows_history_before_update ON public.dailyreportrows;
CREATE TRIGGER tr_dailyreportrows_history_before_update
  AFTER UPDATE ON public.dailyreportrows
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.log_dailyreportrows_update_history();
