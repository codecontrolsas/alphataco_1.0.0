-- Historial de la línea sin la columna vieja `dailyreportrows.remit_number`.
--
-- La migración 20261019100000_unify_remitos_source elimina esa columna, pero esta función (creada en
-- 20261019100300, que se aplica DESPUÉS o ya estaba aplicada en los entornos que la recibieron antes)
-- sigue comparándola en el trigger por sentencia de UPDATE: con la columna eliminada, cualquier UPDATE
-- de una línea fallaría. Se redefine sin ese campo (el historial viejo de remit_number no se toca).
-- Va con timestamp posterior a ambas para que gane el orden en una base nueva y en una ya desplegada.

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
