-- Backfill de T4 (NO se ejecuta automaticamente; lo aprueba el usuario aparte).
-- Reconcilia el estado de las lineas pendientes / sin recursos de los partes ABIERTOS segun la formula
-- unica (decision D1 opcion B: sube y baja segun recursos y flags needs_personnel / needs_equipment).
--
-- 1) Primero ver el conteo que se va a mover (solo lectura):
--      SELECT count(*) AS lineas_a_cambiar FROM (
--        SELECT r.id FROM dailyreportrows r
--        JOIN dailyreport d ON d.id = r.daily_report_id AND d.status = 'abierto'
--        JOIN service_items si ON si.id = r.item_id
--        WHERE r.status IN ('pendiente','sin_recursos_asignados')
--          AND r.status IS DISTINCT FROM CASE
--            WHEN (NOT si.needs_personnel OR EXISTS (SELECT 1 FROM dailyreportemployeerelations e WHERE e.daily_report_row_id = r.id))
--             AND (NOT si.needs_equipment OR EXISTS (SELECT 1 FROM dailyreportequipmentrelations q WHERE q.daily_report_row_id = r.id))
--            THEN 'pendiente'::daily_report_status ELSE 'sin_recursos_asignados'::daily_report_status END
--      ) t;
-- 2) Despues, correr (psql, dentro de una transaccion para revisar el resultado antes de confirmar):
--      BEGIN;
--      <el SELECT de abajo>
--      -- COMMIT; (o ROLLBACK;)
SELECT public.reconcile_daily_report_rows_status(array_agg(r.id)) AS lineas_actualizadas
FROM public.dailyreportrows r
JOIN public.dailyreport d ON d.id = r.daily_report_id
WHERE d.status = 'abierto'
  AND r.status IN ('pendiente', 'sin_recursos_asignados');
