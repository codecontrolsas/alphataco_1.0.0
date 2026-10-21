-- Historiales, categorias y registros de acceso: company_id derivado del padre (default, NOT NULL si no quedan
-- huerfanas, indice, trigger SECURITY DEFINER y RLS). Mas la baja de tablas sin uso.

SELECT public.app_add_company_id_from_parent('public.dailyreportrows_history', 'daily_report_row_id', 'public.dailyreportrows');
SELECT public.app_add_company_id_from_parent('public.documents_employees_logs', 'documents_employees_id', 'public.documents_employees');
SELECT public.app_add_company_id_from_parent('public.documents_equipment_logs', 'documents_equipment_id', 'public.documents_equipment');
SELECT public.app_add_company_id_from_parent('public.category', 'covenant_id', 'public.covenant');
SELECT public.app_add_company_id_from_parent('public.category_employee', 'emplyee_id', 'public.employees');
SELECT public.app_add_company_id_from_parent('public.external_api_access_logs', 'external_api_client_id', 'public.external_api_clients');

-- Sin filas ni consumidores (verificado: ninguna consulta del codigo las referencia).
DROP TABLE IF EXISTS public.contractors;
DROP TABLE IF EXISTS public._bak_documents_empty_20261019;
DROP TABLE IF EXISTS public._bak_documents_empty_logs_20261019;
