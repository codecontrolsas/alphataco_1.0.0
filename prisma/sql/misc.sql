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
