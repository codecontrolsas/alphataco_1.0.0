-- Las unidades de medida son POR EMPRESA (como el resto de los catalogos): company_id obligatorio, completado por la base
-- desde la empresa activa, y aislamiento por empresa. Las filas existentes pasan a la empresa unica de la instancia; con
-- varias empresas la tabla queda como estaba y se avisa (hay que repartirlas a mano).
ALTER TABLE public.measure_units ADD COLUMN IF NOT EXISTS company_id uuid;

DO $$
DECLARE
  v_companies int;
  v_nulls bigint;
BEGIN
  SELECT count(*) INTO v_companies FROM public.company;
  SELECT count(*) INTO v_nulls FROM public.measure_units WHERE company_id IS NULL;

  IF v_nulls > 0 AND v_companies = 1 THEN
    UPDATE public.measure_units SET company_id = (SELECT id FROM public.company) WHERE company_id IS NULL;
    v_nulls := 0;
  END IF;

  ALTER TABLE public.measure_units ALTER COLUMN company_id SET DEFAULT public.app_current_company_id();
  CREATE INDEX IF NOT EXISTS idx_measure_units_company_id ON public.measure_units (company_id);

  IF v_nulls = 0 THEN
    ALTER TABLE public.measure_units ALTER COLUMN company_id SET NOT NULL;
    PERFORM public.app_enable_tenant_isolation('public.measure_units'::regclass);
  ELSE
    RAISE WARNING 'measure_units tiene % filas sin company_id y % empresas: queda nullable y sin RLS hasta repartirlas', v_nulls, v_companies;
  END IF;
END
$$;
