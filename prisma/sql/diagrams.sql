-- Generado por scripts/sql/extract-sql-objects.ts — editar a mano SOLO en la revisión de Task 4
-- Dominio: diagrams — 13 objeto(s)

-- ============================================================================
-- FUNCTIONS (12)
-- ============================================================================

-- function check_diagram_conflicts_with_operations_v2 (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.check_diagram_conflicts_with_operations_v2(p_employee_ids text[], p_work_diagram_id uuid, p_date_from date, p_date_to date)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    conflict_record RECORD;
    operation_conflicts json[] := '{}';
    simple_conflicts json[] := '{}';
    result json;
BEGIN
    -- Verificar conflictos con operaciones (registros en uso)
    FOR conflict_record IN
        SELECT DISTINCT
            ed.employee_id,
            CONCAT(e.firstname, ' ', e.lastname) as employee_name,
            TO_CHAR(make_date(ed.year, ed.month, ed.day), 'DD/MM/YYYY') as date,
            dt.name as diagram_type
        FROM employees_diagram ed
        JOIN employees e ON e.id = ed.employee_id::uuid
        JOIN diagram_type dt ON dt.id = ed.diagram_type::uuid
        WHERE ed.employee_id = ANY(p_employee_ids)
          AND make_date(ed.year, ed.month, ed.day) BETWEEN p_date_from AND p_date_to
          AND EXISTS (
              SELECT 1 
              FROM dailyreportemployeerelations drer
              JOIN dailyreportrows drr ON drr.id = drer.daily_report_row_id
              JOIN dailyreport dr ON dr.id = drr.daily_report_id
              WHERE drer.employee_id = ed.employee_id::uuid
                AND dr.date = make_date(ed.year, ed.month, ed.day)
          )
    LOOP
        operation_conflicts := operation_conflicts || json_build_object(
            'employee_id', conflict_record.employee_id,
            'employee_name', conflict_record.employee_name,
            'date', conflict_record.date,
            'diagram_type', conflict_record.diagram_type,
            'conflict_type', 'OPERATION_IN_USE'
        );
    END LOOP;

    -- Verificar conflictos simples (registros existentes pero no en uso)
    FOR conflict_record IN
        SELECT DISTINCT
            ed.employee_id,
            CONCAT(e.firstname, ' ', e.lastname) as employee_name,
            TO_CHAR(make_date(ed.year, ed.month, ed.day), 'DD/MM/YYYY') as date,
            dt.name as diagram_type
        FROM employees_diagram ed
        JOIN employees e ON e.id = ed.employee_id::uuid
        JOIN diagram_type dt ON dt.id = ed.diagram_type::uuid
        WHERE ed.employee_id = ANY(p_employee_ids)
          AND make_date(ed.year, ed.month, ed.day) BETWEEN p_date_from AND p_date_to
          AND NOT EXISTS (
              SELECT 1 
              FROM dailyreportemployeerelations drer
              JOIN dailyreportrows drr ON drr.id = drer.daily_report_row_id
              JOIN dailyreport dr ON dr.id = drr.daily_report_id
              WHERE drer.employee_id = ed.employee_id::uuid
                AND dr.date = make_date(ed.year, ed.month, ed.day)
          )
    LOOP
        simple_conflicts := simple_conflicts || json_build_object(
            'employee_id', conflict_record.employee_id,
            'employee_name', conflict_record.employee_name,
            'date', conflict_record.date,
            'diagram_type', conflict_record.diagram_type,
            'conflict_type', 'SIMPLE_CONFLICT'
        );
    END LOOP;

    -- Construir resultado
    result := json_build_object(
        'operation_conflicts', array_to_json(operation_conflicts),
        'simple_conflicts', array_to_json(simple_conflicts),
        'total_operation_conflicts', array_length(operation_conflicts, 1),
        'total_simple_conflicts', array_length(simple_conflicts, 1)
    );

    RETURN result;
END;
$function$;

-- function check_novelty_conflicts (origen: prisma/migrations/20260416180000_add_novelty_massive_rpcs/migration.sql)
CREATE OR REPLACE FUNCTION public.check_novelty_conflicts(
  p_employee_ids text[],
  p_diagram_type_id text,
  p_date_from date,
  p_date_to date
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_conflicts json[];
  v_conflict_record json;
  v_current_date date;
  employee_record RECORD;
  v_existing_diagram_id uuid;
  v_existing_diagram_name text;
  v_existing_diagram_color text;
  v_new_novelty_name text;
  v_new_novelty_color text;
BEGIN
  -- Info de la novedad nueva
  SELECT dt.name, dt.color
    INTO v_new_novelty_name, v_new_novelty_color
  FROM diagram_type dt
  WHERE dt.id = p_diagram_type_id::uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Novelty not found: %', p_diagram_type_id;
  END IF;

  -- Por cada empleado × día del rango: ver si ya existe registro y si está en uso por operaciones
  FOR employee_record IN
    SELECT e.id, e.firstname, e.lastname
    FROM employees e
    WHERE e.id::text = ANY(p_employee_ids)
  LOOP
    v_current_date := p_date_from;
    WHILE v_current_date <= p_date_to LOOP
      SELECT ed.diagram_type, dt.name, dt.color
        INTO v_existing_diagram_id, v_existing_diagram_name, v_existing_diagram_color
      FROM employees_diagram ed
      LEFT JOIN diagram_type dt ON ed.diagram_type = dt.id
      WHERE ed.employee_id = employee_record.id
        AND ed.day = EXTRACT(DAY FROM v_current_date)
        AND ed.month = EXTRACT(MONTH FROM v_current_date)
        AND ed.year = EXTRACT(YEAR FROM v_current_date);

      IF FOUND THEN
        IF EXISTS (
          SELECT 1
          FROM dailyreportemployeerelations drer
          JOIN dailyreportrows drr ON drer.daily_report_row_id = drr.id
          JOIN dailyreport dr ON drr.daily_report_id = dr.id
          WHERE drer.employee_id = employee_record.id
            AND dr.date = v_current_date
        ) THEN
          -- IN_USE: no se puede actualizar
          v_conflict_record := json_build_object(
            'employee_id', employee_record.id,
            'employee_name', employee_record.firstname || ' ' || employee_record.lastname,
            'day', EXTRACT(DAY FROM v_current_date),
            'month', EXTRACT(MONTH FROM v_current_date),
            'year', EXTRACT(YEAR FROM v_current_date),
            'date_formatted', v_current_date::text,
            'current_diagram_type', v_existing_diagram_id,
            'current_diagram_name', COALESCE(v_existing_diagram_name, 'Sin nombre'),
            'current_diagram_color', COALESCE(v_existing_diagram_color, '#6b7280'),
            'new_diagram_name', COALESCE(v_new_novelty_name, 'Sin nombre'),
            'new_diagram_color', COALESCE(v_new_novelty_color, '#6b7280'),
            'is_used_in_operations', true,
            'can_update', false,
            'conflict_type', 'IN_USE'
          );
        ELSE
          -- CAN_UPDATE: se puede reemplazar
          v_conflict_record := json_build_object(
            'employee_id', employee_record.id,
            'employee_name', employee_record.firstname || ' ' || employee_record.lastname,
            'day', EXTRACT(DAY FROM v_current_date),
            'month', EXTRACT(MONTH FROM v_current_date),
            'year', EXTRACT(YEAR FROM v_current_date),
            'date_formatted', v_current_date::text,
            'current_diagram_type', v_existing_diagram_id,
            'current_diagram_name', COALESCE(v_existing_diagram_name, 'Sin nombre'),
            'current_diagram_color', COALESCE(v_existing_diagram_color, '#6b7280'),
            'new_diagram_name', COALESCE(v_new_novelty_name, 'Sin nombre'),
            'new_diagram_color', COALESCE(v_new_novelty_color, '#6b7280'),
            'is_used_in_operations', false,
            'can_update', true,
            'conflict_type', 'CAN_UPDATE'
          );
        END IF;
        v_conflicts := array_append(v_conflicts, v_conflict_record);
      END IF;

      v_current_date := v_current_date + INTERVAL '1 day';
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'conflicts', COALESCE(v_conflicts, '{}'),
    'diagram_type_id', p_diagram_type_id
  );
END;
$$;

-- function get_employee_diagram_count_by_day (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.get_employee_diagram_count_by_day(p_day integer, p_month integer, p_year integer, p_company_position_ids uuid[] DEFAULT NULL::uuid[], save_to_table boolean DEFAULT false, p_company_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE 
  total_active_employees INTEGER; 
  employees_with_diagram INTEGER; 
  employees_without_diagram INTEGER; 
  result_array JSON; 
BEGIN 
  -- Contar empleados activos (con filtro opcional por company_position) 
  SELECT COUNT(*) 
  INTO total_active_employees 
  FROM employees e 
  WHERE e.is_active = true 
    AND ( 
      p_company_position_ids IS NULL 
      OR array_length(p_company_position_ids, 1) = 0 
      OR e.company_position = ANY(p_company_position_ids) 
    )
    AND (p_company_id IS NULL OR e.company_id = p_company_id); 

  -- Contar empleados que tienen diagrama para el día especificado 
  SELECT COUNT(DISTINCT e.id) 
  INTO employees_with_diagram 
  FROM employees e 
  JOIN employees_diagram ed ON e.id = ed.employee_id 
  WHERE e.is_active = true 
    AND ed.day = p_day 
    AND ed.month = p_month 
    AND ed.year = p_year 
    AND ( 
      p_company_position_ids IS NULL 
      OR array_length(p_company_position_ids, 1) = 0 
      OR e.company_position = ANY(p_company_position_ids) 
    )
    AND (p_company_id IS NULL OR e.company_id = p_company_id); 
  
  -- Calcular empleados sin diagrama de forma más directa 
  employees_without_diagram := total_active_employees - employees_with_diagram; 
  
  -- Construir el array de resultados 
  WITH diagram_counts AS ( 
    SELECT 
      dt.id as diagram_type_id, 
      dt.name as diagram_type_name, 
      dt.color as diagram_type_color, 
      COUNT(DISTINCT ed.employee_id) as cantidad_empleados 
    FROM diagram_type dt 
    JOIN employees_diagram ed ON dt.id = ed.diagram_type 
    JOIN employees e ON ed.employee_id = e.id 
    WHERE ed.day = p_day 
      AND ed.month = p_month 
      AND ed.year = p_year 
      AND e.is_active = true 
      AND ( 
        p_company_position_ids IS NULL 
        OR array_length(p_company_position_ids, 1) = 0 
        OR e.company_position = ANY(p_company_position_ids) 
      )
      AND (p_company_id IS NULL OR e.company_id = p_company_id) 
    GROUP BY dt.id, dt.name, dt.color 
  ), 
  diagram_results AS ( 
    SELECT 
      diagram_type_id::TEXT as diagram_type_id_text, 
      diagram_type_name, 
      diagram_type_color, 
      cantidad_empleados 
    FROM diagram_counts 
  ), 
  combined_results AS ( 
    -- Resultados de diagram_types con empleados 
    SELECT * FROM diagram_results 
    
    UNION ALL 
    
    -- Agregar el objeto "Sin diagrama" de forma explícita 
    SELECT 
      '0' as diagram_type_id_text, 
      'Sin diagrama' as diagram_type_name, 
      '#CCCCCC' as diagram_type_color, 
      employees_without_diagram as cantidad_empleados 
    WHERE employees_without_diagram > 0 
  ),
  
  -- Insertar en daily_indicators si save_to_table es true
  insert_data AS (
    INSERT INTO public.daily_indicators (
      company_id,
      snapshot_date,
      metrics,
      source
    )
    SELECT 
      p_company_id,
      make_date(p_year, p_month, p_day),
      json_agg(
        json_build_object(
          'diagram_type_id', diagram_type_id_text,
          'diagram_type_name', diagram_type_name,
          'diagram_type_color', diagram_type_color,
          'cantidad_empleados', cantidad_empleados
        )
      ),
      'get_employee_diagram_count_by_day'::public.indicator_function
    FROM combined_results
    WHERE save_to_table = true AND p_company_id IS NOT NULL
    GROUP BY p_company_id
    -- P5: idempotencia del job diario (ver get_company_counts_indicator en kpis.sql).
    ON CONFLICT (company_id, snapshot_date, source)
    DO UPDATE SET metrics = EXCLUDED.metrics, created_at = NOW()
    RETURNING id
  )
  
  SELECT json_agg( 
    json_build_object( 
      'diagram_type_id', diagram_type_id_text, 
      'diagram_type_name', diagram_type_name, 
      'diagram_type_color', diagram_type_color, 
      'cantidad_empleados', cantidad_empleados 
    ) 
  ) 
  INTO result_array 
  FROM combined_results; 

  -- Si no hay resultados, devolver un array vacío 
  RETURN COALESCE(result_array, '[]'::json); 
END; 
$function$;

-- function handle_employees_diagram_changes (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.handle_employees_diagram_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$DECLARE
    v_short_description TEXT;
    v_prev_date TIMESTAMPTZ;
    v_diagram_name TEXT;
    v_old_diagram_name TEXT;
BEGIN
    -- Obtener la descripción corta y el nombre del diagrama actual
    SELECT short_description, name INTO v_short_description, v_diagram_name
    FROM diagram_type
    WHERE id = NEW.diagram_type;

    -- Formatear la fecha
    v_prev_date := TO_TIMESTAMP(NEW.day || '-' || NEW.month || '-' || NEW.year || ' 00:00:00', 'DD-MM-YYYY HH24:MI:SS');

    -- Insertar en diagrams_logs
    IF TG_OP = 'INSERT' THEN
        INSERT INTO diagrams_logs (prev_date, description, state, prev_state, employee_id, diagram_id)
        VALUES (v_prev_date, v_short_description, v_diagram_name, 'Nuevo', NEW.employee_id, NEW.diagram_type);
    ELSIF TG_OP = 'UPDATE' THEN
        -- Obtener el nombre del diagrama anterior
        SELECT name INTO v_old_diagram_name
        FROM diagram_type
        WHERE id = OLD.diagram_type;

        -- Obtener la fecha anterior
        v_prev_date := TO_TIMESTAMP(OLD.day || '-' || OLD.month || '-' || OLD.year || ' 00:00:00', 'DD-MM-YYYY HH24:MI:SS');
        
        INSERT INTO diagrams_logs (prev_date, description, state, prev_state, employee_id, diagram_id)
        VALUES (v_prev_date, v_short_description, v_diagram_name, v_old_diagram_name, NEW.employee_id, NEW.diagram_type);
    END IF;

    RETURN NEW;
END;$function$;

-- function hr_get_absenteeism_summary (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.hr_get_absenteeism_summary(p_company_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, save_to_table boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  tz text := 'America/Argentina/Buenos_Aires';
  today date := (now() at time zone tz)::date;
  dfrom date := COALESCE(p_from, date_trunc('month', today)::date);
  dto date := COALESCE(p_to, today);
  dotacion_anterior int;
  altas int;
  bajas int;
  dotacion_actual int;
  total_ausentes int;
  porcentaje numeric;
  result jsonb;
BEGIN
  SELECT count(*) INTO dotacion_anterior
  FROM public.employees e
  WHERE e.company_id = p_company_id
    AND e.date_of_admission <= (dfrom - 1)
    AND (e.termination_date IS NULL OR e.termination_date > (dfrom - 1));

  SELECT count(*) INTO altas
  FROM public.employees e
  WHERE e.company_id = p_company_id
    AND e.date_of_admission BETWEEN dfrom AND dto;

  SELECT count(*) INTO bajas
  FROM public.employees e
  WHERE e.company_id = p_company_id
    AND e.termination_date BETWEEN dfrom AND dto;

  SELECT count(*) INTO dotacion_actual
  FROM public.employees e
  WHERE e.company_id = p_company_id
    AND e.date_of_admission <= dto
    AND (e.termination_date IS NULL OR e.termination_date > dto);

  WITH d AS (
    SELECT ed.employee_id, ed.diagram_type
    FROM public.employees_diagram ed
    WHERE make_date(ed.year::int, ed.month::int, ed.day::int) = dto
  ),
  absent AS (
    SELECT DISTINCT d.employee_id
    FROM d
    JOIN public.diagram_type dt ON dt.id = d.diagram_type
    WHERE dt.work_active = false
      AND NOT (
        lower(dt.name) LIKE 'franco%' OR dt.short_description IN ('F','FN')
        OR lower(dt.name) LIKE 'ausencia dia de vacaciones%'
      )
  )
  SELECT count(*) INTO total_ausentes
  FROM absent a
  JOIN public.employees e ON e.id = a.employee_id
  WHERE e.company_id = p_company_id
    AND e.date_of_admission <= dto
    AND (e.termination_date IS NULL OR e.termination_date > dto);

  porcentaje := CASE WHEN dotacion_actual > 0
                     THEN round((total_ausentes::numeric * 100.0 / dotacion_actual)::numeric, 2)
                     ELSE 0 END;

  result := jsonb_build_object(
    'dotacionAnterior', dotacion_anterior,
    'altas', altas,
    'bajas', bajas,
    'dotacionActual', dotacion_actual,
    'totalAusentes', total_ausentes,
    'porcentajeAusentismo', porcentaje
  );

  IF save_to_table AND p_company_id IS NOT NULL THEN
    INSERT INTO public.daily_indicators (id, company_id, snapshot_date, metrics, source, created_at)
    VALUES (gen_random_uuid(), p_company_id, dto, result, 'hr_get_absenteeism_summary', now())
    ON CONFLICT (company_id, snapshot_date, source)
    DO UPDATE SET metrics = EXCLUDED.metrics, created_at = now();
  END IF;

  RETURN result;
END
$function$;

-- function hr_get_absenteeism_trend (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.hr_get_absenteeism_trend(p_company_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, save_to_table boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  tz text := 'America/Argentina/Buenos_Aires';
  today date := (now() at time zone tz)::date;
  dfrom date := COALESCE(p_from, date_trunc('month', today)::date);
  dto date := COALESCE(p_to, today);
  result jsonb;
BEGIN
  result := (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(gs.d, 'FMDD/FMMM/YYYY'),
          'percentage', CASE WHEN hc.headcount > 0
                             THEN round((coalesce(ab.absents,0)::numeric * 100.0 / hc.headcount)::numeric, 2)
                             ELSE 0 END
        )
        ORDER BY gs.d
      ),
      '[]'::jsonb
    )
    FROM generate_series(dfrom, dto, interval '1 day') AS gs(d)
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS headcount
      FROM public.employees e
      WHERE e.company_id = p_company_id
        AND e.date_of_admission <= gs.d
        AND (e.termination_date IS NULL OR e.termination_date > gs.d)
    ) hc
    LEFT JOIN LATERAL (
      WITH d AS (
        SELECT ed.employee_id, ed.diagram_type
        FROM public.employees_diagram ed
        WHERE make_date(ed.year::int, ed.month::int, ed.day::int) = gs.d
      ),
      absent AS (
        SELECT DISTINCT d.employee_id
        FROM d
        JOIN public.diagram_type dt ON dt.id = d.diagram_type
        WHERE dt.work_active = false
          AND NOT (
            lower(dt.name) LIKE 'franco%' OR dt.short_description IN ('F','FN')
            OR lower(dt.name) LIKE 'ausencia dia de vacaciones%'
          )
      )
      SELECT count(*)::int AS absents
      FROM absent a
      JOIN public.employees e ON e.id = a.employee_id
      WHERE e.company_id = p_company_id
        AND e.date_of_admission <= gs.d
        AND (e.termination_date IS NULL OR e.termination_date > gs.d)
    ) ab ON true
  );

  IF save_to_table AND p_company_id IS NOT NULL THEN
    INSERT INTO public.daily_indicators (id, company_id, snapshot_date, metrics, source, created_at)
    SELECT
      gen_random_uuid(),
      p_company_id,
      gs.d::date,
      jsonb_build_object(
        'percentage',
        CASE WHEN hc.headcount > 0
             THEN round((coalesce(ab.absents,0)::numeric * 100.0 / hc.headcount)::numeric, 2)
             ELSE 0 END
      ),
      'hr_get_absenteeism_trend',
      now()
    FROM generate_series(dfrom, dto, interval '1 day') AS gs(d)
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS headcount
      FROM public.employees e
      WHERE e.company_id = p_company_id
        AND e.date_of_admission <= gs.d
        AND (e.termination_date IS NULL OR e.termination_date > gs.d)
    ) hc
    LEFT JOIN LATERAL (
      WITH d AS (
        SELECT ed.employee_id, ed.diagram_type
        FROM public.employees_diagram ed
        WHERE make_date(ed.year::int, ed.month::int, ed.day::int) = gs.d
      ),
      absent AS (
        SELECT DISTINCT d.employee_id
        FROM d
        JOIN public.diagram_type dt ON dt.id = d.diagram_type
        WHERE dt.work_active = false
          AND NOT (
            lower(dt.name) LIKE 'franco%' OR dt.short_description IN ('F','FN')
            OR lower(dt.name) LIKE 'ausencia dia de vacaciones%'
          )
      )
      SELECT count(*)::int AS absents
      FROM absent a
      JOIN public.employees e ON e.id = a.employee_id
      WHERE e.company_id = p_company_id
        AND e.date_of_admission <= gs.d
        AND (e.termination_date IS NULL OR e.termination_date > gs.d)
    ) ab ON true
    ON CONFLICT (company_id, snapshot_date, source)
    DO UPDATE SET metrics = EXCLUDED.metrics, created_at = now();
  END IF;

  RETURN result;
END
$function$;

-- function hr_get_current_absent_employees (origen: prisma/migrations/20260812150000_absence_reports_include_diagram_comment/migration.sql)
CREATE OR REPLACE FUNCTION public.hr_get_current_absent_employees(p_company_id uuid, p_date date DEFAULT NULL::date, save_to_table boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  tz text := 'America/Argentina/Buenos_Aires';
  target_date date := COALESCE(p_date, (now() at time zone tz)::date);
  ausentes jsonb;
  altas_info jsonb;
  bajas_info jsonb;
  result jsonb;
BEGIN
  ausentes := (
    WITH base AS (
      SELECT
        e.id AS employee_id,
        e.file AS legajo,
        trim(e.lastname || ' ' || e.firstname) AS nombre,
        cp.name AS company_position,
        h.name AS hierarchical_position
      FROM public.employees e
      LEFT JOIN public.company_positions cp ON cp.id = e.company_position
      LEFT JOIN public.hierarchy h ON h.id = e.hierarchical_position
      WHERE e.company_id = p_company_id
      AND e.date_of_admission <= target_date
      AND (e.termination_date IS NULL OR e.termination_date >= target_date) -- incluir baja en el mismo día
    ),
    today_type AS (
      SELECT DISTINCT ON (ed.employee_id)
        ed.employee_id,
        dt.id AS dt_id,
        dt.name AS turno,
        ed.comments AS comentario
      FROM public.employees_diagram ed
      JOIN public.diagram_type dt ON dt.id = ed.diagram_type
      WHERE make_date(ed.year::int, ed.month::int, ed.day::int) = target_date
      AND dt.work_active = false
      AND NOT (
        lower(dt.name) LIKE 'franco%' OR dt.short_description IN ('F','FN')
        OR lower(dt.name) LIKE 'ausencia dia de vacaciones%'
      )
      ORDER BY ed.employee_id, dt.id
    ),
    period AS (
      SELECT
        b.employee_id,
        b.legajo,
        b.nombre,
        coalesce(b.company_position,'') AS tarea,
        coalesce(b.hierarchical_position,'') AS linea,
        t.turno,
        ''::text AS motivo,
        t.comentario,
        COALESCE(
          (
            SELECT (max(make_date(ed2.year::int, ed2.month::int, ed2.day::int)) + INTERVAL '1 day')::date
            FROM public.employees_diagram ed2
            JOIN public.diagram_type dt2 ON dt2.id = ed2.diagram_type
            WHERE ed2.employee_id = b.employee_id
            AND make_date(ed2.year::int, ed2.month::int, ed2.day::int) < target_date
            AND dt2.id <> t.dt_id
          ),
          (
            SELECT min(make_date(ed3.year::int, ed3.month::int, ed3.day::int))::date
            FROM public.employees_diagram ed3
            WHERE ed3.employee_id = b.employee_id
            AND ed3.diagram_type = t.dt_id
            AND make_date(ed3.year::int, ed3.month::int, ed3.day::int) <= target_date
          ),
          target_date
        ) AS desde,
        COALESCE(
          (
            SELECT (min(make_date(ed4.year::int, ed4.month::int, ed4.day::int)) - INTERVAL '1 day')::date
            FROM public.employees_diagram ed4
            JOIN public.diagram_type dt4 ON dt4.id = ed4.diagram_type
            WHERE ed4.employee_id = b.employee_id
            AND make_date(ed4.year::int, ed4.month::int, ed4.day::int) > target_date
            AND dt4.id <> t.dt_id
          ),
          target_date
        ) AS hasta
      FROM base b
      JOIN today_type t ON t.employee_id = b.employee_id
    )
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.employee_id,
          'legajo', p.legajo,
          'nombre', p.nombre,
          'tarea', p.tarea,
          'linea', p.linea,
          'turno', p.turno,
          'motivo', '',
          'desde', to_char(p.desde, 'DD/MM/YYYY'),
          'hasta', to_char(p.hasta, 'DD/MM/YYYY'),
          'diasCaidos', GREATEST(1, (p.hasta - p.desde + 1))::int,
          'observaciones', COALESCE(p.comentario, '')
        )
        ORDER BY p.nombre
      ),
      '[]'::jsonb
    )
    FROM period p
  );

  -- Detalle de ALTAS del día (date_of_admission = target_date)
  altas_info := (
    WITH base AS (
      SELECT
        e.id,
        e.file AS legajo,
        trim(e.lastname || ' ' || e.firstname) AS nombre,
        cp.name AS company_position,
        h.name AS hierarchical_position
      FROM public.employees e
      LEFT JOIN public.company_positions cp ON cp.id = e.company_position
      LEFT JOIN public.hierarchy h ON h.id = e.hierarchical_position
      WHERE e.company_id = p_company_id
      AND e.date_of_admission = target_date
    ),
    turno_today AS (
      SELECT DISTINCT ON (ed.employee_id)
        ed.employee_id,
        dt.name AS turno
      FROM public.employees_diagram ed
      JOIN public.diagram_type dt ON dt.id = ed.diagram_type
      WHERE make_date(ed.year::int, ed.month::int, ed.day::int) = target_date
      ORDER BY ed.employee_id, dt.id
    )
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'legajo', b.legajo,
          'nombre', b.nombre,
          'tarea', coalesce(b.company_position,''),
          'linea', coalesce(b.hierarchical_position,''),
          'turno', coalesce(t.turno,''),
          'motivo', 'Alta',
          'desde', to_char(target_date, 'DD/MM/YYYY'),
          'hasta', to_char(target_date, 'DD/MM/YYYY'),
          'diasCaidos', 0,
          'observaciones', ''
        )
        ORDER BY b.nombre
      ),
      '[]'::jsonb
    )
    FROM base b
    LEFT JOIN turno_today t ON t.employee_id = b.id
  );

  -- Detalle de BAJAS del día (termination_date = target_date)
  bajas_info := (
    WITH base AS (
      SELECT
        e.id,
        e.file AS legajo,
        trim(e.lastname || ' ' || e.firstname) AS nombre,
        cp.name AS company_position,
        h.name AS hierarchical_position,
        (e.reason_for_termination)::text AS motivo
      FROM public.employees e
      LEFT JOIN public.company_positions cp ON cp.id = e.company_position
      LEFT JOIN public.hierarchy h ON h.id = e.hierarchical_position
      WHERE e.company_id = p_company_id
      AND e.termination_date = target_date
    )
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'legajo', b.legajo,
          'nombre', b.nombre,
          'tarea', coalesce(b.company_position,''),
          'linea', coalesce(b.hierarchical_position,''),
          'turno', '',
          'motivo', coalesce(b.motivo,'Baja'),
          'desde', to_char(target_date, 'DD/MM/YYYY'),
          'hasta', to_char(target_date, 'DD/MM/YYYY'),
          'diasCaidos', 0,
          'observaciones', ''
        )
        ORDER BY b.nombre
      ),
      '[]'::jsonb
    )
    FROM base b
  );

  -- Construir el resultado final con el nuevo formato
  result := jsonb_build_object(
    'data', ausentes,
    'detalles', jsonb_build_object(
      'ausentes_info', ausentes,
      'bajas_info', bajas_info,
      'altas_info', altas_info
    )
  );

  IF save_to_table AND p_company_id IS NOT NULL THEN
    INSERT INTO public.daily_indicators (id, company_id, snapshot_date, metrics, source, created_at)
    VALUES (gen_random_uuid(), p_company_id, target_date, result, 'hr_get_current_absent_employees', now())
    ON CONFLICT (company_id, snapshot_date, source)
    DO UPDATE SET metrics = EXCLUDED.metrics, created_at = now();
  END IF;

  RETURN result;
