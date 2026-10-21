-- La empresa de cada fila se completa sola desde el contexto de la transaccion (`app.company_id`, la empresa activa
-- del usuario que hace la peticion): ninguna peticion tiene que enviarla. Si no hay contexto el valor es NULL y la
-- base lo rechaza (NOT NULL) en vez de guardar una fila huerfana. Un valor explicito sigue funcionando; en las tablas
-- con RLS la politica exige que coincida con la empresa activa.

-- 1) Valor por defecto dinamico en TODA columna `company_id uuid` de las tablas de public (y `documents_company.applies`).
--    Reemplaza ademas los defaults `gen_random_uuid()` que tenian algunas (generaban un uuid de empresa inexistente).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'company_id' AND c.udt_name = 'uuid'
      AND c.table_name <> 'jobs_runs'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET DEFAULT public.app_current_company_id()', r.table_name);
  END LOOP;

  ALTER TABLE public.documents_company ALTER COLUMN applies SET DEFAULT public.app_current_company_id();
END
$$;

-- 2) Las tablas donde `company_id` admitia NULL por un defecto del sistema base pasan a NOT NULL.
--    (`equipment_owners` queda nullable: sus filas globales son un catalogo compartido a proposito, como marcas y tipos.)
--    Las filas sin empresa se completan solo cuando no hay ambiguedad (la instancia tiene una unica empresa). Si
--    quedan filas sin empresa la columna sigue nullable y se avisa: hay que completarlas a mano y repetir el
--    ALTER (no se falla la migracion para no dejar `migrate deploy` bloqueado).
DO $$
DECLARE
  t text;
  v_companies int;
  v_null bigint;
BEGIN
  SELECT count(*) INTO v_companies FROM public.company;

  FOREACH t IN ARRAY ARRAY[
    'companies_employees', 'contacts', 'customer_services',
    'employees', 'vehicles', 'preparte', 'share_company_users'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id IS NULL', t) INTO v_null;

    IF v_null > 0 AND v_companies = 1 THEN
      EXECUTE format('UPDATE public.%I SET company_id = (SELECT id FROM public.company) WHERE company_id IS NULL', t);
      v_null := 0;
    END IF;

    IF v_null = 0 THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);
    ELSE
      RAISE WARNING 'La tabla % tiene % filas sin company_id y % empresas: queda nullable hasta completarlas', t, v_null, v_companies;
    END IF;
  END LOOP;
END
$$;
