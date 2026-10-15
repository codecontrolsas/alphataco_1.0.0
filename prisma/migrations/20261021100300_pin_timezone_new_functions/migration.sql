-- Dos funciones creadas en 20261019100100 y 20261019100300 quedaron sin `SET TimeZone`: el test prisma/tests/06_timezone.sql
-- exige que toda función que calcula con fechas fije la zona argentina (la app se conecta con la sesión en UTC).
-- `ALTER FUNCTION ... SET` no cambia la lógica: solo fija el parámetro de la función.
ALTER FUNCTION public.reconcile_daily_report_rows_status(uuid[]) SET TimeZone = 'America/Argentina/Buenos_Aires';
ALTER FUNCTION public.set_updated_at() SET TimeZone = 'America/Argentina/Buenos_Aires';
