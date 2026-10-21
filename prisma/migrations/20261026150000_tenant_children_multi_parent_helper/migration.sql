-- Helper para hijas con varias claves foraneas opcionales. Copia de prisma/sql/tenant.sql; no aplica a ninguna tabla todavia.

-- function app_add_company_id_from_parents: igual que app_add_company_id_from_parent pero para hijas con VARIAS claves
-- foraneas opcionales (p. ej. dailyreportrows: parte, cliente o pedido). La empresa sale del primer padre que exista,
-- en el orden dado. Si ninguna fila padre responde, la columna queda nullable y sin RLS (aviso).
CREATE OR REPLACE FUNCTION public.app_add_company_id_from_parents(
  p_child regclass,
  p_fks text[],
  p_parents regclass[]
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_name text;
  v_nulls bigint;
  v_fn text;
  v_i int;
  v_backfill text := '';
  v_lookup text := '';
BEGIN
  SELECT relname INTO v_name FROM pg_class WHERE oid = p_child;
  v_fn := 'trg_' || left(v_name, 40) || '_company_from_parent';

  EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS company_id uuid', p_child);

  FOR v_i IN 1 .. array_length(p_fks, 1) LOOP
    EXECUTE format(
      'UPDATE %s c SET company_id = p.company_id FROM %s p WHERE c.%I = p.id AND c.company_id IS NULL',
      p_child, p_parents[v_i], p_fks[v_i]
    );
    v_lookup := v_lookup || format(
      'IF v_company IS NULL AND NEW.%I IS NOT NULL THEN SELECT company_id INTO v_company FROM %s WHERE id = NEW.%I; END IF; ',
      p_fks[v_i], p_parents[v_i], p_fks[v_i]
    );
  END LOOP;

  EXECUTE format('ALTER TABLE %s ALTER COLUMN company_id SET DEFAULT public.app_current_company_id()', p_child);
  EXECUTE format('SELECT count(*) FROM %s WHERE company_id IS NULL', p_child) INTO v_nulls;
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (company_id)', 'idx_' || left(v_name, 50) || '_company_id', p_child);

  EXECUTE format(
    $f$CREATE OR REPLACE FUNCTION public.%I() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $b$
       DECLARE v_company uuid;
       BEGIN
         %s
         IF v_company IS NOT NULL THEN NEW.company_id := v_company; END IF;
         RETURN NEW;
       END $b$$f$,
    v_fn, v_lookup
  );
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', v_fn, p_child);
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.%I()',
    v_fn, p_child, v_fn
  );

  IF v_nulls = 0 THEN
    EXECUTE format('ALTER TABLE %s ALTER COLUMN company_id SET NOT NULL', p_child);
    PERFORM public.app_enable_tenant_isolation(p_child);
  ELSE
    RAISE WARNING 'La tabla % tiene % filas sin padre (company_id NULL): queda nullable y sin RLS hasta completarlas', p_child, v_nulls;
  END IF;
END
$function$;
