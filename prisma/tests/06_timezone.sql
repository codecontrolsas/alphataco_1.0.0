-- Zona horaria: la app se conecta con la sesion en UTC (el adaptador de Prisma lo exige) y la base
-- corre en hora argentina. Toda funcion que calcula con fechas tiene que fijar su zona para que
-- "hoy" (CURRENT_DATE, NOW()::date, casts de fecha) siga siendo el dia argentino aunque la llame la app.
-- Un CREATE OR REPLACE que omita el SET TimeZone lo pierde: este test lo detecta.
BEGIN;

SELECT plan(3);

CREATE TEMP VIEW time_functions AS
SELECT p.oid, p.proname, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.prokind IN ('f', 'p')
  AND l.lanname IN ('plpgsql', 'sql')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  AND pg_get_functiondef(p.oid) ~* '\m(current_date|current_time|current_timestamp|localtime|localtimestamp|now|date|timestamp|timestamptz|interval|date_trunc|date_part|extract|to_char|to_date|to_timestamp|age|make_date|make_timestamp)\M';

SELECT ok((SELECT count(*) FROM time_functions) > 20, 'hay funciones que calculan con fechas');

SELECT is(
  (SELECT string_agg(proname, ', ' ORDER BY proname) FROM time_functions
    WHERE NOT ('TimeZone=America/Argentina/Buenos_Aires' = ANY (COALESCE(proconfig, ARRAY[]::text[])))),
  NULL,
  'toda funcion que calcula con fechas fija TimeZone = America/Argentina/Buenos_Aires'
);

-- Con la sesion en UTC a las 01:30 (22:30 del dia anterior en Argentina), una funcion fijada da el dia argentino.
SET LOCAL TimeZone = 'UTC';
CREATE FUNCTION pg_temp.ar_today_probe() RETURNS date LANGUAGE sql
  SET TimeZone = 'America/Argentina/Buenos_Aires'
  AS $$ SELECT ('2026-10-11 01:30:00+00'::timestamptz)::date $$;
SELECT is(pg_temp.ar_today_probe(), '2026-10-10'::date, 'una funcion fijada calcula el dia argentino con la sesion en UTC');

SELECT * FROM finish();
ROLLBACK;