END
$function$;

-- function hr_get_daily_absence_timeseries (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.hr_get_daily_absence_timeseries(p_company_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, save_to_table boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  tz text := 'America/Argentina/Buenos_Aires';
  today date := (now() at time zone tz)::date;
  dfrom date := COALESCE(p_from, date_trunc('month', today)::date);
  dto date := COALESCE(p_to, today);
  result jsonb;
BEGIN
  result := (
    WITH days AS (
      SELECT gs.d::date AS d
      FROM generate_series(dfrom, dto, interval '1 day') AS gs(d)
    ),
    headcounts AS (
      SELECT
        d.d,
        (SELECT count(*) FROM public.employees e
          WHERE e.company_id = p_company_id
            AND e.date_of_admission <= d.d
            AND (e.termination_date IS NULL OR e.termination_date > d.d))::int AS total_dotacion,
        (SELECT count(*) FROM public.employees e
          WHERE e.company_id = p_company_id
            AND e.date_of_admission <= (d.d - 1)
            AND (e.termination_date IS NULL OR e.termination_date > (d.d - 1)))::int AS dotacion_prev,
        (SELECT count(*) FROM public.employees e
          WHERE e.company_id = p_company_id
            AND e.date_of_admission = d.d)::int AS altas,
        (SELECT count(*) FROM public.employees e
          WHERE e.company_id = p_company_id
            AND e.termination_date = d.d)::int AS bajas
      FROM days d
    ),
    absent AS (
      SELECT
        d.d,
        count(*)::int AS total_ausentes
      FROM days d
      JOIN public.employees_diagram ed
        ON make_date(ed.year::int, ed.month::int, ed.day::int) = d.d
      JOIN public.diagram_type dt ON dt.id = ed.diagram_type
      JOIN public.employees e ON e.id = ed.employee_id
      WHERE e.company_id = p_company_id
        AND e.date_of_admission <= d.d
        AND (e.termination_date IS NULL OR e.termination_date > d.d)
        AND dt.work_active = false
        AND NOT (
          lower(dt.name) LIKE 'franco%' OR dt.short_description IN ('F','FN')
          OR lower(dt.name) LIKE 'ausencia dia de vacaciones%'
        )
      GROUP BY d.d
    ),
    vacaciones AS (
      SELECT
        d.d,
        count(DISTINCT ed.employee_id)::int AS vacaciones
      FROM days d
      JOIN public.employees_diagram ed
        ON make_date(ed.year::int, ed.month::int, ed.day::int) = d.d
      JOIN public.diagram_type dt ON dt.id = ed.diagram_type
      JOIN public.employees e ON e.id = ed.employee_id
      WHERE e.company_id = p_company_id
        AND e.date_of_admission <= d.d
        AND (e.termination_date IS NULL OR e.termination_date > d.d)
        AND (lower(dt.name) LIKE 'ausencia dia de vacaciones%' OR dt.short_description = 'AVA')
      GROUP BY d.d
    )
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'fecha', to_char(h.d, 'FMDD/FMMM/YYYY'),
          'dotacion', h.dotacion_prev,
          'altas', h.altas,
          'bajas', h.bajas,
          'vacaciones', coalesce(v.vacaciones, 0),
          'totalDotacion', h.total_dotacion,
          'totalAusentes', coalesce(a.total_ausentes, 0),
          'porcentajeAusentismo',
            CASE WHEN h.total_dotacion > 0
                 THEN round((coalesce(a.total_ausentes,0)::numeric * 100.0 / h.total_dotacion)::numeric, 2)
                 ELSE 0 END
        )
        ORDER BY h.d
      ),
      '[]'::jsonb
    )
    FROM headcounts h
    LEFT JOIN absent a ON a.d = h.d
    LEFT JOIN vacaciones v ON v.d = h.d
  );

  IF save_to_table AND p_company_id IS NOT NULL THEN
    WITH days AS (
      SELECT gs.d::date AS d
      FROM generate_series(dfrom, dto, interval '1 day') AS gs(d)
    ),
    headcounts AS (
      SELECT
        d.d,
        (SELECT count(*) FROM public.employees e
          WHERE e.company_id = p_company_id
            AND e.date_of_admission <= d.d
            AND (e.termination_date IS NULL OR e.termination_date > d.d))::int AS total_dotacion,
        (SELECT count(*) FROM public.employees e
          WHERE e.company_id = p_company_id
            AND e.date_of_admission <= (d.d - 1)
            AND (e.termination_date IS NULL OR e.termination_date > (d.d - 1)))::int AS dotacion_prev,
        (SELECT count(*) FROM public.employees e
          WHERE e.company_id = p_company_id
            AND e.date_of_admission = d.d)::int AS altas,
        (SELECT count(*) FROM public.employees e
          WHERE e.company_id = p_company_id
            AND e.termination_date = d.d)::int AS bajas
      FROM days d
    ),
    absent AS (
      SELECT
        d.d,
        count(*)::int AS total_ausentes
      FROM days d
      JOIN public.employees_diagram ed
        ON make_date(ed.year::int, ed.month::int, ed.day::int) = d.d
      JOIN public.diagram_type dt ON dt.id = ed.diagram_type
      JOIN public.employees e ON e.id = ed.employee_id
      WHERE e.company_id = p_company_id
        AND e.date_of_admission <= d.d
        AND (e.termination_date IS NULL OR e.termination_date > d.d)
        AND dt.work_active = false
        AND NOT (
          lower(dt.name) LIKE 'franco%' OR dt.short_description IN ('F','FN')
          OR lower(dt.name) LIKE 'ausencia dia de vacaciones%'
        )
      GROUP BY d.d
    ),
    vacaciones AS (
      SELECT
        d.d,
        count(DISTINCT ed.employee_id)::int AS vacaciones
      FROM days d
      JOIN public.employees_diagram ed
        ON make_date(ed.year::int, ed.month::int, ed.day::int) = d.d
      JOIN public.diagram_type dt ON dt.id = ed.diagram_type
      JOIN public.employees e ON e.id = ed.employee_id
      WHERE e.company_id = p_company_id
        AND e.date_of_admission <= d.d
        AND (e.termination_date IS NULL OR e.termination_date > d.d)
        AND (lower(dt.name) LIKE 'ausencia dia de vacaciones%' OR dt.short_description = 'AVA')
      GROUP BY d.d
    )
    INSERT INTO public.daily_indicators (id, company_id, snapshot_date, metrics, source, created_at)
    SELECT
      gen_random_uuid(),
      p_company_id,
      h.d,
      jsonb_build_object(
        'dotacion', h.dotacion_prev,
        'altas', h.altas,
        'bajas', h.bajas,
        'vacaciones', coalesce(v.vacaciones, 0),
        'totalDotacion', h.total_dotacion,
        'totalAusentes', coalesce(a.total_ausentes, 0),
        'porcentajeAusentismo',
          CASE WHEN h.total_dotacion > 0
               THEN round((coalesce(a.total_ausentes,0)::numeric * 100.0 / h.total_dotacion)::numeric, 2)
               ELSE 0 END
      ),
      'hr_get_daily_absence_timeseries',
      now()
    FROM headcounts h
    LEFT JOIN absent a ON a.d = h.d
    LEFT JOIN vacaciones v ON v.d = h.d
    ON CONFLICT (company_id, snapshot_date, source)
    DO UPDATE SET metrics = EXCLUDED.metrics, created_at = now();
  END IF;

  RETURN result;
