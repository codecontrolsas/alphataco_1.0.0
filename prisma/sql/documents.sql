-- Generado por scripts/sql/extract-sql-objects.ts — editar a mano SOLO en la revisión de Task 4
-- Dominio: documents — 28 objeto(s)
-- Revisado a mano en la Task 4 (P1): actor por app.user_id, tipos de documento filtrados por empresa.

-- ============================================================================
-- FUNCTIONS (14)
-- ============================================================================

-- function controlar_alertas_documentos_single_employee (origen: prisma/migrations/20260917120000_ticket_712_unificar_status_documentacion/migration.sql)
CREATE OR REPLACE FUNCTION public.controlar_alertas_documentos_single_employee(
  employee_id_param uuid,
  company_id_param uuid
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  user_id uuid;
  doc RECORD;
  where_sql text;
  conditions_jsonb jsonb;
  employee_matches boolean;
  emp_active boolean;
  -- Clasificacion de los tipos recorridos en el loop:
  v_limpiar_vacias uuid[] := '{}';  -- baja sin doc de egreso, o ya no aplica
  v_archivar       uuid[] := '{}';  -- ya no aplica y tiene archivo -> historial
  v_desarchivar    uuid[] := '{}';  -- volvio a cumplir la condicion special
  v_crear_alerta   uuid[] := '{}';  -- aplica: alerta pendiente si no hay fila
BEGIN
  -- Task 4: actor de la transaccion (SET LOCAL app.user_id, helper withActor) en lugar
  -- del sub del JWT de Supabase. Desde triggers/jobs queda NULL, como antes.
  user_id := public.app_current_user_id();

  SELECT is_active INTO emp_active FROM employees WHERE id = employee_id_param;

  FOR doc IN
    SELECT * FROM document_types
    WHERE mandatory = true AND applies = 'Persona' AND is_active = true
      -- Task 4: tipos globales (company_id NULL) o de la empresa del empleado
      AND (company_id IS NULL OR company_id = company_id_param)
  LOOP
    -- Empleado dado de baja + tipo NO de baja: no debe tener alerta; limpiar la vacia.
    IF NOT (COALESCE(doc.down_document, false) OR COALESCE(emp_active, true)) THEN
      v_limpiar_vacias := array_append(v_limpiar_vacias, doc.id);
      CONTINUE;
    END IF;

    IF doc.special AND doc.conditions IS NOT NULL AND array_length(doc.conditions, 1) > 0 THEN
      SELECT array_to_json(doc.conditions)::jsonb INTO conditions_jsonb;
      where_sql := build_employee_where_alias(conditions_jsonb, 'e');

      IF where_sql IS NULL OR where_sql = '' OR where_sql = 'TRUE' THEN
        CONTINUE;
      END IF;

      EXECUTE format(
        'SELECT EXISTS(SELECT 1 FROM employees e WHERE e.id = %L AND e.company_id = %L AND %s)',
        employee_id_param, company_id_param, where_sql
      ) INTO employee_matches;

      IF employee_matches THEN
        -- 358: vuelve a aplicar -> re-activar lo archivado (conserva archivo/validity)
        v_desarchivar  := array_append(v_desarchivar, doc.id);
        v_crear_alerta := array_append(v_crear_alerta, doc.id);
      ELSE
        -- 358: ya no aplica. Sin archivo -> borrar (alerta vacia). Con archivo -> archivar.
        v_limpiar_vacias := array_append(v_limpiar_vacias, doc.id);
        v_archivar       := array_append(v_archivar, doc.id);
      END IF;
    ELSE
      v_crear_alerta := array_append(v_crear_alerta, doc.id);
    END IF;
  END LOOP;

  -- Escrituras agrupadas (una sentencia por tipo de operacion).
  IF cardinality(v_limpiar_vacias) > 0 THEN
    DELETE FROM documents_employees
    WHERE applies = employee_id_param
      AND id_document_types = ANY(v_limpiar_vacias)
      AND (document_path IS NULL OR document_path = '');
  END IF;

  IF cardinality(v_archivar) > 0 THEN
    UPDATE documents_employees SET archived_at = now()
    WHERE applies = employee_id_param
      AND id_document_types = ANY(v_archivar)
      AND document_path IS NOT NULL AND document_path <> ''
      AND archived_at IS NULL;
  END IF;

  IF cardinality(v_desarchivar) > 0 THEN
    UPDATE documents_employees SET archived_at = NULL
    WHERE applies = employee_id_param
      AND id_document_types = ANY(v_desarchivar)
      AND archived_at IS NOT NULL;
  END IF;

  IF cardinality(v_crear_alerta) > 0 THEN
    INSERT INTO documents_employees (id_document_types, applies, validity, state, is_active, user_id, deny_reason, document_path)
    SELECT t.id, employee_id_param, NULL, 'pendiente', TRUE, user_id, NULL, NULL
    FROM unnest(v_crear_alerta) AS t(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM documents_employees
      WHERE id_document_types = t.id AND applies = employee_id_param
    );
  END IF;

  -- 712: una sola formula de status (antes habia una propia, que nunca podia
  -- dar 'Completo' porque contaba como faltantes los tipos especiales que no
  -- le corresponden al empleado).
  PERFORM public.recalcular_status_documentacion(ARRAY[employee_id_param], 'Persona');
END;
$function$;

-- function controlar_alertas_documentos_single_vehicle (origen: prisma/migrations/20260917120000_ticket_712_unificar_status_documentacion/migration.sql)
CREATE OR REPLACE FUNCTION public.controlar_alertas_documentos_single_vehicle(
  vehicle_id_param uuid,
  company_id_param uuid
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  user_id uuid;
  doc RECORD;
  where_sql text;
  conditions_jsonb jsonb;
  vehicle_matches boolean;
  veh_active boolean;
  v_limpiar_vacias uuid[] := '{}';
  v_archivar       uuid[] := '{}';
  v_desarchivar    uuid[] := '{}';
  v_crear_alerta   uuid[] := '{}';
BEGIN
  -- Task 4: actor de la transaccion (SET LOCAL app.user_id, helper withActor) en lugar
  -- del sub del JWT de Supabase. Desde triggers/jobs queda NULL, como antes.
  user_id := public.app_current_user_id();

  SELECT is_active INTO veh_active FROM vehicles WHERE id = vehicle_id_param;

  FOR doc IN
    SELECT * FROM document_types
    WHERE mandatory = true AND applies = 'Equipos' AND is_active = true
      -- Task 4: tipos globales (company_id NULL) o de la empresa del vehiculo
      AND (company_id IS NULL OR company_id = company_id_param)
  LOOP
    IF NOT (COALESCE(doc.down_document, false) OR COALESCE(veh_active, true)) THEN
      v_limpiar_vacias := array_append(v_limpiar_vacias, doc.id);
      CONTINUE;
    END IF;

    IF doc.special AND doc.conditions IS NOT NULL AND array_length(doc.conditions, 1) > 0 THEN
      SELECT array_to_json(doc.conditions)::jsonb INTO conditions_jsonb;
      where_sql := build_vehicle_where_alias(conditions_jsonb, 'v');

      IF where_sql IS NULL OR where_sql = '' OR where_sql = 'TRUE' THEN
        CONTINUE;
      END IF;

      EXECUTE format(
        'SELECT EXISTS(SELECT 1 FROM vehicles v WHERE v.id = %L AND v.company_id = %L AND %s)',
        vehicle_id_param, company_id_param, where_sql
      ) INTO vehicle_matches;

      IF vehicle_matches THEN
        v_desarchivar  := array_append(v_desarchivar, doc.id);
        v_crear_alerta := array_append(v_crear_alerta, doc.id);
      ELSE
        v_limpiar_vacias := array_append(v_limpiar_vacias, doc.id);
        v_archivar       := array_append(v_archivar, doc.id);
      END IF;
    ELSE
      v_crear_alerta := array_append(v_crear_alerta, doc.id);
    END IF;
  END LOOP;

  IF cardinality(v_limpiar_vacias) > 0 THEN
    DELETE FROM documents_equipment
    WHERE applies = vehicle_id_param
      AND id_document_types = ANY(v_limpiar_vacias)
      AND (document_path IS NULL OR document_path = '');
  END IF;

  IF cardinality(v_archivar) > 0 THEN
    UPDATE documents_equipment SET archived_at = now()
    WHERE applies = vehicle_id_param
      AND id_document_types = ANY(v_archivar)
      AND document_path IS NOT NULL AND document_path <> ''
      AND archived_at IS NULL;
  END IF;

  IF cardinality(v_desarchivar) > 0 THEN
    UPDATE documents_equipment SET archived_at = NULL
    WHERE applies = vehicle_id_param
      AND id_document_types = ANY(v_desarchivar)
      AND archived_at IS NOT NULL;
  END IF;

  IF cardinality(v_crear_alerta) > 0 THEN
    INSERT INTO documents_equipment (id_document_types, applies, validity, state, is_active, user_id, deny_reason, document_path)
    SELECT t.id, vehicle_id_param, NULL, 'pendiente', TRUE, user_id, NULL, NULL
    FROM unnest(v_crear_alerta) AS t(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM documents_equipment
      WHERE id_document_types = t.id AND applies = vehicle_id_param
    );
  END IF;

  PERFORM public.recalcular_status_documentacion(ARRAY[vehicle_id_param], 'Equipos');
END;
$function$;

-- function controlar_alertas_single_document_all_employees (origen: prisma/migrations/20260703150000_reactivar_documentos_al_cumplir_condicion_all/migration.sql)
CREATE OR REPLACE FUNCTION public.controlar_alertas_single_document_all_employees(document_type_id_param uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  doc RECORD;
  employee_record RECORD;
  employee_matches boolean;
  where_sql text;
  conditions_jsonb jsonb;
BEGIN
  SELECT * INTO doc FROM document_types
  WHERE id = document_type_id_param
    AND mandatory = true
    AND applies = 'Persona'
    AND is_active = true;

  IF NOT FOUND THEN RETURN; END IF;

  IF doc.special AND doc.conditions IS NOT NULL AND array_length(doc.conditions, 1) > 0 THEN
    SELECT array_to_json(doc.conditions)::jsonb INTO conditions_jsonb;
    where_sql := build_employee_where_alias(conditions_jsonb, 'e');

    -- Guard: si where_sql es invalido, no hacer nada
    IF where_sql IS NULL OR where_sql = '' OR where_sql = 'TRUE' THEN RETURN; END IF;

    -- Task 4 (multi-empresa): un tipo global (company_id NULL) aplica a los empleados de
    -- todas las empresas; un tipo de una empresa, solo a los de esa empresa. El match final
    -- lo decide la condicion (where_sql). Antes se recorrian TODOS los empleados sin filtro
    -- ("solo GH opera recursos"), y mas atras el filtro roto "company_id = doc.company_id"
    -- (con NULL no iteraba a nadie).
    FOR employee_record IN
      SELECT id FROM employees
      WHERE (COALESCE(doc.down_document, false) OR is_active = true)
        AND (doc.company_id IS NULL OR company_id = doc.company_id)
    LOOP
      EXECUTE format(
        'SELECT EXISTS(SELECT 1 FROM employees e WHERE e.id = %L AND %s)',
        employee_record.id, where_sql
      ) INTO employee_matches;

      IF employee_matches THEN
        -- 411: vuelve a cumplir -> re-activar lo que estuviese archivado (conserva archivo/validity)
        UPDATE documents_employees SET archived_at = NULL
        WHERE id_document_types = doc.id
          AND applies = employee_record.id
          AND archived_at IS NOT NULL;
        -- crear alerta pendiente si no existe ninguna fila
        INSERT INTO documents_employees (id_document_types, applies, validity, state, is_active, user_id, deny_reason, document_path)
        SELECT doc.id, employee_record.id, NULL, 'pendiente', TRUE, NULL, NULL, NULL
        WHERE NOT EXISTS (
          SELECT 1 FROM documents_employees
          WHERE id_document_types = doc.id AND applies = employee_record.id
        );
      ELSE
        -- Empleado ya no cumple condiciones: borrar alerta vacia (sin doc subido)
        DELETE FROM documents_employees
        WHERE id_document_types = doc.id
          AND applies = employee_record.id
          AND (document_path IS NULL OR document_path = '');
      END IF;
    END LOOP;
  ELSE
    -- Tipo no especial: crear para todos los empleados de la(s) empresa(s) del tipo
    FOR employee_record IN
      SELECT id FROM employees
      WHERE (COALESCE(doc.down_document, false) OR is_active = true)
        AND (doc.company_id IS NULL OR company_id = doc.company_id)
    LOOP
      INSERT INTO documents_employees (id_document_types, applies, validity, state, is_active, user_id, deny_reason, document_path)
      SELECT doc.id, employee_record.id, NULL, 'pendiente', TRUE, NULL, NULL, NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM documents_employees
        WHERE id_document_types = doc.id AND applies = employee_record.id
      );
    END LOOP;
  END IF;
END;
$function$;

-- function controlar_alertas_single_document_all_vehicles (origen: prisma/migrations/20260703150000_reactivar_documentos_al_cumplir_condicion_all/migration.sql)
CREATE OR REPLACE FUNCTION public.controlar_alertas_single_document_all_vehicles(document_type_id_param uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  doc RECORD;
  vehicle_record RECORD;
  vehicle_matches boolean;
  where_sql text;
  conditions_jsonb jsonb;
BEGIN
  SELECT * INTO doc FROM document_types
  WHERE id = document_type_id_param
    AND mandatory = true
    AND applies = 'Equipos'
    AND is_active = true;

  IF NOT FOUND THEN RETURN; END IF;

  IF doc.special AND doc.conditions IS NOT NULL AND array_length(doc.conditions, 1) > 0 THEN
    SELECT array_to_json(doc.conditions)::jsonb INTO conditions_jsonb;
    where_sql := build_vehicle_where_alias(conditions_jsonb, 'v');

    IF where_sql IS NULL OR where_sql = '' OR where_sql = 'TRUE' THEN RETURN; END IF;

    -- Task 4 (multi-empresa): tipo global -> vehiculos de todas las empresas; tipo de una
    -- empresa -> solo los de esa. El match final lo decide la condicion (where_sql).
    FOR vehicle_record IN
      SELECT id FROM vehicles
      WHERE (COALESCE(doc.down_document, false) OR is_active = true)
        AND (doc.company_id IS NULL OR company_id = doc.company_id)
    LOOP
      EXECUTE format(
        'SELECT EXISTS(SELECT 1 FROM vehicles v WHERE v.id = %L AND %s)',
        vehicle_record.id, where_sql
      ) INTO vehicle_matches;

      IF vehicle_matches THEN
        -- 411: vuelve a cumplir -> re-activar lo que estuviese archivado (conserva archivo/validity)
        UPDATE documents_equipment SET archived_at = NULL
        WHERE id_document_types = doc.id
          AND applies = vehicle_record.id
          AND archived_at IS NOT NULL;
        INSERT INTO documents_equipment (id_document_types, applies, validity, state, is_active, user_id, deny_reason, document_path)
        SELECT doc.id, vehicle_record.id, NULL, 'pendiente', TRUE, NULL, NULL, NULL
        WHERE NOT EXISTS (
          SELECT 1 FROM documents_equipment
          WHERE id_document_types = doc.id AND applies = vehicle_record.id
        );
      ELSE
        -- Vehiculo ya no cumple condiciones: borrar alerta vacia (sin doc subido)
        DELETE FROM documents_equipment
        WHERE id_document_types = doc.id
          AND applies = vehicle_record.id
          AND (document_path IS NULL OR document_path = '');
      END IF;
    END LOOP;
  ELSE
    -- Tipo no especial: crear para todos los vehiculos de la(s) empresa(s) del tipo
    FOR vehicle_record IN
      SELECT id FROM vehicles
      WHERE (COALESCE(doc.down_document, false) OR is_active = true)
        AND (doc.company_id IS NULL OR company_id = doc.company_id)
    LOOP
      INSERT INTO documents_equipment (id_document_types, applies, validity, state, is_active, user_id, deny_reason, document_path)
      SELECT doc.id, vehicle_record.id, NULL, 'pendiente', TRUE, NULL, NULL, NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM documents_equipment
        WHERE id_document_types = doc.id AND applies = vehicle_record.id
      );
    END LOOP;
  END IF;
END;
$function$;

-- function get_documents_expiry_summary (origen: prisma/migrations/20260512190920_add_expired_doctype_ids_to_expiry_rpc/migration.sql)
CREATE OR REPLACE FUNCTION public.get_documents_expiry_summary(
  p_days_ahead int DEFAULT 7,
  p_detail_limit int DEFAULT 20,
  -- Task 4: empresa a resumir (el job de P5 corre una vez por empresa). NULL = todas.
  p_company_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_today date;
  v_window_end date;
  v_result jsonb;
BEGIN
  v_today := (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_window_end := v_today + p_days_ahead;

  WITH
    employees_expiring_all AS (
      SELECT
        de.id,
        de.applies AS employee_id,
        de.id_document_types AS document_type_id,
        de.validity::date AS validity,
        e.file AS file_number,
        TRIM(BOTH ' ' FROM CONCAT_WS(', ', e.lastname, e.firstname)) AS employee_name,
        dt.name AS document_type_name,
        (de.validity::date - v_today)::int AS days_remaining
      FROM documents_employees de
      INNER JOIN employees e ON e.id = de.applies
      INNER JOIN document_types dt ON dt.id = de.id_document_types
      WHERE
        de.is_active = true
        AND e.is_active = true
        AND (p_company_id IS NULL OR e.company_id = p_company_id)
        AND dt.is_active = true
        AND de.state <> 'pendiente'
        AND de.validity IS NOT NULL
        AND de.validity::date BETWEEN v_today AND v_window_end
    ),
    equipment_expiring_all AS (
      SELECT
        deq.id,
        deq.applies AS vehicle_id,
        deq.id_document_types AS document_type_id,
        deq.validity::date AS validity,
        COALESCE(v.domain, '—') AS domain,
        COALESCE(v.intern_number, '—') AS intern_number,
        dt.name AS document_type_name,
        (deq.validity::date - v_today)::int AS days_remaining
      FROM documents_equipment deq
      INNER JOIN vehicles v ON v.id = deq.applies
      INNER JOIN document_types dt ON dt.id = deq.id_document_types
      WHERE
        deq.is_active = true
        AND v.is_active = true
        AND (p_company_id IS NULL OR v.company_id = p_company_id)
        AND dt.is_active = true
        AND deq.state <> 'pendiente'
        AND deq.validity IS NOT NULL
        AND deq.validity::date BETWEEN v_today AND v_window_end
    ),
    company_docs_parsed AS (
      SELECT
        dc.id,
        dc.id_document_types AS document_type_id,
        dc.state,
        dc.validity AS validity_raw,
        CASE
          WHEN dc.validity ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
            THEN TO_DATE(dc.validity, 'DD/MM/YYYY')
          ELSE NULL
        END AS validity_parsed,
        dt.name AS document_type_name
      FROM documents_company dc
      INNER JOIN document_types dt ON dt.id = dc.id_document_types
      WHERE
        dc.is_active = true
        AND dt.is_active = true
        AND (p_company_id IS NULL OR dc.applies = p_company_id)
    ),
    company_expiring_all AS (
      SELECT
        id,
        document_type_id,
        validity_parsed AS validity,
        validity_raw,
        document_type_name,
        (validity_parsed - v_today)::int AS days_remaining
      FROM company_docs_parsed
      WHERE
        state <> 'pendiente'
        AND validity_parsed IS NOT NULL
        AND validity_parsed BETWEEN v_today AND v_window_end
    ),
    -- ── IDs distintos de doc_types para vencidos (por entidad) ──────────────
    employees_expired_doc_type_ids AS (
      SELECT DISTINCT de.id_document_types AS dt_id
      FROM documents_employees de
      INNER JOIN employees e ON e.id = de.applies
      INNER JOIN document_types dt ON dt.id = de.id_document_types
      WHERE de.is_active = true
        AND e.is_active = true
        AND (p_company_id IS NULL OR e.company_id = p_company_id)
        AND dt.is_active = true
        AND de.state <> 'pendiente'
        AND de.validity IS NOT NULL
        AND de.validity::date < v_today
    ),
    equipment_expired_doc_type_ids AS (
      SELECT DISTINCT deq.id_document_types AS dt_id
      FROM documents_equipment deq
      INNER JOIN vehicles v ON v.id = deq.applies
      INNER JOIN document_types dt ON dt.id = deq.id_document_types
      WHERE deq.is_active = true
        AND v.is_active = true
        AND (p_company_id IS NULL OR v.company_id = p_company_id)
        AND dt.is_active = true
        AND deq.state <> 'pendiente'
        AND deq.validity IS NOT NULL
        AND deq.validity::date < v_today
    ),
    company_expired_doc_type_ids AS (
      SELECT DISTINCT document_type_id AS dt_id
      FROM company_docs_parsed
      WHERE state <> 'pendiente'
        AND validity_parsed IS NOT NULL
        AND validity_parsed < v_today
    )

  SELECT jsonb_build_object(
    'generated_at',  NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires',
    'today',         v_today,
    'window_end',    v_window_end,
    'days_ahead',    p_days_ahead,
    'detail_limit',  p_detail_limit,

    'expiring_soon', jsonb_build_object(
      'employees', jsonb_build_object(
        'total',  (SELECT COUNT(*) FROM employees_expiring_all),
        'detail', COALESCE(
          (SELECT jsonb_agg(
              jsonb_build_object(
                'id',                  d.id,
                'employee_id',         d.employee_id,
                'document_type_id',    d.document_type_id,
                'file_number',         d.file_number,
                'employee_name',       d.employee_name,
                'document_type_name',  d.document_type_name,
                'validity',            d.validity,
                'days_remaining',      d.days_remaining
              ) ORDER BY d.validity, d.employee_name
           ) FROM employees_expiring_all d),
          '[]'::jsonb
        )
      ),
      'equipment', jsonb_build_object(
        'total',  (SELECT COUNT(*) FROM equipment_expiring_all),
        'detail', COALESCE(
          (SELECT jsonb_agg(
              jsonb_build_object(
                'id',                  d.id,
                'vehicle_id',          d.vehicle_id,
                'document_type_id',    d.document_type_id,
                'domain',              d.domain,
                'intern_number',       d.intern_number,
                'document_type_name',  d.document_type_name,
                'validity',            d.validity,
                'days_remaining',      d.days_remaining
              ) ORDER BY d.validity, d.domain
           ) FROM equipment_expiring_all d),
          '[]'::jsonb
        )
      ),
      'company', jsonb_build_object(
        'total',  (SELECT COUNT(*) FROM company_expiring_all),
        'detail', COALESCE(
          (SELECT jsonb_agg(
              jsonb_build_object(
                'id',                  d.id,
                'document_type_id',    d.document_type_id,
                'document_type_name',  d.document_type_name,
                'validity',            d.validity,
                'validity_raw',        d.validity_raw,
                'days_remaining',      d.days_remaining
              ) ORDER BY d.validity, d.document_type_name
           ) FROM company_expiring_all d),
          '[]'::jsonb
        )
      )
    ),

    'expired_counts', jsonb_build_object(
      'employees', (
        SELECT COUNT(*)
        FROM documents_employees de
        INNER JOIN employees e ON e.id = de.applies
        INNER JOIN document_types dt ON dt.id = de.id_document_types
        WHERE de.is_active = true
          AND e.is_active = true
          AND (p_company_id IS NULL OR e.company_id = p_company_id)
          AND dt.is_active = true
          AND de.state <> 'pendiente'
          AND de.validity IS NOT NULL
          AND de.validity::date < v_today
      ),
      'equipment', (
        SELECT COUNT(*)
        FROM documents_equipment deq
        INNER JOIN vehicles v ON v.id = deq.applies
        INNER JOIN document_types dt ON dt.id = deq.id_document_types
        WHERE deq.is_active = true
          AND v.is_active = true
          AND (p_company_id IS NULL OR v.company_id = p_company_id)
          AND dt.is_active = true
          AND deq.state <> 'pendiente'
          AND deq.validity IS NOT NULL
          AND deq.validity::date < v_today
      ),
      'company', (
        SELECT COUNT(*)
        FROM company_docs_parsed
        WHERE state <> 'pendiente'
          AND validity_parsed IS NOT NULL
          AND validity_parsed < v_today
      )
    ),

    -- NUEVO: IDs distintos de doc_types con vencidos, por entidad
    'expired_doc_type_ids', jsonb_build_object(
      'employees', COALESCE(
        (SELECT jsonb_agg(dt_id) FROM employees_expired_doc_type_ids),
        '[]'::jsonb
      ),
      'equipment', COALESCE(
        (SELECT jsonb_agg(dt_id) FROM equipment_expired_doc_type_ids),
        '[]'::jsonb
      ),
      'company', COALESCE(
        (SELECT jsonb_agg(dt_id) FROM company_expired_doc_type_ids),
        '[]'::jsonb
      )
    ),

    'pending_counts', jsonb_build_object(
      'employees', (
        SELECT COUNT(*)
        FROM documents_employees de
        INNER JOIN employees e ON e.id = de.applies
        INNER JOIN document_types dt ON dt.id = de.id_document_types
        WHERE de.is_active = true
          AND e.is_active = true
          AND (p_company_id IS NULL OR e.company_id = p_company_id)
          AND dt.is_active = true
          AND de.state = 'pendiente'
      ),
      'equipment', (
        SELECT COUNT(*)
        FROM documents_equipment deq
        INNER JOIN vehicles v ON v.id = deq.applies
        INNER JOIN document_types dt ON dt.id = deq.id_document_types
        WHERE deq.is_active = true
          AND v.is_active = true
          AND (p_company_id IS NULL OR v.company_id = p_company_id)
          AND dt.is_active = true
          AND deq.state = 'pendiente'
      ),
      'company', (
        SELECT COUNT(*)
        FROM company_docs_parsed
        WHERE state = 'pendiente'
      )
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- function log_document_employee_changes (origen: prisma/migrations/20260629120100_optimize_document_triggers/migration.sql)
CREATE OR REPLACE FUNCTION public.log_document_employee_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO documents_employees_logs (documents_employees_id, modified_by, updated_at)
  SELECT id, user_id, now() FROM affected_rows WHERE user_id IS NOT NULL;
  RETURN NULL;
END; $$;

-- function log_document_equipment_changes (origen: prisma/migrations/20260629120100_optimize_document_triggers/migration.sql)
CREATE OR REPLACE FUNCTION public.log_document_equipment_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO documents_equipment_logs (documents_equipment_id, modified_by, updated_at)
  SELECT id, user_id, now() FROM affected_rows WHERE user_id IS NOT NULL;
  RETURN NULL;
END; $$;

-- function recalcular_status_documentacion (origen: prisma/migrations/20260917120000_ticket_712_unificar_status_documentacion/migration.sql)
CREATE OR REPLACE FUNCTION public.recalcular_status_documentacion(
  resource_ids uuid[],
  resource_type text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  IF resource_ids IS NULL OR cardinality(resource_ids) = 0 THEN
    RETURN;
  END IF;

  IF resource_type = 'Persona' THEN
    UPDATE employees e
    SET status = calc.nuevo
    FROM (
      SELECT x.id,
        (CASE
          WHEN EXISTS (
            SELECT 1 FROM documents_employees d
            WHERE d.applies = x.id AND d.state = 'vencido' AND d.archived_at IS NULL
          ) THEN 'Completo con doc vencida'
          WHEN NOT EXISTS (
            SELECT 1 FROM documents_employees d
            WHERE d.applies = x.id AND d.state <> 'presentado' AND d.archived_at IS NULL
          ) THEN 'Completo'
          ELSE 'Incompleto'
        END)::status_type AS nuevo
      FROM employees x
      WHERE x.id = ANY(resource_ids)
    ) calc
    WHERE e.id = calc.id
      AND e.status IS DISTINCT FROM calc.nuevo;

  ELSIF resource_type = 'Equipos' THEN
    UPDATE vehicles v
    SET status = calc.nuevo
    FROM (
      SELECT x.id,
        (CASE
          WHEN EXISTS (
            SELECT 1 FROM documents_equipment d
            WHERE d.applies = x.id AND d.state = 'vencido' AND d.archived_at IS NULL
          ) THEN 'Completo con doc vencida'
          WHEN NOT EXISTS (
            SELECT 1 FROM documents_equipment d
            WHERE d.applies = x.id AND d.state <> 'presentado' AND d.archived_at IS NULL
          ) THEN 'Completo'
          ELSE 'Incompleto'
        END)::status_type AS nuevo
      FROM vehicles x
      WHERE x.id = ANY(resource_ids)
    ) calc
    WHERE v.id = calc.id
      AND v.status IS DISTINCT FROM calc.nuevo;
  END IF;
END;
$function$;

-- function trg_controlar_alertas_employees (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.trg_controlar_alertas_employees()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('myapp.inside_controlar_alertas', true) = 'true' THEN
    RETURN NEW;
  END IF;
  
  PERFORM set_config('myapp.inside_controlar_alertas', 'true', true);
  PERFORM controlar_alertas_documentos_single_employee(NEW.id, NEW.company_id);
  PERFORM set_config('myapp.inside_controlar_alertas', 'false', true);
  
  RETURN NEW;
END;
$function$;

-- function trg_controlar_alertas_vehicles (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.trg_controlar_alertas_vehicles()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('myapp.inside_controlar_alertas_vehicles', true) = 'true' THEN
    RETURN NEW;
  END IF;
  
  PERFORM set_config('myapp.inside_controlar_alertas_vehicles', 'true', true);
  PERFORM controlar_alertas_documentos_single_vehicle(NEW.id, NEW.company_id);
  PERFORM set_config('myapp.inside_controlar_alertas_vehicles', 'false', true);
  
  RETURN NEW;
END;
$function$;

-- function trg_document_types_insert (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.trg_document_types_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.mandatory THEN
    IF NEW.applies = 'Persona' THEN
      PERFORM controlar_alertas_single_document_all_employees(NEW.id);
    ELSIF NEW.applies = 'Equipos' THEN
      PERFORM controlar_alertas_single_document_all_vehicles(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- function trg_document_types_update (origen: prisma/migrations/20260313120000_fix_document_types_triggers/migration.sql)
CREATE OR REPLACE FUNCTION trg_document_types_update()
RETURNS trigger AS $$
BEGIN
  -- Si se esta desactivando, no reconciliar (la app maneja la limpieza)
  IF NEW.is_active = false THEN
    RETURN NEW;
  END IF;
  -- Si se esta reactivando, no reconciliar (la app maneja la creacion de alertas)
  IF OLD.is_active = false AND NEW.is_active = true THEN
    RETURN NEW;
  END IF;
  -- Reconciliacion normal: solo si tipo esta activo y cambio mandatory/conditions
  IF NEW.mandatory OR (OLD.mandatory AND NEW.conditions IS DISTINCT FROM OLD.conditions) THEN
    IF NEW.applies = 'Persona' THEN
      PERFORM controlar_alertas_single_document_all_employees(NEW.id);
    ELSIF NEW.applies = 'Equipos' THEN
      PERFORM controlar_alertas_single_document_all_vehicles(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- function update_employee_diagram_status (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.update_employee_diagram_status(p_employee_id uuid, p_is_active boolean)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    affected_rows INTEGER;
    result JSON;
BEGIN
    -- Verificar que el empleado existe
    IF NOT EXISTS (SELECT 1 FROM employees WHERE id = p_employee_id) THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Employee not found',
            'affected_rows', 0
        );
    END IF;

    -- Actualizar todos los registros de employees_diagram para el empleado
    UPDATE employees_diagram 
    SET is_active = p_is_active
    WHERE employee_id = p_employee_id;
    
    -- Obtener el número de filas afectadas
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    
    -- Construir respuesta
    result := json_build_object(
        'success', true,
        'message', 'Employee diagram status updated successfully',
        'affected_rows', affected_rows,
        'employee_id', p_employee_id,
        'new_status', p_is_active
    );
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Error updating employee diagram status: ' || SQLERRM,
            'affected_rows', 0
        );
END;
$function$;

-- function update_status_trigger (origen: prisma/migrations/20260917120000_ticket_712_unificar_status_documentacion/migration.sql)
CREATE OR REPLACE FUNCTION public.update_status_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT applies) INTO ids
  FROM affected_rows
  WHERE applies IS NOT NULL;

  IF ids IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'documents_employees' THEN
    PERFORM public.recalcular_status_documentacion(ids, 'Persona');
  ELSIF TG_TABLE_NAME = 'documents_equipment' THEN
    PERFORM public.recalcular_status_documentacion(ids, 'Equipos');
  END IF;

  RETURN NULL;
END;
$function$;

-- ============================================================================
-- TRIGGERS (2)
-- ============================================================================
-- M1 (20261019100400_documents_derived_model): se eliminaron los 12 triggers que mantenian el modelo
-- materializado: controlar_alertas_employees, controlar_alertas_employees_insert, controlar_alertas_vehicles,
-- controlar_alertas_vehicles_insert, document_types_after_insert, document_types_after_update,
-- trg_update_documents_employees (+_ins, _del) y trg_update_documents_equipment (+_ins, _del).
-- El faltante se deriva de los tipos obligatorios y el status de employees/vehicles lo escribe solo el motor
-- (refreshDocumentStatus + job documents-status). Las funciones de arriba quedan DEPRECADAS y sin trigger
-- (controlar_alertas_*, trg_controlar_alertas_*, trg_document_types_*, update_status_trigger,
-- recalcular_status_documentacion): se conservan para el rollback y las retira M2.
-- Se conservan solo los de auditoria. Rollback: prisma/rollbacks/20261019100400_documents_derived_model/.

-- trigger document_employee_changes_trigger ON documents_employees (origen: prisma/migrations/20260629120100_optimize_document_triggers/migration.sql)
DROP TRIGGER IF EXISTS document_employee_changes_trigger ON public.documents_employees;
CREATE TRIGGER document_employee_changes_trigger
  AFTER INSERT ON public.documents_employees
  REFERENCING NEW TABLE AS affected_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.log_document_employee_changes();

-- trigger document_equipment_changes_trigger ON documents_equipment (origen: prisma/migrations/20260629120100_optimize_document_triggers/migration.sql)
DROP TRIGGER IF EXISTS document_equipment_changes_trigger ON public.documents_equipment;
CREATE TRIGGER document_equipment_changes_trigger
  AFTER INSERT ON public.documents_equipment
  REFERENCING NEW TABLE AS affected_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.log_document_equipment_changes();
