-- Helper para tablas hijas: company_id derivado del padre. Copia de prisma/sql/tenant.sql; no aplica a ninguna tabla todavia.
-- function app_add_company_id_from_parent: agrega `company_id` a una tabla hija y lo deriva del padre.
--   1. columna `company_id uuid` + backfill desde el padre (por la FK indicada)
--   2. DEFAULT app_current_company_id() (empresa activa) y NOT NULL si no quedan filas sin empresa
--   3. indice por empresa
--   4. trigger BEFORE INSERT/UPDATE (SECURITY DEFINER: ve el padre aunque la RLS se lo oculte al usuario) que fija
--      company_id con el de la fila padre: la empresa del hijo SIEMPRE es la del padre, aunque el contexto sea otro o no
--      haya (jobs y triggers siguen funcionando) y la politica rechaza un hijo atado a un padre de otra empresa
--   5. aislamiento por empresa (RLS) si la columna quedo NOT NULL
-- Si el padre no tiene `company_id` todavia, primero hay que llamarla para el padre.
CREATE OR REPLACE FUNCTION public.app_add_company_id_from_parent(
  p_child regclass,
  p_fk text,
  p_parent regclass,
  p_parent_key text DEFAULT 'id'
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_name text;
  v_nulls bigint;
  v_fn text;
BEGIN
  SELECT relname INTO v_name FROM pg_class WHERE oid = p_child;
  v_fn := 'trg_' || left(v_name, 40) || '_company_from_parent';

  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS company_id uuid', p_child);
  EXECUTE format(
    'UPDATE %s c SET company_id = p.company_id FROM %s p WHERE c.%I = p.%I AND c.company_id IS NULL',
    p_child, p_parent, p_fk, p_parent_key
  );
  EXECUTE format('ALTER TABLE %s ALTER COLUMN company_id SET DEFAULT public.app_current_company_id()', p_child);
  EXECUTE format('SELECT count(*) FROM %s WHERE company_id IS NULL', p_child) INTO v_nulls;
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (company_id)', 'idx_' || left(v_name, 50) || '_company_id', p_child);

  EXECUTE format(
    $f$CREATE OR REPLACE FUNCTION public.%I() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $b$
       DECLARE v_company uuid;
       BEGIN
         SELECT company_id INTO v_company FROM %s WHERE %I = NEW.%I;
         IF v_company IS NOT NULL THEN NEW.company_id := v_company; END IF;
         RETURN NEW;
       END $b$$f$,
    v_fn, p_parent, p_parent_key, p_fk
  );
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', v_fn, p_child);
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, company_id ON %s FOR EACH ROW EXECUTE FUNCTION public.%I()',
    v_fn, p_fk, p_child, v_fn
  );

  IF v_nulls = 0 THEN
    EXECUTE format('ALTER TABLE %s ALTER COLUMN company_id SET NOT NULL', p_child);
    PERFORM public.app_enable_tenant_isolation(p_child);
  ELSE
    RAISE WARNING 'La tabla % tiene % filas sin padre (company_id NULL): queda nullable y sin RLS hasta completarlas', p_child, v_nulls;
  END IF;
END
$function$;