END
$function$;

-- function hr_get_department_absence_reasons (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.hr_get_department_absence_reasons(p_company_id uuid, p_date date DEFAULT NULL::date, save_to_table boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  tz text := 'America/Argentina/Buenos_Aires';
  target_date date := COALESCE(p_date, (now() at time zone tz)::date);
  result jsonb;
BEGIN
  result := (
    WITH base AS (
      SELECT e.id AS employee_id, COALESCE(cc.name, 'SIN SECTOR') AS sector
      FROM public.employees e
      LEFT JOIN public.cost_center cc ON cc.id = e.cost_center_id
      WHERE e.company_id = p_company_id
        AND e.date_of_admission <= target_date
        AND (e.termination_date IS NULL OR e.termination_date > target_date)
    ),
    raw AS (
      SELECT
        b.sector AS department,
        dt.name AS reason,
        COALESCE(dt.color, '#999999') AS color,
        count(DISTINCT ed.employee_id)::int AS value
      FROM base b
      JOIN public.employees_diagram ed ON ed.employee_id = b.employee_id
      JOIN public.diagram_type dt ON dt.id = ed.diagram_type
      WHERE make_date(ed.year::int, ed.month::int, ed.day::int) = target_date
        AND dt.work_active = false
        AND NOT (
          lower(dt.name) LIKE 'franco%' OR dt.short_description IN ('F','FN')
          OR lower(dt.name) LIKE 'ausencia dia de vacaciones%'
        )
      GROUP BY 1,2,3
    ),
    grouped AS (
      SELECT
        department,
        jsonb_agg(
          jsonb_build_object('name', reason, 'value', value, 'color', color)
          ORDER BY value DESC
        ) AS data
      FROM raw
      GROUP BY department
    )
    SELECT coalesce(
      jsonb_agg(jsonb_build_object('department', department, 'data', data) ORDER BY department),
      '[]'::jsonb
    )
    FROM grouped
  );

  IF save_to_table AND p_company_id IS NOT NULL THEN
    INSERT INTO public.daily_indicators (id, company_id, snapshot_date, metrics, source, created_at)
    VALUES (gen_random_uuid(), p_company_id, target_date, result, 'hr_get_department_absence_reasons', now())
    ON CONFLICT (company_id, snapshot_date, source)
    DO UPDATE SET metrics = EXCLUDED.metrics, created_at = now();
  END IF;

  RETURN result;
END
$function$;

-- function hr_get_department_absence_summary (origen: prisma/migrations/20260812150000_absence_reports_include_diagram_comment/migration.sql)
CREATE OR REPLACE FUNCTION public.hr_get_department_absence_summary(p_company_id uuid, p_date date DEFAULT NULL::date, save_to_table boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  tz text := 'America/Argentina/Buenos_Aires';
  target_date date := COALESCE(p_date, (now() at time zone tz)::date);
  result jsonb;
BEGIN
  result := (
    WITH base AS (
      SELECT
        e.id AS employee_id,
        COALESCE(cc.name, 'SIN SECTOR') AS sector,
        e.file AS legajo,
        trim(e.lastname || ' ' || e.firstname) AS nombre,
        cp.name AS company_position,
        h.name AS hierarchical_position
      FROM public.employees e
      LEFT JOIN public.cost_center cc ON cc.id = e.cost_center_id
      LEFT JOIN public.company_positions cp ON cp.id = e.company_position
      LEFT JOIN public.hierarchy h ON h.id = e.hierarchical_position
      WHERE e.company_id = p_company_id
      AND e.date_of_admission <= target_date
      AND (e.termination_date IS NULL OR e.termination_date > target_date)
    ),
    today_type AS (
      SELECT DISTINCT ON (ed.employee_id)
        ed.employee_id,
        dt.id AS dt_id,
        dt.name AS turno,
        ed.comments AS comentario
      FROM public.employees_diagram ed
      JOIN public.diagram_type dt ON dt.id = ed.diagram_type
      WHERE make_date(ed.year::int, ed.month::int, ed.day::int) = target_date
      AND dt.work_active = false
      AND NOT (
        lower(dt.name) LIKE 'franco%' OR dt.short_description IN ('F','FN')
        OR lower(dt.name) LIKE 'ausencia dia de vacaciones%'
      )
      ORDER BY ed.employee_id, dt.id
    ),
    period AS (
      SELECT
        b.sector,
        b.employee_id,
        b.legajo,
        b.nombre,
        coalesce(b.company_position,'') AS tarea,
        coalesce(b.hierarchical_position,'') AS linea,
        t.turno,
        ''::text AS motivo,
        t.comentario,
        COALESCE(
          (
            SELECT (max(make_date(ed2.year::int, ed2.month::int, ed2.day::int)) + INTERVAL '1 day')::date
            FROM public.employees_diagram ed2
            JOIN public.diagram_type dt2 ON dt2.id = ed2.diagram_type
            WHERE ed2.employee_id = b.employee_id
            AND make_date(ed2.year::int, ed2.month::int, ed2.day::int) < target_date
            AND dt2.id <> t.dt_id
          ),
          (
            SELECT min(make_date(ed3.year::int, ed3.month::int, ed3.day::int))::date
            FROM public.employees_diagram ed3
            WHERE ed3.employee_id = b.employee_id
            AND ed3.diagram_type = t.dt_id
            AND make_date(ed3.year::int, ed3.month::int, ed3.day::int) <= target_date
          ),
          target_date
        ) AS desde,
        COALESCE(
          (
            SELECT (min(make_date(ed4.year::int, ed4.month::int, ed4.day::int)) - INTERVAL '1 day')::date
            FROM public.employees_diagram ed4
            JOIN public.diagram_type dt4 ON dt4.id = ed4.diagram_type
            WHERE ed4.employee_id = b.employee_id
            AND make_date(ed4.year::int, ed4.month::int, ed4.day::int) > target_date
            AND dt4.id <> t.dt_id
          ),
          target_date
        ) AS hasta
      FROM base b
      JOIN today_type t ON t.employee_id = b.employee_id
    ),
    absent_details_grouped AS (
      SELECT
        p.sector,
        jsonb_agg(
          jsonb_build_object(
            'employee_id', p.employee_id,
            'legajo', p.legajo,
            'nombre', p.nombre,
            'tarea', p.tarea,
            'linea', p.linea,
            'turno', p.turno,
            'motivo', p.motivo,
            'desde', to_char(p.desde, 'DD/MM/YYYY'),
            'hasta', to_char(p.hasta, 'DD/MM/YYYY'),
            'observaciones', COALESCE(p.comentario, ''),
            'diasCaidos', GREATEST(1, (p.hasta - p.desde + 1))::int
          )
          ORDER BY p.nombre
        ) AS data
      FROM period p
      GROUP BY p.sector
    ),
    per_sector AS (
      SELECT
        b.sector,
        count(*)::int AS dotacion,
        count(tt.employee_id)::int AS ausentes
      FROM base b
      LEFT JOIN today_type tt ON tt.employee_id = b.employee_id
      GROUP BY b.sector
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'sector', ps.sector,
          'dotacion', ps.dotacion,
          'ausentes', ps.ausentes,
          'porcentaje', CASE
            WHEN ps.dotacion > 0
            THEN round((ps.ausentes::numeric * 100.0 / ps.dotacion), 2)
            ELSE 0
          END,
          'data', COALESCE(adg.data, '[]'::jsonb)
        )
        ORDER BY ps.sector
      ),
      '[]'::jsonb
    )
    FROM per_sector ps
    LEFT JOIN absent_details_grouped adg ON adg.sector = ps.sector
  );

  IF save_to_table AND p_company_id IS NOT NULL THEN
    INSERT INTO public.daily_indicators (id, company_id, snapshot_date, metrics, source, created_at)
    VALUES (gen_random_uuid(), p_company_id, target_date, result, 'hr_get_department_absence_summary', now())
    ON CONFLICT (company_id, snapshot_date, source)
    DO UPDATE SET metrics = EXCLUDED.metrics, created_at = now();
  END IF;

  RETURN result;
END
$function$;

-- function process_massive_diagram_creation_v2 (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.process_massive_diagram_creation_v2(p_employee_ids uuid[], p_work_diagram_id uuid, p_active_novelty_id uuid, p_date_from date, p_date_to date, p_conflict_resolution text)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_work_diagram RECORD;
    v_employee_id UUID;
    v_current_date DATE;
    v_day_in_cycle INTEGER;
    v_is_active_day BOOLEAN;
    v_existing_record RECORD;
    v_result JSON;
    v_total_employees INTEGER := 0;
    v_processed_employees INTEGER := 0;
    v_total_days INTEGER := 0;
    v_processed_days INTEGER := 0;
    v_created_records INTEGER := 0;
    v_updated_records INTEGER := 0;
    v_skipped_records INTEGER := 0;
    v_errors TEXT[] := ARRAY[]::TEXT[];
    v_start_time TIMESTAMP := NOW();
    v_end_time TIMESTAMP;
    v_created_data JSON[] := ARRAY[]::JSON[];
    v_updated_data JSON[] := ARRAY[]::JSON[];
    v_novelty_info RECORD;
    v_inactive_novelty_info RECORD;
    v_employee_name TEXT;
    v_previous_novelty RECORD;
BEGIN
    -- Validar parámetros de entrada
    IF p_date_from IS NULL OR p_date_to IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Las fechas de inicio y fin son requeridas'
        );
    END IF;
    
    IF p_date_from > p_date_to THEN
        RETURN json_build_object(
            'success', false,
            'error', 'La fecha de inicio no puede ser mayor que la fecha de fin'
        );
    END IF;
    
    IF p_employee_ids IS NULL OR array_length(p_employee_ids, 1) = 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Debe seleccionar al menos un empleado'
        );
    END IF;
    
    IF p_work_diagram_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Debe seleccionar un diagrama de trabajo'
        );
    END IF;
    
    IF p_active_novelty_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Debe seleccionar una novedad activa'
        );
    END IF;
    
    -- Obtener información del diagrama de trabajo
    SELECT * INTO v_work_diagram
    FROM work_diagram
    WHERE id = p_work_diagram_id AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Diagrama de trabajo no encontrado o inactivo'
        );
    END IF;
    
    -- Obtener información de la novedad activa
    SELECT name, color INTO v_novelty_info
    FROM diagram_type
    WHERE id = p_active_novelty_id AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Novedad no encontrada o inactiva'
        );
    END IF;
    
    -- Obtener información de la novedad inactiva
    SELECT name, color INTO v_inactive_novelty_info
    FROM diagram_type
    WHERE id = v_work_diagram.inactive_novelty;
    
    -- Calcular totales para el reporte
    v_total_employees := array_length(p_employee_ids, 1);
    v_total_days := (p_date_to - p_date_from + 1);
    
    -- Procesar cada empleado
    FOREACH v_employee_id IN ARRAY p_employee_ids
    LOOP
        BEGIN
            v_processed_employees := v_processed_employees + 1;
            
            -- Verificar que el empleado existe y obtener su nombre
            SELECT CONCAT(firstname, ' ', lastname) INTO v_employee_name
            FROM employees 
            WHERE id = v_employee_id;
            
            IF NOT FOUND THEN
                v_errors := array_append(v_errors, 'Empleado con ID ' || v_employee_id || ' no encontrado');
                CONTINUE;
            END IF;
            
            -- Procesar cada día en el rango
            v_current_date := p_date_from;
            WHILE v_current_date <= p_date_to LOOP
                v_processed_days := v_processed_days + 1;
                
                -- Calcular día en el ciclo (reiniciando desde p_date_from)
                v_day_in_cycle := ((v_current_date - p_date_from) % (v_work_diagram.active_working_days + v_work_diagram.inactive_working_days)) + 1;
                
                -- Determinar si es día activo
                v_is_active_day := v_day_in_cycle <= v_work_diagram.active_working_days;
                
                -- Verificar si ya existe un registro para esta fecha y empleado
                SELECT * INTO v_existing_record
                FROM employees_diagram
                WHERE employee_id = v_employee_id
                AND day = EXTRACT(DAY FROM v_current_date)
                AND month = EXTRACT(MONTH FROM v_current_date)
                AND year = EXTRACT(YEAR FROM v_current_date);
                
                IF FOUND THEN
                    -- Obtener información de la novedad anterior
                    SELECT dt.name, dt.color INTO v_previous_novelty
                    FROM diagram_type dt
                    WHERE dt.id = v_existing_record.diagram_type;
                    
                    -- Manejar conflicto según la estrategia seleccionada
                    IF p_conflict_resolution = 'skip' THEN
                        v_skipped_records := v_skipped_records + 1;
                    ELSIF p_conflict_resolution = 'update' THEN
                        UPDATE employees_diagram
                        SET 
                            diagram_type = CASE 
                                WHEN v_is_active_day THEN p_active_novelty_id
                                ELSE v_work_diagram.inactive_novelty
                            END,
                            created_at = NOW()
                        WHERE employee_id = v_employee_id
                        AND day = EXTRACT(DAY FROM v_current_date)
                        AND month = EXTRACT(MONTH FROM v_current_date)
                        AND year = EXTRACT(YEAR FROM v_current_date);
                        
                        v_updated_records := v_updated_records + 1;
                        
                        -- Agregar a los datos actualizados con información de novedad anterior
                        v_updated_data := array_append(v_updated_data, json_build_object(
                            'employee_id', v_employee_id,
                            'employee_name', v_employee_name,
                            'date', v_current_date,
                            'day', EXTRACT(DAY FROM v_current_date),
                            'month', EXTRACT(MONTH FROM v_current_date),
                            'year', EXTRACT(YEAR FROM v_current_date),
                            'is_active', v_is_active_day,
                            'novelty_name', CASE 
                                WHEN v_is_active_day THEN v_novelty_info.name 
                                ELSE v_inactive_novelty_info.name 
                            END,
                            'novelty_color', CASE 
                                WHEN v_is_active_day THEN v_novelty_info.color 
                                ELSE v_inactive_novelty_info.color 
                            END,
                            'previous_novelty_name', v_previous_novelty.name,
                            'previous_novelty_color', v_previous_novelty.color
                        ));
                    END IF;
                ELSE
                    -- Crear nuevo registro para días activos e inactivos
                    INSERT INTO employees_diagram (
                        employee_id,
                        diagram_type,
                        day,
                        month,
                        year,
                        created_at
                    ) VALUES (
                        v_employee_id,
                        CASE 
                            WHEN v_is_active_day THEN p_active_novelty_id
                            ELSE v_work_diagram.inactive_novelty
                        END,
                        EXTRACT(DAY FROM v_current_date),
                        EXTRACT(MONTH FROM v_current_date),
                        EXTRACT(YEAR FROM v_current_date),
                        NOW()
                    );
                    
                    v_created_records := v_created_records + 1;
                    
                    -- Agregar a los datos creados
                    v_created_data := array_append(v_created_data, json_build_object(
                        'employee_id', v_employee_id,
                        'employee_name', v_employee_name,
                        'date', v_current_date,
                        'day', EXTRACT(DAY FROM v_current_date),
                        'month', EXTRACT(MONTH FROM v_current_date),
                        'year', EXTRACT(YEAR FROM v_current_date),
                        'is_active', v_is_active_day,
                        'novelty_name', CASE 
                            WHEN v_is_active_day THEN v_novelty_info.name 
                            ELSE v_inactive_novelty_info.name 
                        END,
                        'novelty_color', CASE 
                            WHEN v_is_active_day THEN v_novelty_info.color 
                            ELSE v_inactive_novelty_info.color 
                        END
                    ));
                END IF;
                
                v_current_date := v_current_date + 1;
            END LOOP;
            
        EXCEPTION
            WHEN OTHERS THEN
                v_errors := array_append(v_errors, 'Error procesando empleado ' || v_employee_id || ': ' || SQLERRM);
        END;
    END LOOP;
    
    v_end_time := NOW();
    
    -- Construir respuesta
    v_result := json_build_object(
        'success', true,
        'summary', json_build_object(
            'total_employees', v_total_employees,
            'processed_employees', v_processed_employees,
            'total_days', v_total_days,
            'processed_days', v_processed_days,
            'created_records', v_created_records,
            'updated_records', v_updated_records,
            'skipped_records', v_skipped_records,
            'errors_count', array_length(v_errors, 1),
            'processing_time_seconds', EXTRACT(EPOCH FROM (v_end_time - v_start_time)),
            'start_time', v_start_time,
            'end_time', v_end_time
        ),
        'data', json_build_object(
            'created', v_created_data,
            'updated', v_updated_data
        ),
        'details', json_build_object(
            'date_range', json_build_object(
                'from', p_date_from,
                'to', p_date_to
            ),
            'work_diagram', json_build_object(
                'id', v_work_diagram.id,
                'name', v_work_diagram.name,
                'active_days', v_work_diagram.active_working_days,
                'inactive_days', v_work_diagram.inactive_working_days,
                'cycle_length', v_work_diagram.active_working_days + v_work_diagram.inactive_working_days
            ),
            'active_novelty', json_build_object(
                'id', p_active_novelty_id,
                'name', v_novelty_info.name,
                'color', v_novelty_info.color
            ),
            'inactive_novelty', json_build_object(
                'id', v_work_diagram.inactive_novelty,
                'name', v_inactive_novelty_info.name,
                'color', v_inactive_novelty_info.color
            ),
            'conflict_resolution', p_conflict_resolution,
            'employee_ids', p_employee_ids
        ),
        'errors', v_errors
    );
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Error interno del servidor: ' || SQLERRM,
            'details', json_build_object(
                'processed_employees', v_processed_employees,
                'processed_days', v_processed_days,
                'created_records', v_created_records,
                'updated_records', v_updated_records,
                'skipped_records', v_skipped_records
            )
        );
