-- Zona horaria de las funciones.
--
-- La app se conecta con la sesion en UTC: el adaptador de Prisma para Postgres lo exige (al leer un
-- timestamptz reemplaza el offset por +00:00 y al escribir un Date manda la hora UTC sin offset).
-- La base corre en hora argentina, y las funciones que calculan con fechas (CURRENT_DATE, NOW()::date,
-- casts de timestamptz a date, date_trunc) tienen que seguir dando el dia argentino aunque las llame
-- la app. Por eso cada una fija su zona con SET TimeZone.
--
-- Un CREATE OR REPLACE que omita el SET pierde la zona: toda funcion nueva o reescrita que calcule
-- con fechas lleva `SET TimeZone = 'America/Argentina/Buenos_Aires'` en su definicion. El test
-- pgTAP prisma/tests/06_timezone.sql lo verifica. Este bloque va al final del baseline y la fija en
-- todas las existentes.
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND l.lanname IN ('plpgsql', 'sql')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND pg_get_functiondef(p.oid) ~* '\m(current_date|current_time|current_timestamp|localtime|localtimestamp|now|date|timestamp|timestamptz|interval|date_trunc|date_part|extract|to_char|to_date|to_timestamp|age|make_date|make_timestamp)\M'
  LOOP
    EXECUTE format('ALTER ROUTINE %s SET TimeZone = %L', fn, 'America/Argentina/Buenos_Aires');
  END LOOP;
END
$$;

-- Default de fecha: el dia argentino, no el de la sesion.
ALTER TABLE public.dailyreport
  ALTER COLUMN creation_date SET DEFAULT ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date);
