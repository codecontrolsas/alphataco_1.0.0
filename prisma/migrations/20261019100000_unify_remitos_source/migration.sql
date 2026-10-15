-- Remitos: una sola fuente (tabla `remitos`).
--
-- Hasta acá convivían dos lugares para el remito de una línea del parte diario:
-- la columna de texto `dailyreportrows.remit_number` (la escribía solo el formulario de Operaciones)
-- y la tabla `remitos` + `remito_documents` (la escriben Comercial y el gestor de remitos).
-- Esta migración deja la tabla como única fuente:
--   1. Copia a `remitos` cada número de la columna vieja que la línea no tenga ya cargado.
--   2. Saca la columna del trigger de historial de la línea (los registros viejos del historial no se tocan).
--   3. Elimina la columna (y su índice único).
--   4. Agrega el historial de remitos y de sus documentos. Se crea DESPUÉS de la copia del paso 1,
--      para que el backfill no genere entradas de historial que nadie hizo.

-- 1. Backfill
INSERT INTO remitos (daily_report_row_id, remit_number, is_linked)
SELECT r.id, btrim(r.remit_number), false
FROM dailyreportrows r
WHERE r.remit_number IS NOT NULL
  AND btrim(r.remit_number) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM remitos m
    WHERE m.daily_report_row_id = r.id AND m.remit_number = btrim(r.remit_number)
  );

-- 2. Historial de la línea sin la columna vieja
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

-- 3. La columna deja de existir
ALTER TABLE dailyreportrows DROP COLUMN remit_number;

-- 4. Historial de remitos y documentos
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