END;
$function$;

-- function process_massive_novelty_creation (origen: prisma/migrations/20260416180000_add_novelty_massive_rpcs/migration.sql)
CREATE OR REPLACE FUNCTION public.process_massive_novelty_creation(
  p_employee_ids uuid[],
  p_diagram_type_id uuid,
  p_date_from date,
  p_date_to date,
  p_conflict_resolution text
)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_employee_id uuid;
  v_current_date date;
  v_existing_record RECORD;
  v_result json;
  v_total_employees integer := 0;
  v_processed_employees integer := 0;
  v_total_days integer := 0;
  v_processed_days integer := 0;
  v_created_records integer := 0;
  v_updated_records integer := 0;
  v_skipped_records integer := 0;
  v_errors text[] := ARRAY[]::text[];
  v_start_time timestamp := NOW();
  v_end_time timestamp;
  v_created_data json[] := ARRAY[]::json[];
  v_updated_data json[] := ARRAY[]::json[];
  v_novelty_info RECORD;
  v_employee_name text;
  v_previous_novelty RECORD;
BEGIN
  -- Validaciones
  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Las fechas de inicio y fin son requeridas');
  END IF;

  IF p_date_from > p_date_to THEN
    RETURN json_build_object('success', false, 'error', 'La fecha de inicio no puede ser mayor que la fecha de fin');
  END IF;

  IF p_employee_ids IS NULL OR array_length(p_employee_ids, 1) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Debe seleccionar al menos un empleado');
  END IF;

  IF p_diagram_type_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Debe seleccionar una novedad');
  END IF;

  -- Info de la novedad
  SELECT id, name, color INTO v_novelty_info
  FROM diagram_type
  WHERE id = p_diagram_type_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Novedad no encontrada o inactiva');
  END IF;

  v_total_employees := array_length(p_employee_ids, 1);
  v_total_days := (p_date_to - p_date_from + 1);

  -- Procesar por empleado
  FOREACH v_employee_id IN ARRAY p_employee_ids
  LOOP
    BEGIN
      v_processed_employees := v_processed_employees + 1;

      SELECT CONCAT(firstname, ' ', lastname) INTO v_employee_name
      FROM employees
      WHERE id = v_employee_id;

      IF NOT FOUND THEN
        v_errors := array_append(v_errors, 'Empleado con ID ' || v_employee_id || ' no encontrado');
        CONTINUE;
      END IF;

      -- Cada día del rango → siempre la misma novedad
      v_current_date := p_date_from;
      WHILE v_current_date <= p_date_to LOOP
        v_processed_days := v_processed_days + 1;

        SELECT * INTO v_existing_record
        FROM employees_diagram
        WHERE employee_id = v_employee_id
          AND day = EXTRACT(DAY FROM v_current_date)
          AND month = EXTRACT(MONTH FROM v_current_date)
          AND year = EXTRACT(YEAR FROM v_current_date);

        IF FOUND THEN
          SELECT dt.name, dt.color INTO v_previous_novelty
          FROM diagram_type dt
          WHERE dt.id = v_existing_record.diagram_type;

          IF p_conflict_resolution = 'skip' THEN
            v_skipped_records := v_skipped_records + 1;
          ELSIF p_conflict_resolution = 'update' THEN
            UPDATE employees_diagram
            SET diagram_type = p_diagram_type_id,
                created_at = NOW()
            WHERE employee_id = v_employee_id
              AND day = EXTRACT(DAY FROM v_current_date)
              AND month = EXTRACT(MONTH FROM v_current_date)
              AND year = EXTRACT(YEAR FROM v_current_date);

            v_updated_records := v_updated_records + 1;

            v_updated_data := array_append(v_updated_data, json_build_object(
              'employee_id', v_employee_id,
              'employee_name', v_employee_name,
              'date', v_current_date,
              'day', EXTRACT(DAY FROM v_current_date),
              'month', EXTRACT(MONTH FROM v_current_date),
              'year', EXTRACT(YEAR FROM v_current_date),
              'is_active', true,
              'novelty_name', v_novelty_info.name,
              'novelty_color', v_novelty_info.color,
              'previous_novelty_name', v_previous_novelty.name,
              'previous_novelty_color', v_previous_novelty.color
            ));
          END IF;
        ELSE
          INSERT INTO employees_diagram (
            employee_id, diagram_type, day, month, year, created_at
          ) VALUES (
            v_employee_id,
            p_diagram_type_id,
            EXTRACT(DAY FROM v_current_date),
            EXTRACT(MONTH FROM v_current_date),
            EXTRACT(YEAR FROM v_current_date),
            NOW()
          );

          v_created_records := v_created_records + 1;

          v_created_data := array_append(v_created_data, json_build_object(
            'employee_id', v_employee_id,
            'employee_name', v_employee_name,
            'date', v_current_date,
            'day', EXTRACT(DAY FROM v_current_date),
            'month', EXTRACT(MONTH FROM v_current_date),
            'year', EXTRACT(YEAR FROM v_current_date),
            'is_active', true,
            'novelty_name', v_novelty_info.name,
            'novelty_color', v_novelty_info.color
          ));
        END IF;

        v_current_date := v_current_date + 1;
      END LOOP;

    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, 'Error procesando empleado ' || v_employee_id || ': ' || SQLERRM);
    END;
  END LOOP;

  v_end_time := NOW();

  v_result := json_build_object(
    'success', true,
    'summary', json_build_object(
      'total_employees', v_total_employees,
      'processed_employees', v_processed_employees,
      'total_days', v_total_days,
      'processed_days', v_processed_days,
      'created_records', v_created_records,
      'updated_records', v_updated_records,
      'skipped_records', v_skipped_records,
      'errors_count', array_length(v_errors, 1),
      'processing_time_seconds', EXTRACT(EPOCH FROM (v_end_time - v_start_time)),
      'start_time', v_start_time,
      'end_time', v_end_time
    ),
    'data', json_build_object(
      'created', v_created_data,
      'updated', v_updated_data
    ),
    'details', json_build_object(
      'date_range', json_build_object('from', p_date_from, 'to', p_date_to),
      'mode', 'novelty',
      'novelty', json_build_object(
        'id', v_novelty_info.id,
        'name', v_novelty_info.name,
        'color', v_novelty_info.color
      ),
      'conflict_resolution', p_conflict_resolution,
      'employee_ids', p_employee_ids
    ),
    'errors', v_errors
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', 'Error interno del servidor: ' || SQLERRM,
    'details', json_build_object(
      'processed_employees', v_processed_employees,
      'processed_days', v_processed_days,
      'created_records', v_created_records,
      'updated_records', v_updated_records,
      'skipped_records', v_skipped_records
    )
  );
END;
$$;

-- ============================================================================
-- TRIGGERS (2)
-- ============================================================================

-- trigger trg_employees_diagram_changes_insert ON employees_diagram (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS trg_employees_diagram_changes_insert ON public.employees_diagram;
CREATE TRIGGER trg_employees_diagram_changes_insert AFTER INSERT ON public.employees_diagram FOR EACH ROW EXECUTE FUNCTION public.handle_employees_diagram_changes();

-- trigger trg_employees_diagram_changes_update ON employees_diagram (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS trg_employees_diagram_changes_update ON public.employees_diagram;
CREATE TRIGGER trg_employees_diagram_changes_update AFTER UPDATE OF diagram_type, day, month, year, employee_id ON public.employees_diagram FOR EACH ROW WHEN (OLD.diagram_type IS DISTINCT FROM NEW.diagram_type OR OLD.day IS DISTINCT FROM NEW.day OR OLD.month IS DISTINCT FROM NEW.month OR OLD.year IS DISTINCT FROM NEW.year OR OLD.employee_id IS DISTINCT FROM NEW.employee_id) EXECUTE FUNCTION public.handle_employees_diagram_changes();
