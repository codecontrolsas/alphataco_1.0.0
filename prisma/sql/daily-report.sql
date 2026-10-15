-- Generado por scripts/sql/extract-sql-objects.ts — editar a mano SOLO en la revisión de Task 4
-- Dominio: daily-report — 16 objeto(s)
-- Revisado a mano en la Task 4 (P1): sin tabla de usuarios de Supabase, actor por app.user_id, + marcar_prepartes_vencidos (job P5).

-- ============================================================================
-- FUNCTIONS (7)
-- ============================================================================

-- function actualizar_estado_daily_reports (T4: parte 1 usa reconcile_daily_report_rows_status; migracion 20261019100300)
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

-- function reconcile_daily_report_rows_status (T4, migracion 20261019100300)
CREATE OR REPLACE FUNCTION public.reconcile_daily_report_rows_status(p_row_ids uuid[])
 RETURNS integer
 LANGUAGE sql
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
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

-- function log_dailyreportrows_insert_history (T4, migracion 20261019100300)
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

-- function log_dailyreportrows_update_history (T4, migracion 20261019100300)
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

-- function after_dailyreportrows_update_optimized (origen: supabase/migrations/20260304035040_sinc-2.sql)
CREATE OR REPLACE FUNCTION public.after_dailyreportrows_update_optimized()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    affected_reports UUID[];
    v_report_id UUID;
