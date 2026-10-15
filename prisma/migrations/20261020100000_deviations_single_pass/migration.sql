-- Desvíos del parte diario en UNA sola pasada.
--
-- Antes: los 4 contadores del resumen repetían los joins de los CTE (employees_diagram, contractor_*,
-- vehicles) con subconsultas aparte, y la UI pagaba lo que arma el mail (nombres de catálogos, equipos del
-- cliente, ORDER BY). Ahora:
--  * los contadores salen de los CTE ya calculados (misma definición de "desvío", escrita una sola vez);
--  * `p_include_context = false` devuelve solo `row_id` + desvíos (lo único que consume la UI) y no arma los
--    7 joins de catálogos, los equipos del cliente ni el ORDER BY;
--  * la firma de 2 argumentos se conserva (mail nocturno y Dashboard) y delega con `true`: misma salida.
-- Ticket 698 (otros equipos excluidos de los desvíos) se mantiene: es temporal, no borrar.

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
