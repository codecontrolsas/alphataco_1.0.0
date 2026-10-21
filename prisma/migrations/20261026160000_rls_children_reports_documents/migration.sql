-- Lote L5 (partes diarios, remitos y documentos): company_id derivado del padre, con la misma mecanica que el resto de
-- las hijas (default, NOT NULL si no quedan filas huerfanas, indice, trigger SECURITY DEFINER y RLS). Las tablas de
-- historial/log (dailyreportrows_history, documents_*_logs) quedan para un paso aparte: son las mas grandes y su
-- backfill conviene medirlo antes en cada instancia.

SELECT public.app_add_company_id_from_parents('public.dailyreportrows',
  ARRAY['daily_report_id', 'customer_id', 'preparte_id'],
  ARRAY['public.dailyreport', 'public.customers', 'public.preparte']::regclass[]);

SELECT public.app_add_company_id_from_parents('public.dailyreportemployeerelations',
  ARRAY['daily_report_row_id', 'employee_id'], ARRAY['public.dailyreportrows', 'public.employees']::regclass[]);

SELECT public.app_add_company_id_from_parents('public.dailyreportequipmentrelations',
  ARRAY['daily_report_row_id', 'equipment_id', 'other_equipment_id'],
  ARRAY['public.dailyreportrows', 'public.vehicles', 'public.other_equipment']::regclass[]);

SELECT public.app_add_company_id_from_parent('public.dailyreport_customer_equipment_relations', 'daily_report_row_id', 'public.dailyreportrows');
SELECT public.app_add_company_id_from_parent('public.remitos', 'daily_report_row_id', 'public.dailyreportrows');
SELECT public.app_add_company_id_from_parent('public.remito_documents', 'remit_id', 'public.remitos');

SELECT public.app_add_company_id_from_parent('public.documents_employees', 'applies', 'public.employees');
SELECT public.app_add_company_id_from_parent('public.documents_equipment', 'applies', 'public.vehicles');