BEGIN
    -- Recopilar todos los report_ids únicos afectados en esta transacción
    SELECT ARRAY_AGG(DISTINCT daily_report_id)
    INTO affected_reports
    FROM (
        SELECT NEW.daily_report_id AS daily_report_id
        UNION
        SELECT OLD.daily_report_id AS daily_report_id WHERE TG_OP = 'UPDATE'
    ) reports
    WHERE daily_report_id IS NOT NULL;

    IF affected_reports IS NOT NULL AND array_length(affected_reports, 1) > 0 THEN
        FOREACH v_report_id IN ARRAY affected_reports
        LOOP
            -- Actualizar filas 'sin_recursos_asignados' que ahora tienen los recursos requeridos
            -- Respeta los flags needs_personnel y needs_equipment de service_items
            UPDATE dailyreportrows dr
            SET status = 'pendiente',
                updated_at = (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')
            FROM service_items si
            WHERE dr.item_id = si.id
              AND dr.status = 'sin_recursos_asignados'
              AND dr.daily_report_id = v_report_id
              AND (
                (NOT COALESCE(si.needs_personnel, true) OR EXISTS (
                  SELECT 1 FROM dailyreportemployeerelations WHERE daily_report_row_id = dr.id
                ))
                AND
                (NOT COALESCE(si.needs_equipment, true) OR EXISTS (
                  SELECT 1 FROM dailyreportequipmentrelations WHERE daily_report_row_id = dr.id
                ))
              );

            -- NOTA: La lógica de cierre de partes fue removida
            -- El cierre ahora es responsabilidad exclusiva del cronjob
            -- que ejecuta actualizar_estado_daily_reports() a las 00:00 Argentina
        END LOOP;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$function$;

-- function get_daily_report_deviations (origen: prisma/migrations/20261020100000_deviations_single_pass/migration.sql)
CREATE OR REPLACE FUNCTION public.get_daily_report_deviations(
  p_daily_report_id uuid,
  p_report_date date,
  p_include_context boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
DECLARE
  v_day INT := EXTRACT(DAY FROM p_report_date)::INT;
  v_month INT := EXTRACT(MONTH FROM p_report_date)::INT;
  v_year INT := EXTRACT(YEAR FROM p_report_date)::INT;
  v_result JSONB;
BEGIN
  WITH employee_devs AS (
    SELECT
      der.daily_report_row_id AS row_id,
      der.employee_id,
      COALESCE(e.firstname || ' ' || e.lastname, '—') AS employee_name,
      COALESCE(e.cuil, '—') AS employee_cuil,
      der.role::text AS role,
      (COUNT(*) OVER (PARTITION BY der.employee_id)) > 1 AS is_duplicated,
      NOT EXISTS (
        SELECT 1 FROM contractor_employee ce
        WHERE ce.employee_id = der.employee_id
          AND ce.contractor_id = dr.customer_id
      ) AS is_unassigned_to_client,
      ed.id IS NULL AS has_no_diagram,
      CASE
        WHEN ed.id IS NOT NULL THEN COALESCE(dt.work_active, true) = false
        ELSE false
      END AS is_non_work_day,
      dt.name AS diagram_type_name
    FROM dailyreportemployeerelations der
    INNER JOIN dailyreportrows dr ON dr.id = der.daily_report_row_id
    LEFT JOIN employees e ON e.id = der.employee_id
    LEFT JOIN employees_diagram ed
      ON ed.employee_id = der.employee_id
      AND ed.day = v_day AND ed.month = v_month AND ed.year = v_year
      AND (ed.is_active = true OR ed.is_active IS NULL)
    LEFT JOIN diagram_type dt ON dt.id = ed.diagram_type
    WHERE dr.daily_report_id = p_daily_report_id
  ),
  equipment_devs AS (
    SELECT
      deq.daily_report_row_id AS row_id,
      -- Id efectivo de la relacion polimorfica: vehiculo XOR otro equipo.
      COALESCE(deq.equipment_id, deq.other_equipment_id) AS equipment_id,
      deq.other_equipment_id IS NOT NULL AS is_other_equipment,
      -- Los otros equipos no tienen patente; se los identifica por serie/interno.
      COALESCE(v.domain, '—') AS equipment_domain,
      COALESCE(v.intern_number, oe.intern_number, '—') AS equipment_intern_number,
      COALESCE(v.domain, oe.serial_number, oe.intern_number, '—') AS equipment_label,
      -- Varios tipos vienen cargados con espacios al principio (" Contenedor")
      NULLIF(TRIM(t.name), '') AS equipment_type,
      COALESCE(v.condition::text, oe.condition::text) AS condition,
      (COUNT(*) OVER (PARTITION BY COALESCE(deq.equipment_id, deq.other_equipment_id))) > 1 AS is_duplicated,
      -- Cada tipo de equipo tiene su propia pivote de afectacion a cliente.
      CASE
        WHEN deq.other_equipment_id IS NOT NULL THEN NOT EXISTS (
          SELECT 1 FROM contractor_other_equipment coe
          WHERE coe.equipment_id = deq.other_equipment_id
            AND coe.contractor_id = dr.customer_id
        )
        ELSE NOT EXISTS (
          SELECT 1 FROM contractor_equipment ce
          WHERE ce.equipment_id = deq.equipment_id
            AND ce.contractor_id = dr.customer_id
        )
      END AS is_unassigned_to_client
    FROM dailyreportequipmentrelations deq
    INNER JOIN dailyreportrows dr ON dr.id = deq.daily_report_row_id
    LEFT JOIN vehicles v ON v.id = deq.equipment_id
    LEFT JOIN other_equipment oe ON oe.id = deq.other_equipment_id
    LEFT JOIN type t ON t.id = oe.type_id
    WHERE dr.daily_report_id = p_daily_report_id
      -- Ticket 698: otros equipos excluidos temporalmente de los desvios.
      AND deq.other_equipment_id IS NULL
  ),
  emp_flagged AS (
    SELECT * FROM employee_devs
    WHERE is_duplicated OR is_unassigned_to_client OR has_no_diagram OR is_non_work_day
  ),
  equip_flagged AS (
    SELECT * FROM equipment_devs
    WHERE is_duplicated OR is_unassigned_to_client OR (condition IS NOT NULL AND condition <> 'operativo')
  ),
  emp_by_row AS (
    SELECT
      row_id,
      jsonb_agg(
        jsonb_build_object(
          'employee_id', employee_id,
          'employee_name', employee_name,
          'employee_cuil', employee_cuil,
          'role', COALESCE(role, 'sin_rol'),
          'is_duplicated', is_duplicated,
          'is_unassigned_to_client', is_unassigned_to_client,
          'has_no_diagram', has_no_diagram,
          'is_non_work_day', is_non_work_day,
          'diagram_type_name', diagram_type_name
        )
      ) AS employee_deviations
    FROM emp_flagged
    GROUP BY row_id
  ),
  equip_by_row AS (
    SELECT
      row_id,
      jsonb_agg(
        jsonb_build_object(
          'equipment_id', equipment_id,
          'equipment_domain', equipment_domain,
          'equipment_intern_number', equipment_intern_number,
          'equipment_label', equipment_label,
          'equipment_type', equipment_type,
          'is_other_equipment', is_other_equipment,
          'condition', COALESCE(condition, 'desconocido'),
          'is_duplicated', is_duplicated,
          'is_unassigned_to_client', is_unassigned_to_client
        )
      ) AS equipment_deviations
    FROM equip_flagged
    GROUP BY row_id
  ),
  -- Equipos del cliente por fila: solo los usa el mail (p_include_context = true).
  cust_equip_by_row AS (
    SELECT
      dcer.daily_report_row_id AS row_id,
      jsonb_agg(
        jsonb_build_object(
          'name', COALESCE(ec.name, '—'),
          'type', COALESCE(ec.type::text, '—')
        )
      ) AS customer_equipment
    FROM dailyreport_customer_equipment_relations dcer
    LEFT JOIN equipos_clientes ec ON ec.id = dcer.customer_equipment_id
    INNER JOIN dailyreportrows dr ON dr.id = dcer.daily_report_row_id
    WHERE p_include_context
      AND dr.daily_report_id = p_daily_report_id
    GROUP BY dcer.daily_report_row_id
  ),
  -- Filas con algún desvío (de personal o de equipos).
  flagged_rows AS (
    SELECT row_id FROM emp_by_row
    UNION
    SELECT row_id FROM equip_by_row
  ),
  rows_data AS (
    SELECT
      dr.id AS row_id,
      dr.customer_id,
      c.name AS customer_name,
      cs.service_name AS service_name,
      si.item_name AS item_name,
      dr.start_time,
      dr.end_time,
      dr.working_day,
      dr.type_service::text AS type_service,
      dr.status::text AS status,
      dr.description,
      sec.name AS sector_name,
      ac.descripcion_corta AS area_name,
      COALESCE(ebr.employee_deviations, '[]'::jsonb) AS employee_deviations,
      COALESCE(eqr.equipment_deviations, '[]'::jsonb) AS equipment_deviations,
      COALESCE(cer.customer_equipment, '[]'::jsonb) AS customer_equipment
    FROM flagged_rows fr
    INNER JOIN dailyreportrows dr ON dr.id = fr.row_id
    -- Los joins de catálogos son solo de nombres: con p_include_context = false no se ejecutan.
    LEFT JOIN customers c ON p_include_context AND c.id = dr.customer_id
    LEFT JOIN customer_services cs ON p_include_context AND cs.id = dr.service_id
    LEFT JOIN service_items si ON p_include_context AND si.id = dr.item_id
    LEFT JOIN service_sectors ss ON p_include_context AND ss.id = dr.sector_service_id
    LEFT JOIN sectors sec ON sec.id = ss.sector_id
    LEFT JOIN service_areas sa ON p_include_context AND sa.id = dr.areas_service_id
    LEFT JOIN areas_cliente ac ON ac.id = sa.area_id
    LEFT JOIN emp_by_row ebr ON ebr.row_id = dr.id
    LEFT JOIN equip_by_row eqr ON eqr.row_id = dr.id
    LEFT JOIN cust_equip_by_row cer ON cer.row_id = dr.id
  ),
  counters AS (
    SELECT
      -- Mismas definiciones que los CTE de arriba; antes se repetían en 4 subconsultas.
      (SELECT COUNT(*) FROM employee_devs
        WHERE is_unassigned_to_client OR has_no_diagram OR is_non_work_day) AS total_employee_deviations,
      (SELECT COUNT(*) FROM equipment_devs
        WHERE is_unassigned_to_client OR (condition IS NOT NULL AND condition <> 'operativo')) AS total_equipment_deviations,
      (SELECT COUNT(DISTINCT employee_id) FROM employee_devs WHERE is_duplicated) AS total_duplicated_employees,
      (SELECT COUNT(DISTINCT equipment_id) FROM equipment_devs WHERE is_duplicated) AS total_duplicated_equipment
  ),
  rows_json AS (
    SELECT COALESCE(jsonb_agg(
      (jsonb_build_object(
        'row_id', rd.row_id,
        'employee_deviations', rd.employee_deviations,
        'equipment_deviations', rd.equipment_deviations
      ) || CASE WHEN p_include_context THEN jsonb_build_object(
        'customer_id', rd.customer_id,
        'customer_name', COALESCE(rd.customer_name, '—'),
        'service_name', COALESCE(rd.service_name, '—'),
        'item_name', COALESCE(rd.item_name, '—'),
        'start_time', rd.start_time,
        'end_time', rd.end_time,
        'working_day', rd.working_day,
        'type_service', rd.type_service,
        'status', rd.status,
        'description', rd.description,
        'sector_name', rd.sector_name,
        'area_name', rd.area_name,
        'customer_equipment', rd.customer_equipment
      ) ELSE '{}'::jsonb END)
      -- El orden solo se usa en el mail; la UI indexa por row_id.
      ORDER BY CASE WHEN p_include_context THEN rd.customer_name END,
               CASE WHEN p_include_context THEN rd.service_name END
    ), '[]'::jsonb) AS rows_with_deviations
    FROM rows_data rd
  )
  SELECT jsonb_build_object(
    'rows_with_deviations', rj.rows_with_deviations,
    'summary', jsonb_build_object(
      'total_employee_deviations', ct.total_employee_deviations,
      'total_equipment_deviations', ct.total_equipment_deviations,
      'total_duplicated_employees', ct.total_duplicated_employees,
      'total_duplicated_equipment', ct.total_duplicated_equipment,
      'total_rows_with_deviations', jsonb_array_length(rj.rows_with_deviations)
    )
  )
  INTO v_result
  FROM rows_json rj, counters ct;

  RETURN v_result;
END;
$function$;

-- Firma histórica (mail nocturno, Dashboard): misma salida de siempre.
CREATE OR REPLACE FUNCTION public.get_daily_report_deviations(p_daily_report_id uuid, p_report_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
  SELECT public.get_daily_report_deviations(p_daily_report_id, p_report_date, true);
$function$;

-- function get_daily_report_deviations_indicator (origen: prisma/migrations/20260915190000_exclude_other_equipment_from_deviations/migration.sql)
CREATE OR REPLACE FUNCTION public.get_daily_report_deviations_indicator(
  p_company_id uuid DEFAULT NULL::uuid,
  p_date date DEFAULT NULL::date,
  save_to_table boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tz text := 'America/Argentina/Buenos_Aires';
  v_date date := COALESCE(p_date, (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date);
  v_is_live boolean;
  v_result jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Solo el dia corriente se puede medir con fidelidad: es el unico en que las
  -- tablas maestras (afectaciones, diagramas, condicion del equipo) todavia
  -- estan como las vio el reporte nocturno. Estrictamente igual, no >=: los
  -- partes futuros se crean vacios por adelantado y marcarlos como medidos
  -- afirmaria "cero desvios" sobre dias que todavia no ocurrieron.
  v_is_live := v_date = (NOW() AT TIME ZONE v_tz)::date;

  WITH reports AS (
    SELECT dr.id
    FROM dailyreport dr
    WHERE dr.company_id = p_company_id
      AND dr.date = v_date
      AND dr.is_active = true
  ),
  emp AS (
    SELECT
      drr.id AS row_id,
      drr.customer_id,
      der.employee_id,
      (COUNT(*) OVER (PARTITION BY drr.daily_report_id, der.employee_id)) > 1 AS is_duplicated,
      NOT EXISTS (
        SELECT 1 FROM contractor_employee ce
        WHERE ce.employee_id = der.employee_id
          AND ce.contractor_id = drr.customer_id
      ) AS is_unassigned,
      ed.id IS NULL AS has_no_diagram,
      CASE WHEN ed.id IS NOT NULL THEN COALESCE(dt.work_active, true) = false ELSE false END AS is_non_work_day
    FROM dailyreportemployeerelations der
    INNER JOIN dailyreportrows drr ON drr.id = der.daily_report_row_id
    INNER JOIN reports r ON r.id = drr.daily_report_id
    LEFT JOIN employees_diagram ed
      ON ed.employee_id = der.employee_id
      AND ed.day = EXTRACT(DAY FROM v_date)::int
      AND ed.month = EXTRACT(MONTH FROM v_date)::int
      AND ed.year = EXTRACT(YEAR FROM v_date)::int
      AND (ed.is_active = true OR ed.is_active IS NULL)
    LEFT JOIN diagram_type dt ON dt.id = ed.diagram_type
  ),
  eq AS (
    SELECT
      drr.id AS row_id,
      drr.customer_id,
      -- Id efectivo de la relacion polimorfica: vehiculo XOR otro equipo.
      COALESCE(deq.equipment_id, deq.other_equipment_id) AS equipment_id,
      (COUNT(*) OVER (PARTITION BY drr.daily_report_id, COALESCE(deq.equipment_id, deq.other_equipment_id))) > 1 AS is_duplicated,
      CASE
        WHEN deq.other_equipment_id IS NOT NULL THEN NOT EXISTS (
          SELECT 1 FROM contractor_other_equipment coe
          WHERE coe.equipment_id = deq.other_equipment_id
            AND coe.contractor_id = drr.customer_id
        )
        ELSE NOT EXISTS (
          SELECT 1 FROM contractor_equipment ce
          WHERE ce.equipment_id = deq.equipment_id
            AND ce.contractor_id = drr.customer_id
        )
      END AS is_unassigned,
      (
        COALESCE(v.condition::text, oe.condition::text) IS NOT NULL
        AND COALESCE(v.condition::text, oe.condition::text) <> 'operativo'
      ) AS is_non_operative
    FROM dailyreportequipmentrelations deq
    INNER JOIN dailyreportrows drr ON drr.id = deq.daily_report_row_id
    INNER JOIN reports r ON r.id = drr.daily_report_id
    LEFT JOIN vehicles v ON v.id = deq.equipment_id
    LEFT JOIN other_equipment oe ON oe.id = deq.other_equipment_id
    -- Ticket 698: otros equipos excluidos temporalmente de los desvios.
    WHERE deq.other_equipment_id IS NULL
  ),
  bad_rows AS (
    SELECT row_id, customer_id FROM emp
    WHERE is_duplicated OR is_unassigned OR has_no_diagram OR is_non_work_day
    UNION
    SELECT row_id, customer_id FROM eq
    WHERE is_duplicated OR is_unassigned OR is_non_operative
  ),
  -- Los duplicados no dependen de ninguna tabla maestra, asi que se agregan
  -- aparte: son la unica parte que sobrevive al paso del tiempo.
  dup_rows AS (
    SELECT row_id, customer_id FROM emp WHERE is_duplicated
    UNION
    SELECT row_id, customer_id FROM eq WHERE is_duplicated
  ),
  emp_agg AS (
    SELECT
      COUNT(*) FILTER (WHERE is_unassigned OR has_no_diagram OR is_non_work_day)::int AS employee_deviations,
      COUNT(DISTINCT employee_id) FILTER (WHERE is_duplicated)::int AS duplicated_employees,
      COUNT(*) FILTER (WHERE is_unassigned)::int AS b_unassigned,
      COUNT(*) FILTER (WHERE has_no_diagram)::int AS b_no_diagram,
      COUNT(*) FILTER (WHERE is_non_work_day)::int AS b_non_work_day,
      COUNT(*) FILTER (WHERE is_duplicated)::int AS b_duplicated
    FROM emp
  ),
  eq_agg AS (
    SELECT
      COUNT(*) FILTER (WHERE is_unassigned OR is_non_operative)::int AS equipment_deviations,
      COUNT(DISTINCT equipment_id) FILTER (WHERE is_duplicated)::int AS duplicated_equipment,
      COUNT(*) FILTER (WHERE is_unassigned)::int AS b_unassigned,
      COUNT(*) FILTER (WHERE is_non_operative)::int AS b_non_operative,
      COUNT(*) FILTER (WHERE is_duplicated)::int AS b_duplicated
    FROM eq
  ),
  rows_agg AS (
    SELECT
      (SELECT COUNT(*) FROM bad_rows)::int AS rows_with_deviations,
      (SELECT COUNT(*) FROM dup_rows)::int AS rows_with_duplicates
  ),
  per_customer AS (
    SELECT
      c.id AS customer_id,
      COALESCE(cu.name, 'Sin cliente') AS customer_name,
      COALESCE((SELECT COUNT(*) FROM bad_rows br
                WHERE br.customer_id IS NOT DISTINCT FROM c.id), 0)::int AS rows_with_deviations,
      COALESCE((SELECT COUNT(*) FROM dup_rows dr2
                WHERE dr2.customer_id IS NOT DISTINCT FROM c.id), 0)::int AS rows_with_duplicates,
      COALESCE((SELECT COUNT(*) FROM emp e
                WHERE e.customer_id IS NOT DISTINCT FROM c.id
                  AND (e.is_unassigned OR e.has_no_diagram OR e.is_non_work_day)), 0)::int AS employee_deviations,
      COALESCE((SELECT COUNT(*) FROM eq q
                WHERE q.customer_id IS NOT DISTINCT FROM c.id
                  AND (q.is_unassigned OR q.is_non_operative)), 0)::int AS equipment_deviations,
      COALESCE((SELECT COUNT(DISTINCT e.employee_id) FROM emp e
                WHERE e.customer_id IS NOT DISTINCT FROM c.id
                  AND e.is_duplicated), 0)::int AS duplicated_employees,
      COALESCE((SELECT COUNT(DISTINCT q.equipment_id) FROM eq q
                WHERE q.customer_id IS NOT DISTINCT FROM c.id
                  AND q.is_duplicated), 0)::int AS duplicated_equipment
    FROM (SELECT DISTINCT customer_id AS id FROM bad_rows) c
    LEFT JOIN customers cu ON cu.id = c.id
  )
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      -- NULL = no medible para esa fecha. Distinto de 0, que significa "no hubo".
      'rows_with_deviations', CASE WHEN v_is_live THEN ra.rows_with_deviations ELSE NULL END,
      'employee_deviations', CASE WHEN v_is_live THEN ea.employee_deviations ELSE NULL END,
      'equipment_deviations', CASE WHEN v_is_live THEN qa.equipment_deviations ELSE NULL END,
      'duplicated_employees', ea.duplicated_employees,
      'duplicated_equipment', qa.duplicated_equipment
    ),
    'employee_breakdown', CASE WHEN v_is_live THEN jsonb_build_object(
      'unassigned_to_client', ea.b_unassigned,
      'no_diagram', ea.b_no_diagram,
      'non_work_day', ea.b_non_work_day,
      'duplicated', ea.b_duplicated
    ) ELSE jsonb_build_object('duplicated', ea.b_duplicated) END,
    'equipment_breakdown', CASE WHEN v_is_live THEN jsonb_build_object(
      'unassigned_to_client', qa.b_unassigned,
      'non_operative_condition', qa.b_non_operative,
      'duplicated', qa.b_duplicated
    ) ELSE jsonb_build_object('duplicated', qa.b_duplicated) END,
    'by_customer', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'customer_id', pc.customer_id,
        'customer_name', pc.customer_name,
        'rows_with_deviations', CASE WHEN v_is_live THEN pc.rows_with_deviations ELSE NULL END,
        'employee_deviations', CASE WHEN v_is_live THEN pc.employee_deviations ELSE NULL END,
        'equipment_deviations', CASE WHEN v_is_live THEN pc.equipment_deviations ELSE NULL END,
        'duplicated_employees', pc.duplicated_employees,
        'duplicated_equipment', pc.duplicated_equipment
      ) ORDER BY pc.customer_name)
      FROM per_customer pc
      -- En backfill solo interesan los clientes que aportan duplicados.
      WHERE v_is_live OR pc.duplicated_employees > 0 OR pc.duplicated_equipment > 0
    ), '[]'::jsonb),
    'meta', jsonb_build_object(
      'report_date', v_date,
      -- true = los cinco indicadores son fieles al reporte de esa noche.
      -- false = solo los duplicados; el resto viaja en NULL.
      'captured_live', v_is_live
    )
  )
  INTO v_result
  FROM rows_agg ra
  CROSS JOIN emp_agg ea
  CROSS JOIN eq_agg qa;

  IF save_to_table AND p_company_id IS NOT NULL THEN
    INSERT INTO public.daily_indicators (id, company_id, snapshot_date, metrics, source, created_at)
    VALUES (
      gen_random_uuid(),
      p_company_id,
      v_date,
      v_result,
      'get_daily_report_deviations_indicator'::public.indicator_function,
      now()
    )
    ON CONFLICT (company_id, snapshot_date, source)
    DO UPDATE SET metrics = EXCLUDED.metrics, created_at = now()
    -- Un backfill nunca degrada un snapshot que ya se tomo en vivo.
    WHERE COALESCE(daily_indicators.metrics->'meta'->>'captured_live', 'false') <> 'true'
       OR COALESCE(EXCLUDED.metrics->'meta'->>'captured_live', 'false') = 'true';
  END IF;

  RETURN v_result;
