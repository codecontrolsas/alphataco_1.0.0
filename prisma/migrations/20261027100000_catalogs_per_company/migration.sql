-- Los catalogos de tipos de documento, marcas, tipos y subtipos de equipo, propietarios y sindicatos son POR EMPRESA:
-- cada empresa tiene los suyos, no hay filas globales ni compartidas. `company_id` pasa a NOT NULL y las tablas dejan
-- la politica de catalogo mixto por el aislamiento por empresa de siempre.
--
-- Las filas que hoy tengan `company_id` NULL se asignan a la empresa unica de la instancia (una instancia con una sola
-- empresa no tiene ambiguedad). Si la instancia tiene varias empresas y quedan filas sin empresa, la tabla se deja
-- como esta y se avisa: hay que repartirlas a mano (copias por empresa) y repetir el ALTER; no se falla la migracion
-- para no dejar `migrate deploy` bloqueado.
DO $$
DECLARE
  t text;
  v_companies int;
  v_nulls bigint;
BEGIN
  SELECT count(*) INTO v_companies FROM public.company;

  FOREACH t IN ARRAY ARRAY['brand_vehicles', 'document_types', 'guild', 'sub_type', 'type', 'equipment_owners']
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id IS NULL', t) INTO v_nulls;

    IF v_nulls > 0 AND v_companies = 1 THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t);
      EXECUTE format('UPDATE public.%I SET company_id = (SELECT id FROM public.company) WHERE company_id IS NULL', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t);
      v_nulls := 0;
    END IF;

    IF v_nulls = 0 THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_catalog_read ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_catalog_insert ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_catalog_update ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_catalog_delete ON public.%I', t);
      PERFORM public.app_enable_tenant_isolation(format('public.%I', t)::regclass);
    ELSE
      RAISE WARNING 'La tabla % tiene % filas sin company_id y % empresas: queda como catalogo mixto hasta repartirlas', t, v_nulls, v_companies;
    END IF;
  END LOOP;
END
$$;

-- Ya no hay catalogos mixtos: el helper queda sin uso.
DROP FUNCTION IF EXISTS public.app_enable_tenant_catalog(regclass);
