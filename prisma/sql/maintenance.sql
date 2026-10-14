-- Generado por scripts/sql/extract-sql-objects.ts — editar a mano SOLO en la revisión de Task 4
-- Dominio: maintenance — 11 objeto(s)
-- Revisado a mano en la Task 4 (P1): actor por app.user_id y company_id en el log de actividad.

-- ============================================================================
-- FUNCTIONS (4)
-- ============================================================================

-- function log_maintenance_order_activity (origen: prisma/migrations/20260901180000_fix_date_confirmed_activity_label/migration.sql)
CREATE OR REPLACE FUNCTION public.log_maintenance_order_activity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  -- Task 4: actor de la transaccion (SET LOCAL app.user_id, helper withActor) en lugar del uid del JWT
  v_actor uuid := public.app_current_user_id();
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO maintenance_activity_log (
      company_id,              -- Task 4: NOT NULL, heredado del pedido
      maintenance_order_id,
      maintenance_request_id,  -- NUEVO: También guardar la solicitud vinculada
      action_type,
      performed_by,
      previous_status,
      new_status,
      notes,
      rejection_reason,
      metadata
    ) VALUES (
      NEW.company_id,
      NEW.id,
      NEW.maintenance_request_id,  -- NUEVO: Incluir el ID de la solicitud
      -- action_type
      CASE NEW.status
        WHEN 'pending_scheduling' THEN
          CASE WHEN TG_OP = 'INSERT' THEN 'created'
               WHEN OLD.status = 'scheduled' THEN 'date_rejected'
               ELSE 'status_changed'
          END
        WHEN 'scheduled' THEN 'scheduled'
        WHEN 'date_confirmed' THEN 'date_confirmed'
        WHEN 'in_workshop' THEN 'workshop_entry'
        WHEN 'completed' THEN 'completed'
        WHEN 'rejected' THEN 'rejected'
        ELSE 'status_changed'
      END,
      -- performed_by
      COALESCE(
        CASE NEW.status
          WHEN 'pending_scheduling' THEN
            CASE WHEN TG_OP = 'INSERT' THEN v_actor
                 WHEN OLD.status = 'scheduled' THEN NEW.date_rejected_by
                 ELSE v_actor
            END
          WHEN 'scheduled' THEN NEW.scheduled_by
          WHEN 'date_confirmed' THEN NEW.date_approved_by
          WHEN 'in_workshop' THEN NEW.workshop_approved_by
          WHEN 'completed' THEN v_actor
          WHEN 'rejected' THEN NEW.rejected_by
          ELSE v_actor
        END,
        v_actor
      ),
      -- previous_status
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      -- new_status
      NEW.status,
      -- notes
      CASE NEW.status
        WHEN 'pending_scheduling' THEN
          CASE WHEN TG_OP = 'INSERT' THEN 'Pedido creado'
               WHEN OLD.status = 'scheduled' THEN 'Fecha rechazada - requiere reprogramación'
               ELSE 'Cambio de estado'
          END
        WHEN 'scheduled' THEN 'Fecha programada'
        WHEN 'date_confirmed' THEN 'Fecha confirmada por taller'
        WHEN 'in_workshop' THEN 'Equipo ingresado al taller'
        WHEN 'completed' THEN 'Pedido completado'
        WHEN 'rejected' THEN 'Pedido rechazado'
        ELSE 'Cambio de estado'
      END,
      -- rejection_reason
      CASE 
        WHEN NEW.status = 'pending_scheduling' AND OLD.status = 'scheduled' 
          THEN NEW.date_rejection_reason
        WHEN NEW.status = 'rejected' 
          THEN NEW.rejection_reason
        ELSE NULL 
      END,
      -- metadata
      CASE NEW.status
        WHEN 'pending_scheduling' THEN
          CASE WHEN TG_OP = 'INSERT' THEN
            jsonb_build_object(
              'source', NEW.source,
              'equipment_id', NEW.equipment_id,
              'maintenance_request_id', NEW.maintenance_request_id
            )
          WHEN OLD.status = 'scheduled' THEN
            jsonb_build_object(
              'date_rejected_by', NEW.date_rejected_by,
              'date_rejected_at', NEW.date_rejected_at,
              'previous_scheduled_date', OLD.scheduled_date
            )
          ELSE '{}'::jsonb
          END
        WHEN 'scheduled' THEN
          jsonb_build_object(
            'scheduled_date', NEW.scheduled_date,
            'scheduled_by', NEW.scheduled_by,
            'scheduled_at', NEW.scheduled_at
          )
        WHEN 'date_confirmed' THEN
          jsonb_build_object(
            'scheduled_date', NEW.scheduled_date,
            'date_approved_by', NEW.date_approved_by,
            'date_approved_at', NEW.date_approved_at
          )
        WHEN 'in_workshop' THEN
          jsonb_build_object(
            'workshop_entry_date', NEW.workshop_entry_date,
            'workshop_approved_by', NEW.workshop_approved_by,
            'kilometer_at_entry', NEW.kilometer_at_entry
          )
        WHEN 'completed' THEN
          jsonb_build_object(
            'completed_at', NOW(),
            'total_duration_days', EXTRACT(DAY FROM (NOW() - NEW.created_at))
          )
        WHEN 'rejected' THEN
          jsonb_build_object(
            'rejected_by', NEW.rejected_by,
            'rejected_at', NEW.rejected_at,
            'rejection_reason', NEW.rejection_reason
          )
        ELSE 
          jsonb_build_object(
            'scheduled_date', NEW.scheduled_date,
            'kilometer_at_entry', NEW.kilometer_at_entry
          )
      END
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- function log_work_order_activity (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.log_work_order_activity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  -- Task 4: actor de la transaccion (SET LOCAL app.user_id, helper withActor) en lugar del uid del JWT
  v_actor uuid := public.app_current_user_id();
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO maintenance_activity_log (
      company_id,  -- Task 4: NOT NULL, heredado de la orden de trabajo
      work_order_id,
      action_type,
      performed_by,
      previous_status,
      new_status,
      notes,
      rejection_reason,
      metadata
    ) VALUES (
      NEW.company_id,
      NEW.id,
      -- action_type
      CASE NEW.status
        WHEN 'pending' THEN
          CASE WHEN TG_OP = 'INSERT' THEN 'work_order_created'
               ELSE 'status_changed'
          END
        WHEN 'in_progress' THEN
          CASE WHEN OLD.status = 'paused' THEN 'resumed'
               ELSE 'started'
          END
        WHEN 'paused' THEN 'paused'
        WHEN 'completed' THEN 'completed'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE 'status_changed'
      END,
      -- performed_by
      COALESCE(
        CASE NEW.status
          WHEN 'pending' THEN NEW.created_by
          WHEN 'in_progress' THEN 
            CASE WHEN OLD.status = 'paused' THEN v_actor  -- resumed
                 ELSE NEW.started_by
            END
          WHEN 'paused' THEN NEW.paused_by
          WHEN 'completed' THEN NEW.completed_by
          WHEN 'cancelled' THEN NEW.cancelled_by
          ELSE v_actor
        END,
        v_actor
      ),
      -- previous_status
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status::text END,
      -- new_status
      NEW.status::text,
      -- notes
      CASE NEW.status
        WHEN 'pending' THEN
          CASE WHEN TG_OP = 'INSERT' THEN 'Orden de trabajo creada'
               ELSE 'Cambio de estado'
          END
        WHEN 'in_progress' THEN
          CASE WHEN OLD.status = 'paused' THEN 'Trabajo reanudado'
               ELSE 'Trabajo iniciado'
          END
        WHEN 'paused' THEN COALESCE('Trabajo pausado: ' || NEW.pause_reason, 'Trabajo pausado')
        WHEN 'completed' THEN 'Orden de trabajo completada'
        WHEN 'cancelled' THEN 'Orden de trabajo cancelada'
        ELSE 'Cambio de estado'
      END,
      -- rejection_reason (usamos para cancellation_reason)
      CASE WHEN NEW.status = 'cancelled' THEN NEW.cancellation_reason ELSE NULL END,
      -- metadata
      CASE NEW.status
        WHEN 'pending' THEN
          jsonb_build_object(
            'order_number', NEW.order_number,
            'equipment_id', NEW.equipment_id,
            'workshop_id', NEW.workshop_id,
            'sector_id', NEW.sector_id,
            'priority', NEW.priority,
            'planned_start_date', NEW.planned_start_date,
            'planned_end_date', NEW.planned_end_date
          )
        WHEN 'in_progress' THEN
          jsonb_build_object(
            'started_by', NEW.started_by,
            'started_at', NEW.started_at,
            'actual_start_date', NEW.actual_start_date
          )
        WHEN 'paused' THEN
          jsonb_build_object(
            'paused_by', NEW.paused_by,
            'paused_at', NEW.paused_at,
            'pause_reason', NEW.pause_reason,
            'total_paused_time', NEW.total_paused_time
          )
        WHEN 'completed' THEN
          jsonb_build_object(
            'completed_by', NEW.completed_by,
            'completed_at', NEW.completed_at,
            'actual_end_date', NEW.actual_end_date,
            'total_paused_time', NEW.total_paused_time
          )
        WHEN 'cancelled' THEN
          jsonb_build_object(
            'cancelled_by', NEW.cancelled_by,
            'cancelled_at', NEW.cancelled_at,
            'cancellation_reason', NEW.cancellation_reason
          )
        ELSE '{}'::jsonb
      END
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- function update_work_order_item_repairs_updated_at (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.update_work_order_item_repairs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- function update_work_orders_updated_at (origen: supabase/migrations/20260202113926_fixing-maintenance-flow.sql)
CREATE OR REPLACE FUNCTION public.update_work_orders_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- ============================================================================
-- TRIGGERS (9)
-- ============================================================================

-- trigger trigger_log_maintenance_order_activity_insert ON maintenance_orders (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS trigger_log_maintenance_order_activity_insert ON public.maintenance_orders;
CREATE TRIGGER trigger_log_maintenance_order_activity_insert AFTER INSERT ON public.maintenance_orders FOR EACH ROW EXECUTE FUNCTION public.log_maintenance_order_activity();

-- trigger trigger_log_maintenance_order_activity_update ON maintenance_orders (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS trigger_log_maintenance_order_activity_update ON public.maintenance_orders;
CREATE TRIGGER trigger_log_maintenance_order_activity_update AFTER UPDATE OF status ON public.maintenance_orders FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.log_maintenance_order_activity();

-- trigger update_maintenance_orders_updated_at ON maintenance_orders (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS update_maintenance_orders_updated_at ON public.maintenance_orders;
CREATE TRIGGER update_maintenance_orders_updated_at BEFORE UPDATE ON public.maintenance_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- trigger update_maintenance_requests_updated_at ON maintenance_requests (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS update_maintenance_requests_updated_at ON public.maintenance_requests;
CREATE TRIGGER update_maintenance_requests_updated_at BEFORE UPDATE ON public.maintenance_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- trigger trigger_update_work_order_item_repairs_updated_at ON work_order_item_repairs (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS trigger_update_work_order_item_repairs_updated_at ON public.work_order_item_repairs;
CREATE TRIGGER trigger_update_work_order_item_repairs_updated_at BEFORE UPDATE ON public.work_order_item_repairs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- trigger trigger_work_order_items_updated_at ON work_order_items (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS trigger_work_order_items_updated_at ON public.work_order_items;
CREATE TRIGGER trigger_work_order_items_updated_at BEFORE UPDATE ON public.work_order_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- trigger trigger_log_work_order_activity_insert ON work_orders (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS trigger_log_work_order_activity_insert ON public.work_orders;
CREATE TRIGGER trigger_log_work_order_activity_insert AFTER INSERT ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.log_work_order_activity();

-- trigger trigger_log_work_order_activity_update ON work_orders (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS trigger_log_work_order_activity_update ON public.work_orders;
CREATE TRIGGER trigger_log_work_order_activity_update AFTER UPDATE OF status ON public.work_orders FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.log_work_order_activity();

-- trigger trigger_work_orders_updated_at ON work_orders (origen: prisma/migrations/20261019100100_narrow_trigger_guards)
DROP TRIGGER IF EXISTS trigger_work_orders_updated_at ON public.work_orders;
CREATE TRIGGER trigger_work_orders_updated_at BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
