-- Piloto de casos de uso del parte diario: version por linea (baseVersion), unicidad de las pivotes de recursos
-- (altas idempotentes) y tabla processed_commands (idempotencia por commandId).

-- 1. Version de la linea: sube con cualquier UPDATE que cambie algo (bulk, certificacion, clonado, reconcile, jobs).
--    Corre despues del trigger de historial (orden alfabetico) y `version` no entra en sus campos cambiados.
ALTER TABLE public.dailyreportrows ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.dailyreportrows_bump_version()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_dailyreportrows_version ON public.dailyreportrows;
CREATE TRIGGER trg_dailyreportrows_version
  BEFORE UPDATE ON public.dailyreportrows
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.dailyreportrows_bump_version();

-- 2. Pivotes de recursos: sin duplicados y con unicidad. El borrado de repetidos va con los triggers de historial
--    apagados para no registrar bajas falsas.
ALTER TABLE public.dailyreportemployeerelations DISABLE TRIGGER tr_dailyreport_employee_relations_history;
ALTER TABLE public.dailyreportequipmentrelations DISABLE TRIGGER tr_dailyreport_equipment_relations_history;
ALTER TABLE public.dailyreport_customer_equipment_relations DISABLE TRIGGER tr_dailyreport_customer_equipment_relations_history;

DELETE FROM public.dailyreportemployeerelations a USING public.dailyreportemployeerelations b
 WHERE a.ctid > b.ctid AND a.daily_report_row_id = b.daily_report_row_id AND a.employee_id = b.employee_id;
DELETE FROM public.dailyreportequipmentrelations a USING public.dailyreportequipmentrelations b
 WHERE a.ctid > b.ctid AND a.daily_report_row_id = b.daily_report_row_id AND a.equipment_id = b.equipment_id;
DELETE FROM public.dailyreportequipmentrelations a USING public.dailyreportequipmentrelations b
 WHERE a.ctid > b.ctid AND a.daily_report_row_id = b.daily_report_row_id AND a.other_equipment_id = b.other_equipment_id;
DELETE FROM public.dailyreport_customer_equipment_relations a USING public.dailyreport_customer_equipment_relations b
 WHERE a.ctid > b.ctid AND a.daily_report_row_id = b.daily_report_row_id AND a.customer_equipment_id = b.customer_equipment_id;

ALTER TABLE public.dailyreportemployeerelations ENABLE TRIGGER tr_dailyreport_employee_relations_history;
ALTER TABLE public.dailyreportequipmentrelations ENABLE TRIGGER tr_dailyreport_equipment_relations_history;
ALTER TABLE public.dailyreport_customer_equipment_relations ENABLE TRIGGER tr_dailyreport_customer_equipment_relations_history;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dr_employee_rel_row_employee
  ON public.dailyreportemployeerelations (daily_report_row_id, employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dr_equipment_rel_row_equipment
  ON public.dailyreportequipmentrelations (daily_report_row_id, equipment_id) WHERE equipment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_dr_equipment_rel_row_other_equipment
  ON public.dailyreportequipmentrelations (daily_report_row_id, other_equipment_id) WHERE other_equipment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_dr_customer_equipment_rel_row_equipment
  ON public.dailyreport_customer_equipment_relations (daily_report_row_id, customer_equipment_id);

-- 3. Comandos procesados: la clave es (empresa, commandId); el resultado se guarda en la misma transaccion que el efecto.
CREATE TABLE IF NOT EXISTS public.processed_commands (
  company_id    uuid        NOT NULL DEFAULT public.app_current_company_id(),
  command_id    uuid        NOT NULL,
  command_type  text        NOT NULL,
  payload_hash  text        NOT NULL,
  actor_user_id uuid,
  entity_id     uuid,
  result        jsonb,
  captured_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, command_id)
);
CREATE INDEX IF NOT EXISTS idx_processed_commands_company_id ON public.processed_commands (company_id);
CREATE INDEX IF NOT EXISTS idx_processed_commands_created_at ON public.processed_commands (created_at);
SELECT public.app_enable_tenant_isolation('public.processed_commands');
