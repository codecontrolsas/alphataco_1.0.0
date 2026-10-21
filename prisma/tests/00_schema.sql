-- Smoke test de schema: confirma que el baseline + migraciones dejan la BD
-- en el estado esperado (funciones, vista, columnas, y sin rastro de Supabase).
BEGIN;

SELECT plan(15);

-- Funciones de permisos y del dominio (existencia, sin importar firma)
SELECT has_function('public', 'user_has_permission', 'existe user_has_permission');
SELECT has_function(
  'public',
  'controlar_alertas_documentos_single_employee',
  'existe controlar_alertas_documentos_single_employee'
);
SELECT has_function('public', 'app_current_user_id', 'existe app_current_user_id');
SELECT has_function('public', 'marcar_prepartes_vencidos', 'existe marcar_prepartes_vencidos');
-- P5: el bucle de empresas se mudo al job `/api/jobs/daily-indicators`; la funcion recibe
-- una empresa y la que recorria todas se borro.
SELECT has_function(
  'public',
  'run_daily_indicators_for_company',
  ARRAY['uuid'],
  'existe run_daily_indicators_for_company(uuid)'
);
SELECT hasnt_function(
  'public',
  'run_daily_indicators_for_all_companies',
  'ya no existe run_daily_indicators_for_all_companies (la reemplazo el job de P5)'
);

-- Vista eliminada: una vista corre con los permisos de su dueno y se saltearia el RLS
SELECT hasnt_view(
  'public',
  'equipments_with_pending_deviations',
  'ya no existe la vista equipments_with_pending_deviations'
);

-- Columna company_id en maintenance_orders (multi-empresa)
SELECT has_column('maintenance_orders', 'company_id', 'maintenance_orders tiene company_id');
SELECT col_not_null('maintenance_orders', 'company_id', 'maintenance_orders.company_id es NOT NULL');

-- P5: bitacora/candado de los jobs y destinatarios por empresa
SELECT has_table('public', 'jobs_runs', 'existe la tabla jobs_runs');
-- La unique es el candado de idempotencia: sin ella un job podria mandar el correo dos veces.
SELECT has_index(
  'public', 'jobs_runs', 'jobs_runs_job_run_key_key', ARRAY['job', 'run_key'],
  'jobs_runs tiene un indice sobre (job, run_key)'
);
SELECT ok(
  (SELECT indisunique FROM pg_index WHERE indexrelid = 'public.jobs_runs_job_run_key_key'::regclass),
  'el indice (job, run_key) es UNIQUE: es el candado de idempotencia de los jobs'
);
SELECT has_table('public', 'notification_settings', 'existe la tabla notification_settings');

-- Sin rastro de Supabase: no hay schema auth ni storage
SELECT hasnt_schema('auth', 'no existe el schema auth (Supabase)');
SELECT hasnt_schema('storage', 'no existe el schema storage (Supabase)');

SELECT * FROM finish();

ROLLBACK;
