-- Generado por scripts/sql/extract-sql-objects.ts — editar a mano SOLO en la revisión de Task 4
-- Dominio: misc — 24 objeto(s)
-- Revisado a mano en la Task 4 (P1): sin auth/storage, actor por app.user_id, filtro por empresa.

-- ============================================================================
-- FUNCTIONS (18)
-- ============================================================================

-- function app_current_user_id (nuevo en Task 4: reemplaza el uid del JWT de Supabase)
-- Actor de la transaccion. La app lo fija con `SET LOCAL app.user_id = '<uuid>'`
-- (helper `withActor`, P2) antes de las escrituras que disparan triggers de auditoria.
-- Sin setting (jobs, psql, seeds) devuelve NULL, igual que el uid de Supabase sin JWT.
CREATE OR REPLACE FUNCTION public.app_current_user_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN nullif(current_setting('app.user_id', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

-- function add_to_companies_employees (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.add_to_companies_employees()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$DECLARE
  contractor_id UUID;
BEGIN
  -- Insertar en companies_employees
  INSERT INTO companies_employees (company_id, employee_id)
  VALUES (NEW.company_id, NEW.id);

  -- Verificar si NEW.allocated_to no está vacío
  IF NEW.allocated_to IS NOT NULL AND array_length(NEW.allocated_to, 1) > 0 THEN
    -- Insertar en contractor_employee para cada ID en allocated_to
    FOREACH contractor_id IN ARRAY NEW.allocated_to
    LOOP
      INSERT INTO contractor_employee (contractor_id, employee_id)
      VALUES (contractor_id, NEW.id);
    END LOOP;
  END IF;

  RETURN NEW;
END;$function$;

-- function build_employee_where_alias (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.build_employee_where_alias(_conditions jsonb, table_alias text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  c       jsonb;
  parts   text[] := '{}'::text[];
  ids_txt text;
  values_txt text;
  log_prefix text := 'build_employee_where_alias:';
BEGIN
  RAISE LOG '%s Iniciando con _conditions=%', log_prefix, _conditions;
  
  IF _conditions IS NULL OR jsonb_typeof(_conditions) <> 'array' THEN
     RAISE LOG '%s condiciones nulas o no son un array, retornando TRUE', log_prefix;
     RETURN 'TRUE';
  END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(_conditions) LOOP
    RAISE LOG '%s Procesando condición: %', log_prefix, c;
    
    -- Verificar si hay IDs no vacíos disponibles
    SELECT '(' || string_agg(quote_literal(id), ',') || ')'
      INTO ids_txt
      FROM jsonb_array_elements_text(c -> 'ids') id
      WHERE id IS NOT NULL AND id <> '';
    
    RAISE LOG '%s property_key=% ids_txt=% relation_type=%', 
      log_prefix, c ->> 'property_key', ids_txt, c ->> 'relation_type';

    -- Si no hay IDs válidos, usar los valores directamente
    IF ids_txt IS NULL OR ids_txt = '()' THEN
      RAISE LOG '%s No hay IDs válidos, usando valores directamente', log_prefix;
      
      -- Obtener lista de valores como literales SQL
      SELECT '(' || string_agg(quote_literal(val), ',') || ')'
        INTO values_txt
        FROM jsonb_array_elements_text(c -> 'values') val
        WHERE val IS NOT NULL AND val <> '';
      
      RAISE LOG '%s values_txt=%', log_prefix, values_txt;
      
      -- Caso especial para contractor_employee (tabla de unión)
      IF c ->> 'property_key' = 'contractor_employee' AND c ->> 'relation_type' = 'many_to_many' THEN
        RAISE LOG '%s Usando condición especial para contractor_employee sin IDs', log_prefix;
        parts := parts || format(
          'EXISTS (
            SELECT 1 
            FROM %I rel
            JOIN customers cust ON rel.%I = cust.id
            WHERE rel.%I = %I.%I
              AND cust.name IN %s
          )',
          c ->> 'relation_table',
          c ->> 'filter_column',
          c ->> 'column_on_relation',
          table_alias,
          c ->> 'column_on_employees',
          values_txt
        );
      ELSE
        -- Para otras propiedades, omitir si no hay IDs ni una forma alternativa de filtrar
        RAISE LOG '%s No se pudo crear condición para % sin IDs válidos', log_prefix, c ->> 'property_key';
        CONTINUE;
      END IF;
    ELSE
      -- Si hay IDs válidos, usar la lógica original
      CASE c ->> 'relation_type'
        WHEN 'many_to_many' THEN
          RAISE LOG '%s Construyendo SQL para relación many_to_many', log_prefix;
          parts := parts || format(
            'EXISTS (SELECT 1 FROM %I rel
                      WHERE rel.%I = %I.%I
                        AND rel.%I IN %s)',
            c ->> 'relation_table',
            c ->> 'column_on_relation',
            table_alias,
            c ->> 'column_on_employees',
            c ->> 'filter_column',
            ids_txt
          );
          RAISE LOG '%s SQL para many_to_many: %', log_prefix, parts[array_length(parts, 1)];
        WHEN 'one_to_many' THEN
          RAISE LOG '%s Construyendo SQL para relación one_to_many', log_prefix;
          parts := parts || format(
            '%I.%I IN %s',
            table_alias,
            c ->> 'filter_column',
            ids_txt
          );
          RAISE LOG '%s SQL para one_to_many: %', log_prefix, parts[array_length(parts, 1)];
        ELSE
          RAISE LOG '%s Construyendo SQL para relación directa o desconocida', log_prefix;
          parts := parts || format(
            '%I.%I IN %s',
            table_alias,
            c ->> 'filter_column',
            ids_txt
          );
          RAISE LOG '%s SQL para relación directa: %', log_prefix, parts[array_length(parts, 1)];
      END CASE;
    END IF;
  END LOOP;

  IF array_length(parts, 1) = 0 THEN
    RAISE LOG '%s No se generaron condiciones válidas, retornando TRUE', log_prefix;
    RETURN 'TRUE';
  END IF;

  RAISE LOG '%s Finalizando, SQL construido: %', log_prefix, array_to_string(parts, ' AND ');
  RETURN array_to_string(parts, ' AND ');
END;
$function$;

-- function build_vehicle_where_alias (origen: prisma/migrations/20260313120000_fix_document_types_triggers/migration.sql)
CREATE OR REPLACE FUNCTION build_vehicle_where_alias(_conditions jsonb, table_alias text)
RETURNS text AS $$
DECLARE
  c       jsonb;
  parts   text[] := '{}';
  ids_txt text;
BEGIN
  IF _conditions IS NULL OR jsonb_typeof(_conditions) <> 'array' THEN
     RETURN 'TRUE';
  END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(_conditions) LOOP
    -- Filtrar IDs vacios/null (misma guarda que build_employee_where_alias)
    SELECT '(' || string_agg(quote_literal(id), ',') || ')'
      INTO ids_txt
      FROM jsonb_array_elements_text(c -> 'ids') id
      WHERE id IS NOT NULL AND id <> '';

    -- Si no hay IDs validos, skip esta condicion
    IF ids_txt IS NULL OR ids_txt = '()' THEN
      CONTINUE;
    END IF;

    CASE c ->> 'relation_type'
      WHEN 'many_to_many' THEN
        parts := parts || format(
          'EXISTS (SELECT 1 FROM %I rel
                    WHERE rel.%I = %I.%I
                      AND rel.%I IN %s)',
          c ->> 'relation_table',
          c ->> 'column_on_relation',
          table_alias,
          COALESCE(c ->> 'column_on_vehicles', 'id'),
          c ->> 'filter_column',
          ids_txt
        );
      WHEN 'one_to_many' THEN
        parts := parts || format(
          '%I.%I IN %s',
          table_alias,
          c ->> 'filter_column',
          ids_txt
        );
      ELSE
        parts := parts || format(
          '%I.%I IN %s',
          table_alias,
          c ->> 'filter_column',
          ids_txt
        );
    END CASE;
  END LOOP;

  -- Si no se generaron condiciones validas, retornar TRUE
  IF array_length(parts, 1) IS NULL OR array_length(parts, 1) = 0 THEN
    RETURN 'TRUE';
  END IF;

  RETURN array_to_string(parts, ' AND ');
END;
$$ LANGUAGE plpgsql;

-- function deactivate_service_items (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.deactivate_service_items()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE service_items
    SET is_active = NEW.is_active
    WHERE customer_service_id = NEW.id;
    RETURN NEW;
END;
$function$;

-- function equipment_allocated_to (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.equipment_allocated_to()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  contractor_id UUID;
BEGIN
  IF NEW.allocated_to IS NOT NULL AND array_length(NEW.allocated_to, 1) > 0 THEN
    -- Insertar en contractor_employee para cada ID en allocated_to
    FOREACH contractor_id IN ARRAY NEW.allocated_to
    LOOP
      INSERT INTO contractor_equipment(contractor_id, equipment_id)
      VALUES (contractor_id, NEW.id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- function find_employee_by_full_name_v2 (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.find_employee_by_full_name_v2(p_full_name text, p_company_id uuid)
 RETURNS SETOF employees
 LANGUAGE plpgsql
AS $function$
begin
  return query
  select e.*
  from employees e
  where e.company_id = p_company_id
  and (
    lower(concat(e.firstname, ' ', e.lastname)) like lower('%' || p_full_name || '%')
    or lower(concat(e.lastname, ' ', e.firstname)) like lower('%' || p_full_name || '%')
  )
  limit 1;
end;
$function$;

-- function format_employee_names (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.format_employee_names()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Formatear firstname si no es nulo
  IF NEW.firstname IS NOT NULL THEN
    NEW.firstname := (
      SELECT string_agg(
        INITCAP(word), ' '
      ) 
      FROM unnest(string_to_array(NEW.firstname, ' ')) AS word
    );
  END IF;
  
  -- Formatear lastname si no es nulo
  IF NEW.lastname IS NOT NULL THEN
    NEW.lastname := (
      SELECT string_agg(
        INITCAP(word), ' '
      ) 
      FROM unnest(string_to_array(NEW.lastname, ' ')) AS word
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- function get_max_order_number (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.get_max_order_number(p_company_id uuid DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    max_num INTEGER;
BEGIN
    -- Extraer el número máximo de los números de pedido de la empresa.
    -- Task 4: antes era global (mono-empresa). Con p_company_id NULL conserva el
    -- comportamiento viejo; el llamador en src/ (P2) debe pasar la empresa.
    SELECT COALESCE(
        MAX(CAST(
            SUBSTRING(numero_pedido FROM 'PED-0*([0-9]+)') AS INTEGER
        )),
        0
    ) INTO max_num
    FROM preparte
    WHERE numero_pedido IS NOT NULL
      AND (p_company_id IS NULL OR company_id = p_company_id);

    -- Formatear y retornar
    RETURN 'PED-' || LPAD(max_num::TEXT, 4, '0');
END;
$function$;

-- function log_customer_equipment_relations_changes (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.log_customer_equipment_relations_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    user_id UUID;
    readable_data JSONB;
    equipment_data RECORD;
    parent_exists BOOLEAN;
BEGIN
    -- Actor de la transaccion (app.user_id via withActor); NULL si no hay usuario
    user_id := public.app_current_user_id();
    
    IF TG_OP = 'INSERT' THEN
        -- For INSERT, get the vehicle details
        SELECT v.domain, v.intern_number INTO equipment_data
        FROM vehicles v
        WHERE v.id = NEW.customer_equipment_id;
        
        IF FOUND THEN
            readable_data := jsonb_build_object(
                'equipo_id', NEW.customer_equipment_id,
                'equipo_nombre', equipment_data.domain || 
                              CASE WHEN equipment_data.intern_number IS NOT NULL 
                              THEN ' (' || equipment_data.intern_number || ')' 
                              ELSE '' END,
                'equipo_identificador', equipment_data.domain
            );
            
            INSERT INTO dailyreportrows_history (
                daily_report_row_id,
                related_table,
                related_id,
                action_type,
                changed_fields,
                changed_data,
                changed_by
            ) VALUES (
                NEW.daily_report_row_id,
                'dailyreport_customer_equipment_relations',
                NEW.id,
                'LINK',
                '{}'::JSONB,
                readable_data,
                user_id
            );
        END IF;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Check if parent exists first
        SELECT EXISTS (
            SELECT 1 FROM dailyreportrows WHERE id = OLD.daily_report_row_id
        ) INTO parent_exists;
        
        IF parent_exists THEN
            SELECT v.domain, v.intern_number INTO equipment_data
            FROM vehicles v
            WHERE v.id = OLD.customer_equipment_id;
            
            IF FOUND THEN
                readable_data := jsonb_build_object(
                    'equipo_id', OLD.customer_equipment_id,
                    'equipo_nombre', equipment_data.domain || 
                                  CASE WHEN equipment_data.intern_number IS NOT NULL 
                                  THEN ' (' || equipment_data.intern_number || ')' 
                                  ELSE '' END,
                    'equipo_identificador', equipment_data.domain
                );
                
                INSERT INTO dailyreportrows_history (
                    daily_report_row_id,
                    related_table,
                    related_id,
                    action_type,
                    changed_fields,
                    changed_data,
                    changed_by
                ) VALUES (
                    OLD.daily_report_row_id,
                    'dailyreport_customer_equipment_relations',
                    OLD.id,
                    'UNLINK',
                    '{}'::JSONB,
                    readable_data,
                    user_id
                );
            END IF;
        END IF;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$;

-- function log_employee_relations_changes (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.log_employee_relations_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    user_id UUID;
    readable_data JSONB;
    employee_data RECORD;
    parent_exists BOOLEAN;
BEGIN
    -- Actor de la transaccion (app.user_id via withActor); NULL si no hay usuario
    user_id := public.app_current_user_id();
    
    IF TG_OP = 'INSERT' THEN
        -- For INSERT, get the employee details
        SELECT e.firstname, e.lastname INTO employee_data
        FROM employees e
        WHERE e.id = NEW.employee_id;
        
        IF FOUND THEN
            readable_data := jsonb_build_object(
                'empleado_id', NEW.employee_id,
                'empleado_nombre', COALESCE(employee_data.firstname, '') || ' ' || COALESCE(employee_data.lastname, '')
            );
            
            INSERT INTO dailyreportrows_history (
                daily_report_row_id,
                related_table,
                related_id,
                action_type,
                changed_fields,
                changed_data,
                changed_by
            ) VALUES (
                NEW.daily_report_row_id,
                'dailyreportemployeerelations',
                NEW.id,
                'LINK',
                '{}'::JSONB,
                readable_data,
                user_id
            );
        END IF;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Check if parent exists first
        SELECT EXISTS (
            SELECT 1 FROM dailyreportrows WHERE id = OLD.daily_report_row_id
        ) INTO parent_exists;
        
        IF parent_exists THEN
            SELECT e.firstname, e.lastname INTO employee_data
            FROM employees e
            WHERE e.id = OLD.employee_id;
            
            IF FOUND THEN
                readable_data := jsonb_build_object(
                    'empleado_id', OLD.employee_id,
                    'empleado_nombre', COALESCE(employee_data.firstname, '') || ' ' || COALESCE(employee_data.lastname, '')
                );
                
                INSERT INTO dailyreportrows_history (
                    daily_report_row_id,
                    related_table,
                    related_id,
                    action_type,
                    changed_fields,
                    changed_data,
                    changed_by
                ) VALUES (
                    OLD.daily_report_row_id,
                    'dailyreportemployeerelations',
                    OLD.id,
                    'UNLINK',
                    '{}'::JSONB,
                    readable_data,
                    user_id
                );
            END IF;
        END IF;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$;

-- function log_equipment_relations_changes (origen: supabase/migrations/20260304035040_sinc-2.sql)
CREATE OR REPLACE FUNCTION public.log_equipment_relations_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    user_id UUID;
    readable_data JSONB;
    vehicle_data RECORD;
    other_equip_data RECORD;
    parent_exists BOOLEAN;
    ref_equipment_id UUID;
    ref_other_equipment_id UUID;
    ref_row_id UUID;
    ref_rel_id UUID;
BEGIN
    user_id := public.app_current_user_id();

    IF TG_OP = 'DELETE' THEN
        ref_equipment_id := OLD.equipment_id;
        ref_other_equipment_id := OLD.other_equipment_id;
        ref_row_id := OLD.daily_report_row_id;
        ref_rel_id := OLD.id;
    ELSE
        ref_equipment_id := NEW.equipment_id;
        ref_other_equipment_id := NEW.other_equipment_id;
        ref_row_id := NEW.daily_report_row_id;
        ref_rel_id := NEW.id;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF ref_equipment_id IS NOT NULL THEN
            SELECT v.domain, v.intern_number INTO vehicle_data
            FROM vehicles v WHERE v.id = ref_equipment_id;

            IF FOUND THEN
                readable_data := jsonb_build_object(
                    'vehiculo_id', ref_equipment_id,
                    'vehiculo_dominio', vehicle_data.domain,
                    'vehiculo_numero_interno', vehicle_data.intern_number,
                    'tipo_equipo', 'vehicle'
                );
            END IF;
        ELSIF ref_other_equipment_id IS NOT NULL THEN
            SELECT oe.intern_number, oe.serial_number, t.name as type_name
            INTO other_equip_data
            FROM other_equipment oe
            LEFT JOIN type t ON t.id = oe.type_id
            WHERE oe.id = ref_other_equipment_id;

            IF FOUND THEN
                readable_data := jsonb_build_object(
                    'otro_equipo_id', ref_other_equipment_id,
                    'otro_equipo_numero_interno', other_equip_data.intern_number,
                    'otro_equipo_numero_serie', other_equip_data.serial_number,
                    'otro_equipo_tipo', other_equip_data.type_name,
                    'tipo_equipo', 'other_equipment'
                );
            END IF;
        END IF;

        IF readable_data IS NOT NULL THEN
            INSERT INTO dailyreportrows_history (
                daily_report_row_id, related_table, related_id,
                action_type, changed_fields, changed_data, changed_by
            ) VALUES (
                ref_row_id, 'dailyreportequipmentrelations', ref_rel_id,
                'LINK', '{}'::JSONB, readable_data, user_id
            );
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        SELECT EXISTS (
            SELECT 1 FROM dailyreportrows WHERE id = ref_row_id
        ) INTO parent_exists;

        IF parent_exists THEN
            IF ref_equipment_id IS NOT NULL THEN
                SELECT v.domain, v.intern_number INTO vehicle_data
                FROM vehicles v WHERE v.id = ref_equipment_id;

                IF FOUND THEN
                    readable_data := jsonb_build_object(
                        'vehiculo_id', ref_equipment_id,
                        'vehiculo_dominio', vehicle_data.domain,
                        'vehiculo_numero_interno', vehicle_data.intern_number,
                        'tipo_equipo', 'vehicle'
                    );
                END IF;
            ELSIF ref_other_equipment_id IS NOT NULL THEN
                SELECT oe.intern_number, oe.serial_number, t.name as type_name
                INTO other_equip_data
                FROM other_equipment oe
                LEFT JOIN type t ON t.id = oe.type_id
                WHERE oe.id = ref_other_equipment_id;

                IF FOUND THEN
                    readable_data := jsonb_build_object(
                        'otro_equipo_id', ref_other_equipment_id,
                        'otro_equipo_numero_interno', other_equip_data.intern_number,
                        'otro_equipo_numero_serie', other_equip_data.serial_number,
                        'otro_equipo_tipo', other_equip_data.type_name,
                        'tipo_equipo', 'other_equipment'
                    );
                END IF;
            END IF;

            IF readable_data IS NOT NULL THEN
                INSERT INTO dailyreportrows_history (
                    daily_report_row_id, related_table, related_id,
                    action_type, changed_fields, changed_data, changed_by
                ) VALUES (
                    ref_row_id, 'dailyreportequipmentrelations', ref_rel_id,
                    'UNLINK', '{}'::JSONB, readable_data, user_id
                );
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$;

-- function log_reassignment_reason_before_update (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.log_reassignment_reason_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    reason TEXT;
BEGIN
    BEGIN
        reason := current_setting('myapp.reassignment_reason', true);
        RAISE LOG 'BEFORE UPDATE: reassignment_reason = %', reason;
    EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'BEFORE UPDATE: Error obteniendo reassignment_reason';
    END;
    
    RETURN NEW;
END;
$function$;

-- function next_pre_file_number (origen: prisma/migrations/20260810120000_auto_generate_pre_file_number/migration.sql)
CREATE OR REPLACE FUNCTION public.next_pre_file_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  -- Se libera solo al terminar la transaccion del INSERT: sin esto, dos altas
  -- concurrentes leerian el mismo maximo y chocarian contra el unique.
  PERFORM pg_advisory_xact_lock(hashtext('pre_employees.pre_file_number'), hashtext(p_company_id::text));

  SELECT COALESCE(MAX(SUBSTRING(pre_file_number FROM 4)::integer), 0) + 1
  INTO v_next
  FROM pre_employees
  WHERE company_id = p_company_id
    AND pre_file_number ~ '^PL-[0-9]+$';

  RETURN 'PL-' || LPAD(v_next::text, 4, '0');
END;
$$;

-- function select_distinct_values (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.select_distinct_values(p_table_name text, p_column_path text, p_join_mappings jsonb DEFAULT NULL::jsonb, p_multi_join_paths jsonb DEFAULT NULL::jsonb, p_filters jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(col_value text, col_count bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
    query TEXT;
    parts TEXT[];
    current_table TEXT;
    current_column TEXT;
    join_clause TEXT := '';
    where_clause TEXT := '';
    table_alias_counter INTEGER := 1;
    i INTEGER;
    target_table TEXT;
    fk_column TEXT;
    mapping_key TEXT;
    mapping_value TEXT;
    processed_mappings JSONB;
    join_info JSONB;
    joins_array_length INTEGER;
    parsed_multi_join_paths JSONB;
    parsed_filters JSONB;
    filter_key TEXT;
    filter_value TEXT;
    filter_conditions TEXT[] := ARRAY[]::TEXT[];
    -- 🔑 NUEVO: Mapeo de tablas a aliases
    table_aliases JSONB := '{}'::JSONB;
    filter_table TEXT;
    filter_column TEXT;
    filter_parts TEXT[];
BEGIN
    RAISE LOG '[SELECT_DISTINCT_VALUES] === INICIO DE EJECUCIÓN ===';
    RAISE LOG '[SELECT_DISTINCT_VALUES] Parámetros de entrada:';
    RAISE LOG '[SELECT_DISTINCT_VALUES] - p_table_name: %', p_table_name;
    RAISE LOG '[SELECT_DISTINCT_VALUES] - p_column_path: %', p_column_path;
    RAISE LOG '[SELECT_DISTINCT_VALUES] - p_join_mappings: %', p_join_mappings;
    RAISE LOG '[SELECT_DISTINCT_VALUES] - p_multi_join_paths: %', p_multi_join_paths;
    RAISE LOG '[SELECT_DISTINCT_VALUES] - p_filters: %', p_filters;
    
    -- 🔑 NUEVO: Inicializar mapeo de tabla principal
    table_aliases := jsonb_set(table_aliases, ARRAY[p_table_name], to_jsonb(p_table_name));
    
    -- Si se proporciona multi_join_paths, usar la nueva lógica
    IF p_multi_join_paths IS NOT NULL AND p_multi_join_paths != 'null'::jsonb THEN
        RAISE LOG '[SELECT_DISTINCT_VALUES] Usando multi_join_paths';
        
        -- Parsear el JSON si viene como string
        BEGIN
            IF jsonb_typeof(p_multi_join_paths) = 'string' THEN
                parsed_multi_join_paths := (p_multi_join_paths #>> '{}')::JSONB;
                RAISE LOG '[SELECT_DISTINCT_VALUES] JSON parseado desde string: %', parsed_multi_join_paths;
            ELSE
                parsed_multi_join_paths := p_multi_join_paths;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Error al parsear p_multi_join_paths: %. Valor recibido: %', SQLERRM, p_multi_join_paths;
        END;
        
        -- Validar que el parámetro tenga la estructura correcta
        IF NOT (parsed_multi_join_paths ? 'joins' AND parsed_multi_join_paths ? 'final_column') THEN
            RAISE EXCEPTION 'p_multi_join_paths debe contener "joins" y "final_column". Recibido: %', parsed_multi_join_paths;
        END IF;
        
        -- Obtener la longitud del array de joins de forma segura
        joins_array_length := jsonb_array_length(parsed_multi_join_paths->'joins');
        
        IF joins_array_length IS NULL OR joins_array_length = 0 THEN
            RAISE EXCEPTION 'El array "joins" en p_multi_join_paths está vacío o es NULL';
        END IF;
        
        current_table := p_table_name;
        
        -- Construir JOINs múltiples basados en el array de joins
        FOR i IN 0..joins_array_length - 1 LOOP
            join_info := parsed_multi_join_paths->'joins'->i;
            
            -- Validar que el join_info tenga todas las propiedades necesarias
            IF NOT (join_info ? 'from_table' AND join_info ? 'to_table' AND join_info ? 'from_column' AND join_info ? 'to_column') THEN
                RAISE EXCEPTION 'Cada elemento del array "joins" debe contener: from_table, to_table, from_column, to_column';
            END IF;
            
            join_clause := join_clause || format(' LEFT JOIN %I t%s ON %I.%I::TEXT = t%s.%I::TEXT',
                join_info->>'to_table', 
                table_alias_counter,
                current_table,
                join_info->>'from_column',
                table_alias_counter,
                join_info->>'to_column'
            );
            
            -- 🔑 NUEVO: Registrar alias de tabla
            table_aliases := jsonb_set(table_aliases, ARRAY[join_info->>'to_table'], to_jsonb('t' || table_alias_counter));
            
            RAISE LOG '[SELECT_DISTINCT_VALUES] JOIN construido: %', join_clause;
            RAISE LOG '[SELECT_DISTINCT_VALUES] Alias registrado: % -> t%', join_info->>'to_table', table_alias_counter;
            
            current_table := 't' || table_alias_counter;
            table_alias_counter := table_alias_counter + 1;
        END LOOP;
        
        -- Extraer tabla y columna final
        parts := string_to_array(parsed_multi_join_paths->>'final_column', '.');
        IF array_length(parts, 1) = 2 THEN
            current_table := 't' || (table_alias_counter - 1); -- Usar el último alias
            current_column := parts[2];
        ELSE
            current_column := parsed_multi_join_paths->>'final_column';
        END IF;
        
    ELSE
        -- Lógica existente sin cambios para join_mappings
        BEGIN
            IF p_join_mappings IS NOT NULL AND jsonb_typeof(p_join_mappings) = 'string' THEN
                processed_mappings := (p_join_mappings #>> '{}')::JSONB;
                RAISE LOG '[SELECT_DISTINCT_VALUES] Convertido string JSON interno a JSONB: %', processed_mappings;
            ELSE
                processed_mappings := p_join_mappings;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Error al procesar p_join_mappings: %. Valor recibido: %', SQLERRM, p_join_mappings;
        END;
        
        -- Dividir el column_path en partes
        parts := string_to_array(p_column_path, '.');
        current_table := p_table_name;
        
        -- Si hay más de una parte, es una relación anidada
        IF array_length(parts, 1) > 1 THEN
            RAISE LOG '[SELECT_DISTINCT_VALUES] Partes anidadas detectadas: %', array_to_string(parts, ', ');
            RAISE LOG '[SELECT_DISTINCT_VALUES] Procesando relación anidada...';
            
            -- Procesar cada nivel de la relación
            FOR i IN 1..array_length(parts, 1)-1 LOOP
                RAISE LOG '[SELECT_DISTINCT_VALUES] Procesando nivel %: buscando tabla destino para columna %', i, parts[i];
                
                -- Buscar en los mappings
                target_table := NULL;
                fk_column := NULL;
                
                -- Iterar sobre los mappings para encontrar la relación
                IF processed_mappings IS NOT NULL THEN
                    FOR mapping_key, mapping_value IN SELECT * FROM jsonb_each_text(processed_mappings) LOOP
                        RAISE LOG '[SELECT_DISTINCT_VALUES] Evaluando mapping: % -> %', mapping_key, mapping_value;
                        
                        -- CORREGIDO: Formato correcto {"tabla_destino": "columna_fk"}
                        IF mapping_key = parts[i] THEN
                            target_table := mapping_key;
                            fk_column := mapping_value;
                            RAISE LOG '[SELECT_DISTINCT_VALUES] Formato correcto detectado: tabla_destino=%, columna_fk=%', target_table, fk_column;
                            EXIT;
                        END IF;
                        
                        -- Formato legacy: {"columna_fk": "tabla_destino"}
                        IF mapping_value = parts[i] THEN
                            target_table := mapping_value;
                            fk_column := mapping_key;
                            RAISE LOG '[SELECT_DISTINCT_VALUES] Formato legacy detectado: tabla_destino=%, columna_fk=%', target_table, fk_column;
                            RAISE WARNING '[SELECT_DISTINCT_VALUES] Usando formato legacy de join_mappings. Se recomienda usar: {"%": "%"}', parts[i], target_table;
                            EXIT;
                        END IF;
                    END LOOP;
                END IF;
                
                -- Si no se encontró mapping, buscar por foreign key
                IF target_table IS NULL THEN
                    SELECT 
                        ccu.table_name,
                        kcu.column_name
                    INTO target_table, fk_column
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_name = current_table
                      AND kcu.column_name = parts[i]
                    LIMIT 1;
                    
                    IF target_table IS NOT NULL THEN
                        RAISE LOG '[SELECT_DISTINCT_VALUES] Relación encontrada por FK: tabla_destino=%, columna_fk=%', target_table, fk_column;
                    END IF;
                END IF;
                
                -- Si aún no se encontró, error
                IF target_table IS NULL THEN
                    RAISE EXCEPTION 'No se encontró clave foránea para la columna % en la tabla % y no hay mapping disponible', parts[i], current_table;
                END IF;
                
                -- Validar que la tabla destino existe
                IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = target_table AND table_schema = 'public') THEN
                    RAISE EXCEPTION 'La tabla destino % no existe', target_table;
                END IF;
                
                -- Validar que la columna FK existe en la tabla actual
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = current_table AND column_name = fk_column AND table_schema = 'public') THEN
                    RAISE EXCEPTION 'La columna % no existe en la tabla %', fk_column, current_table;
                END IF;
                
                -- Construir el JOIN
                join_clause := join_clause || format(' LEFT JOIN %I t%s ON %I.%I::TEXT = t%s.id::TEXT',
                    target_table, table_alias_counter, current_table, fk_column, table_alias_counter);
                
                -- 🔑 NUEVO: Registrar alias de tabla
                table_aliases := jsonb_set(table_aliases, ARRAY[target_table], to_jsonb('t' || table_alias_counter));
                
                RAISE LOG '[SELECT_DISTINCT_VALUES] JOIN construido: %', join_clause;
                RAISE LOG '[SELECT_DISTINCT_VALUES] Alias registrado: % -> t%', target_table, table_alias_counter;
                
                current_table := 't' || table_alias_counter;
                table_alias_counter := table_alias_counter + 1;
            END LOOP;
            
            current_column := parts[array_length(parts, 1)];
        ELSE
            current_column := p_column_path;
        END IF;
    END IF;
    
    -- 🔑 MODIFICADO: Procesar filtros con soporte para relaciones
    IF p_filters IS NOT NULL AND p_filters != 'null'::jsonb AND jsonb_typeof(p_filters) != 'null' THEN
        RAISE LOG '[SELECT_DISTINCT_VALUES] Procesando filtros: %', p_filters;
        
        -- Parsear el JSON si viene como string
        BEGIN
            IF jsonb_typeof(p_filters) = 'string' THEN
                parsed_filters := (p_filters #>> '{}')::JSONB;
                RAISE LOG '[SELECT_DISTINCT_VALUES] Filtros parseados desde string: %', parsed_filters;
            ELSE
                parsed_filters := p_filters;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Error al parsear p_filters: %. Valor recibido: %', SQLERRM, p_filters;
        END;
        
        -- Verificar que parsed_filters no sea null antes de iterar
        IF parsed_filters IS NOT NULL AND jsonb_typeof(parsed_filters) = 'object' THEN
            -- Iterar sobre cada filtro
            FOR filter_key, filter_value IN SELECT * FROM jsonb_each_text(parsed_filters) LOOP
                RAISE LOG '[SELECT_DISTINCT_VALUES] Aplicando filtro: % = %', filter_key, filter_value;
                
                -- 🔑 NUEVO: Determinar tabla y columna del filtro
                filter_parts := string_to_array(filter_key, '.');
                IF array_length(filter_parts, 1) = 2 THEN
                    -- Filtro con tabla.columna
                    filter_table := filter_parts[1];
                    filter_column := filter_parts[2];
                    
                    -- Buscar el alias de la tabla
                    IF table_aliases ? filter_table THEN
                        filter_table := table_aliases ->> filter_table;
                        RAISE LOG '[SELECT_DISTINCT_VALUES] Usando alias para tabla %: %', filter_parts[1], filter_table;
                    ELSE
                        -- Si no hay alias, usar el nombre original
                        filter_table := filter_parts[1];
                        RAISE LOG '[SELECT_DISTINCT_VALUES] No se encontró alias para tabla %, usando nombre original', filter_table;
                    END IF;
                ELSE
                    -- Filtro simple, usar tabla principal
                    filter_table := p_table_name;
                    filter_column := filter_key;
                END IF;
                
                -- Construir condición de filtro
                IF filter_value = 'null' THEN
                    filter_conditions := array_append(filter_conditions, format('%I.%I IS NULL', filter_table, filter_column));
                ELSIF filter_value = 'not_null' THEN
                    filter_conditions := array_append(filter_conditions, format('%I.%I IS NOT NULL', filter_table, filter_column));
                ELSIF filter_value IN ('true', 'false') THEN
                    -- Para valores booleanos
                    filter_conditions := array_append(filter_conditions, format('%I.%I = %s', filter_table, filter_column, filter_value));
                ELSE
                    -- Para valores de texto
                    filter_conditions := array_append(filter_conditions, format('%I.%I::TEXT = %L', filter_table, filter_column, filter_value));
                END IF;
                
                RAISE LOG '[SELECT_DISTINCT_VALUES] Condición de filtro construida: %', filter_conditions[array_length(filter_conditions, 1)];
            END LOOP;
        END IF;
        
        -- Construir cláusula WHERE
        IF array_length(filter_conditions, 1) > 0 THEN
            where_clause := ' WHERE ' || array_to_string(filter_conditions, ' AND ');
            RAISE LOG '[SELECT_DISTINCT_VALUES] Cláusula WHERE construida: %', where_clause;
        END IF;
    ELSE
        RAISE LOG '[SELECT_DISTINCT_VALUES] No se aplicarán filtros (p_filters es null o vacío)';
    END IF;
    
    -- Construir la consulta final
    query := format('SELECT COALESCE(%I.%I::TEXT, ''null'') as col_value, COUNT(*) as col_count FROM %I%s%s GROUP BY COALESCE(%I.%I::TEXT, ''null'') ORDER BY col_value ASC',
        current_table, current_column, p_table_name, join_clause, where_clause, current_table, current_column);
    
    RAISE LOG '[SELECT_DISTINCT_VALUES] Consulta SQL generada: %', query;
    
    -- Ejecutar la consulta
    RETURN QUERY EXECUTE query;
    
    RAISE LOG '[SELECT_DISTINCT_VALUES] === FIN DE EJECUCIÓN ===';
END;
$function$;

-- function update_company_by_defect (origen: supabase/migrations/20251103211302_initial_structure.sql)
CREATE OR REPLACE FUNCTION public.update_company_by_defect()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.by_defect = true THEN
        UPDATE company
        SET by_defect = false
        WHERE owner_id = NEW.owner_id AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$function$;

-- function update_updated_at_column (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- function set_updated_at (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET "TimeZone" TO 'America/Argentina/Buenos_Aires'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- TRIGGERS (2)
-- ============================================================================
-- T3b (20261019100200_move_cascades_to_code): se eliminaron update_company_by_defect_trigger,
-- after_service_update (customer_services), after_employee_insert y add_contractor_equipment_after_insert.
-- Sus cascadas viven en el código; las funciones siguen acá hasta T6. La regla "una empresa por
-- defecto por owner" es el índice único parcial company_one_default_per_owner (schema.prisma).

-- trigger update_empleado_aptitudes_updated_at ON empleado_aptitudes (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS update_empleado_aptitudes_updated_at ON public.empleado_aptitudes;
CREATE TRIGGER update_empleado_aptitudes_updated_at BEFORE UPDATE ON public.empleado_aptitudes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- trigger format_employee_names_trigger ON employees (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS format_employee_names_trigger ON public.employees;
CREATE TRIGGER format_employee_names_trigger BEFORE INSERT OR UPDATE OF firstname, lastname ON public.employees FOR EACH ROW EXECUTE FUNCTION public.format_employee_names();
