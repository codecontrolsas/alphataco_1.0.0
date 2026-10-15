Rollback de `20261020100000_deviations_single_pass`: restaura la versión anterior de `get_daily_report_deviations(uuid, date)` (rollback.sql) y elimina la sobrecarga de 3 argumentos:

    DROP FUNCTION public.get_daily_report_deviations(uuid, date, boolean);

(Ejecutar el DROP DESPUÉS de restaurar la de 2 argumentos: la nueva de 2 args delega en la de 3.)