END;
$function$;

-- function get_dailyreportrow_history (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.get_dailyreportrow_history(p_row_id uuid)
 RETURNS TABLE(id uuid, action_type text, changed_fields jsonb, changed_data jsonb, changed_by jsonb, created_at timestamp with time zone, related_table text, related_id uuid, metadata jsonb, reassignment_reason text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        h.id,
        h.action_type,
        h.changed_fields,
        h.changed_data,
        -- Task 4: el usuario sale de profile (credential_id = uid de Supabase), no de la tabla de usuarios de Supabase.
        -- Se conserva la forma del JSON que lee src/ (id, email, raw_user_meta_data.full_name).
        CASE WHEN u.credential_id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', u.credential_id,
            'email', u.email,
            'raw_user_meta_data', jsonb_build_object('full_name', u.fullname)
        ) END as changed_by,
        h.created_at,
        h.related_table,
        h.related_id,
        h.metadata,
        h.reassignment_reason
    FROM 
        dailyreportrows_history h
    LEFT JOIN 
        profile u ON h.changed_by = u.credential_id
    WHERE 
        h.daily_report_row_id = p_row_id
    ORDER BY 
        h.created_at DESC;
END;
$function$;

-- function log_dailyreport_changes (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.log_dailyreport_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$DECLARE
    user_id UUID;
    changed_fields JSONB;
    readable_data JSONB;
    row_exists BOOLEAN;
    v_reassignment_reason TEXT; -- Variable para capturar el motivo de reasignación
BEGIN
    -- Intentar obtener el motivo de reasignación (si existe)
    BEGIN
        v_reassignment_reason := current_setting('myapp.reassignment_reason', true);
        -- Agregar log para depuración
        RAISE NOTICE 'Valor de reassignment_reason obtenido: %', v_reassignment_reason;
    EXCEPTION WHEN OTHERS THEN
        v_reassignment_reason := NULL;
        RAISE NOTICE 'Error al obtener reassignment_reason, establecido a NULL';
    END;

    -- Actor de la transaccion (app.user_id via withActor); NULL si no hay usuario
    user_id := public.app_current_user_id();
    
    IF TG_OP = 'UPDATE' THEN
        -- Verify the row exists before proceeding
        SELECT EXISTS(SELECT 1 FROM dailyreportrows WHERE id = NEW.id) INTO row_exists;
        
        IF NOT row_exists THEN
            -- Skip logging if row doesn't exist
            RAISE NOTICE 'Fila no existe, omitiendo';
            RETURN NEW;
        END IF;
    
        changed_fields := '{}'::JSONB;
        
        IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
            changed_fields := jsonb_set(changed_fields, '{customer_id}', 
                jsonb_build_object('old', OLD.customer_id, 'new', NEW.customer_id));
        END IF;
        
        IF NEW.service_id IS DISTINCT FROM OLD.service_id THEN
            changed_fields := jsonb_set(changed_fields, '{service_id}', 
                jsonb_build_object('old', OLD.service_id, 'new', NEW.service_id));
        END IF;

        IF NEW.completed_night IS DISTINCT FROM OLD.completed_night THEN
            changed_fields := jsonb_set(changed_fields, '{completed_night}', 
                jsonb_build_object('old', OLD.completed_night, 'new', NEW.completed_night));
        END IF;

        IF NEW.completed_day IS DISTINCT FROM OLD.completed_day THEN
            changed_fields := jsonb_set(changed_fields, '{completed_day}', 
                jsonb_build_object('old', OLD.completed_day, 'new', NEW.completed_day));
        END IF;
        
IF NEW.item_id IS DISTINCT FROM OLD.item_id THEN
    changed_fields := jsonb_set(changed_fields, '{item_id}', 
        jsonb_build_object(
            'old',(SELECT item_name FROM service_items WHERE id = OLD.item_id),
            'new', (SELECT item_name FROM service_items WHERE id = NEW.item_id)
        ));
END IF;
        
        IF NEW.working_day IS DISTINCT FROM OLD.working_day THEN
            changed_fields := jsonb_set(changed_fields, '{working_day}', 
                jsonb_build_object('old', OLD.working_day, 'new', NEW.working_day));
        END IF;
        
        IF NEW.start_time IS DISTINCT FROM OLD.start_time THEN
            changed_fields := jsonb_set(changed_fields, '{start_time}', 
                jsonb_build_object('old', OLD.start_time::TEXT, 'new', NEW.start_time::TEXT));
        END IF;
        
        IF NEW.end_time IS DISTINCT FROM OLD.end_time THEN
            changed_fields := jsonb_set(changed_fields, '{end_time}', 
                jsonb_build_object('old', OLD.end_time::TEXT, 'new', NEW.end_time::TEXT));
        END IF;
        
        IF NEW.description IS DISTINCT FROM OLD.description THEN
            changed_fields := jsonb_set(changed_fields, '{description}', 
                jsonb_build_object('old', OLD.description, 'new', NEW.description));
        END IF;
        
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            changed_fields := jsonb_set(changed_fields, '{status}', 
                jsonb_build_object('old', OLD.status::TEXT, 'new', NEW.status::TEXT));
        END IF;

        -- Eliminados los bloques que comparan employee_id y equipment_id porque no existen en esta tabla
        
        IF NEW.sector_service_id IS DISTINCT FROM OLD.sector_service_id THEN
            changed_fields := jsonb_set(changed_fields, '{sector_service_id}', 
                jsonb_build_object('old', OLD.sector_service_id, 'new', NEW.sector_service_id));
        END IF;
        
        IF NEW.areas_service_id IS DISTINCT FROM OLD.areas_service_id THEN
            changed_fields := jsonb_set(changed_fields, '{areas_service_id}', 
                jsonb_build_object('old', OLD.areas_service_id, 'new', NEW.areas_service_id));
        END IF;
        
        IF NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason THEN
            changed_fields := jsonb_set(changed_fields, '{cancel_reason}', 
                jsonb_build_object('old', OLD.cancel_reason, 'new', NEW.cancel_reason));
        END IF;
        
        IF NEW.type_service IS DISTINCT FROM OLD.type_service THEN
            changed_fields := jsonb_set(changed_fields, '{type_service}', 
                jsonb_build_object('old', OLD.type_service::TEXT, 'new', NEW.type_service::TEXT));
        END IF;
        
        IF changed_fields != '{}'::JSONB THEN
            BEGIN
                SELECT jsonb_build_object(
                    'customer_name', (SELECT name FROM customers WHERE id = NEW.customer_id),
                    'service_name', (SELECT service_name FROM customer_services WHERE id = NEW.service_id),
                    'item_name', (SELECT item_name FROM service_items WHERE id = NEW.item_id),
                    'working_day', NEW.working_day,
                    'status', NEW.status,
                    'type_service', NEW.type_service
                ) INTO readable_data;
                
                RAISE NOTICE 'Insertando en dailyreportrows_history. Action: UPDATE, Reason: %', v_reassignment_reason;
                
                INSERT INTO dailyreportrows_history (
                    daily_report_row_id,
                    related_table,
                    related_id,
                    action_type,
                    changed_fields,
                    changed_data,
                    changed_by,
                    reassignment_reason
                ) VALUES (
                    NEW.id,
                    TG_TABLE_NAME,
                    NEW.id,
                    'UPDATE',
                    changed_fields,
                    readable_data,
                    user_id,
                    v_reassignment_reason
                );
                
                -- Limpiar la variable de sesión después de usarla
                IF v_reassignment_reason IS NOT NULL THEN
                    PERFORM set_config('myapp.reassignment_reason', NULL, false);
                    RAISE NOTICE 'Variable de sesión de motivo de reasignación limpiada';
                END IF;
                
            EXCEPTION WHEN foreign_key_violation THEN
                RAISE NOTICE 'Excepción de clave foránea en INSERT';
                NULL;
            WHEN OTHERS THEN
                RAISE NOTICE 'Error durante la inserción: %', SQLERRM;
            END;
        END IF;
        
    ELSIF TG_OP = 'INSERT' THEN
        BEGIN
            SELECT jsonb_build_object(
                'customer_name', (SELECT name FROM customers WHERE id = NEW.customer_id),
                'service_name', (SELECT service_name FROM customer_services WHERE id = NEW.service_id),
                'item_name', (SELECT item_name FROM service_items WHERE id = NEW.item_id),
                'working_day', NEW.working_day,
                'status', NEW.status,
                'type_service', NEW.type_service
            ) INTO readable_data;
            
            RAISE NOTICE 'Insertando en dailyreportrows_history. Action: CREATE';
            
            INSERT INTO dailyreportrows_history (
                daily_report_row_id,
                related_table,
                related_id,
                action_type,
                changed_fields,
                changed_data,
                changed_by,
                reassignment_reason
            ) VALUES (
                NEW.id,
                TG_TABLE_NAME,
                NEW.id,
                'CREATE',
                '{}'::JSONB,
                readable_data,
                user_id,
                NULL -- No hay motivo de reasignación para nuevas filas
            );
        EXCEPTION WHEN foreign_key_violation THEN
            RAISE NOTICE 'Excepción de clave foránea en INSERT para CREATE';
            NULL;
        END;
        
    ELSIF TG_OP = 'DELETE' THEN
        BEGIN
            SELECT EXISTS(SELECT 1 FROM dailyreportrows_history WHERE daily_report_row_id = OLD.id) INTO row_exists;
            
            IF row_exists THEN
                SELECT jsonb_build_object(
                    'customer_name', (SELECT name FROM customers WHERE id = OLD.customer_id),
                    'service_name', (SELECT service_name FROM customer_services WHERE id = OLD.service_id),
                    'item_name', (SELECT item_name FROM service_items WHERE id = OLD.item_id),
                    'working_day', OLD.working_day,
                    'status', OLD.status,
                    'type_service', OLD.type_service
                ) INTO readable_data;
                
                RAISE NOTICE 'Insertando en dailyreportrows_history. Action: DELETE';
                
                INSERT INTO dailyreportrows_history (
                    daily_report_row_id,
                    related_table,
                    related_id,
                    action_type,
                    changed_fields,
                    changed_data,
                    changed_by,
                    reassignment_reason
                ) VALUES (
                    OLD.id,
                    TG_TABLE_NAME,
                    OLD.id,
                    'DELETE',
                    '{}'::JSONB,
                    readable_data,
                    user_id,
                    NULL -- No hay motivo de reasignación para eliminaciones
                );
            END IF;
        EXCEPTION WHEN foreign_key_violation THEN
            RAISE NOTICE 'Excepción de clave foránea en INSERT para DELETE';
            NULL;
        END;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;$function$;

-- function marcar_prepartes_vencidos (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
-- Task 4: portada desde objects.json (era huerfana: la llamaba el cron de Supabase). Llamador: job P5.
CREATE OR REPLACE FUNCTION public.marcar_prepartes_vencidos()
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
    );
END;$function$;

-- ============================================================================
-- VIEWS (1)
-- ============================================================================

-- view equipments_with_pending_deviations (origen: prisma/migrations/20260919130100_drop_repair_solicitudes/migration.sql)
CREATE OR REPLACE VIEW public.equipments_with_pending_deviations AS
 SELECT DISTINCT v.id,
    v.domain,
    v.serie,
    v.intern_number,
    v.company_id,
    tv.name AS type_name,
    count(DISTINCT cd.id) AS deviation_count,
    max(cd.created_at) AS last_deviation_date
   FROM ((public.checklist_deviations cd
     JOIN public.vehicles v ON ((cd.equipment_id = v.id)))
     LEFT JOIN public.types_of_vehicles tv ON ((v.type_of_vehicle = tv.id)))
  WHERE (NOT (EXISTS ( SELECT 1
           FROM public.maintenance_request_items mri
          WHERE (mri.checklist_deviation_id = cd.id))))
  GROUP BY v.id, v.domain, v.serie, v.intern_number, v.company_id, tv.name
 HAVING (count(DISTINCT cd.id) > 0)
  ORDER BY (max(cd.created_at)) DESC;

-- ============================================================================
-- TRIGGERS (6)
-- ============================================================================

-- trigger tr_dailyreport_customer_equipment_relations_history ON dailyreport_customer_equipment_relations (origen: supabase/migrations/20251103211302_initial_structure.sql)
DROP TRIGGER IF EXISTS tr_dailyreport_customer_equipment_relations_history ON public.dailyreport_customer_equipment_relations;
CREATE TRIGGER tr_dailyreport_customer_equipment_relations_history BEFORE INSERT OR DELETE ON public.dailyreport_customer_equipment_relations FOR EACH ROW EXECUTE FUNCTION public.log_customer_equipment_relations_changes();

-- trigger tr_dailyreport_employee_relations_history ON dailyreportemployeerelations (origen: supabase/migrations/20251103211302_initial_structure.sql)
DROP TRIGGER IF EXISTS tr_dailyreport_employee_relations_history ON public.dailyreportemployeerelations;
CREATE TRIGGER tr_dailyreport_employee_relations_history BEFORE INSERT OR DELETE ON public.dailyreportemployeerelations FOR EACH ROW EXECUTE FUNCTION public.log_employee_relations_changes();

-- trigger tr_dailyreport_equipment_relations_history ON dailyreportequipmentrelations (origen: supabase/migrations/20251103211302_initial_structure.sql)
DROP TRIGGER IF EXISTS tr_dailyreport_equipment_relations_history ON public.dailyreportequipmentrelations;
CREATE TRIGGER tr_dailyreport_equipment_relations_history BEFORE INSERT OR DELETE ON public.dailyreportequipmentrelations FOR EACH ROW EXECUTE FUNCTION public.log_equipment_relations_changes();

-- trigger tr_after_dailyreportrows_update_optimized: ELIMINADO en T4 (migracion 20261019100300); la funcion se conserva hasta T6

-- trigger tr_dailyreportrows_history_after_insert ON dailyreportrows (T4: sentencia con tabla de transicion)
DROP TRIGGER IF EXISTS tr_dailyreportrows_history_after_insert ON public.dailyreportrows;
CREATE TRIGGER tr_dailyreportrows_history_after_insert
  AFTER INSERT ON public.dailyreportrows
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.log_dailyreportrows_insert_history();

-- trigger tr_dailyreportrows_history_before_update ON dailyreportrows (T4: sentencia con tablas de transicion)
DROP TRIGGER IF EXISTS tr_dailyreportrows_history_before_update ON public.dailyreportrows;
CREATE TRIGGER tr_dailyreportrows_history_before_update
  AFTER UPDATE ON public.dailyreportrows
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.log_dailyreportrows_update_history();

-- function log_remito_changes (remitos: fuente única del remito de una línea)
-- Registra en el historial de la línea el alta (LINK), la baja (UNLINK) y el cambio de número
-- (UPDATE) de cada remito. Mismo mecanismo que las relaciones de empleados y equipos.
CREATE OR REPLACE FUNCTION public.log_remito_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    user_id UUID;
    parent_exists BOOLEAN;
BEGIN
    -- Actor de la transaccion (app.user_id via withActor); NULL si no hay usuario
    user_id := public.app_current_user_id();

    IF TG_OP = 'INSERT' THEN
        BEGIN
            INSERT INTO dailyreportrows_history (
                daily_report_row_id, related_table, related_id, action_type,
                changed_fields, changed_data, changed_by
            ) VALUES (
                NEW.daily_report_row_id, 'remitos', NEW.id, 'LINK',
                '{}'::JSONB,
                jsonb_build_object('remito_numero', NEW.remit_number, 'vinculado', NEW.is_linked),
                user_id
            );
        EXCEPTION WHEN foreign_key_violation THEN
            NULL;
        END;

    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.remit_number IS DISTINCT FROM OLD.remit_number THEN
            BEGIN
                INSERT INTO dailyreportrows_history (
                    daily_report_row_id, related_table, related_id, action_type,
                    changed_fields, changed_data, changed_by
                ) VALUES (
                    NEW.daily_report_row_id, 'remitos', NEW.id, 'UPDATE',
                    jsonb_build_object('remit_number', jsonb_build_object('old', OLD.remit_number, 'new', NEW.remit_number)),
                    jsonb_build_object('remito_numero', NEW.remit_number, 'vinculado', NEW.is_linked),
                    user_id
                );
            EXCEPTION WHEN foreign_key_violation THEN
                NULL;
            END;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        -- Si la línea se está borrando (cascada), no hay historial donde escribir
        SELECT EXISTS (SELECT 1 FROM dailyreportrows WHERE id = OLD.daily_report_row_id) INTO parent_exists;
        IF parent_exists THEN
            BEGIN
                INSERT INTO dailyreportrows_history (
                    daily_report_row_id, related_table, related_id, action_type,
                    changed_fields, changed_data, changed_by
                ) VALUES (
                    OLD.daily_report_row_id, 'remitos', OLD.id, 'UNLINK',
                    '{}'::JSONB,
                    jsonb_build_object('remito_numero', OLD.remit_number, 'vinculado', OLD.is_linked),
                    user_id
                );
            EXCEPTION WHEN foreign_key_violation THEN
                NULL;
            END;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$function$;

-- function log_remito_document_changes
-- Registra en el historial de la línea el alta (LINK) y la baja (UNLINK) de cada documento de un remito.
CREATE OR REPLACE FUNCTION public.log_remito_document_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    user_id UUID;
    v_row_id UUID;
    v_remit_number TEXT;
BEGIN
    user_id := public.app_current_user_id();

    -- Si el remito ya no existe (se borró y los documentos caen por cascada), su baja ya quedó registrada
    SELECT r.daily_report_row_id, r.remit_number INTO v_row_id, v_remit_number
    FROM remitos r
    WHERE r.id = COALESCE(NEW.remit_id, OLD.remit_id);

    IF v_row_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    BEGIN
        INSERT INTO dailyreportrows_history (
            daily_report_row_id, related_table, related_id, action_type,
            changed_fields, changed_data, changed_by
        ) VALUES (
            v_row_id, 'remito_documents', COALESCE(NEW.id, OLD.id),
            CASE WHEN TG_OP = 'INSERT' THEN 'LINK' ELSE 'UNLINK' END,
            '{}'::JSONB,
            jsonb_build_object(
                'remito_numero', v_remit_number,
                'documento_nombre', COALESCE(NEW.document_name, OLD.document_name)
            ),
            user_id
        );
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    RETURN COALESCE(NEW, OLD);
END;
$function$;

-- trigger tr_remitos_history ON remitos
DROP TRIGGER IF EXISTS tr_remitos_history ON public.remitos;
CREATE TRIGGER tr_remitos_history AFTER INSERT OR DELETE OR UPDATE OF remit_number ON public.remitos FOR EACH ROW EXECUTE FUNCTION public.log_remito_changes();

-- trigger tr_remito_documents_history ON remito_documents
DROP TRIGGER IF EXISTS tr_remito_documents_history ON public.remito_documents;
CREATE TRIGGER tr_remito_documents_history AFTER INSERT OR DELETE ON public.remito_documents FOR EACH ROW EXECUTE FUNCTION public.log_remito_document_changes();
