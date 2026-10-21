-- El helper acepta la columna de empresa (documents_company la llama `applies`). Reemplaza la firma de un solo argumento.
DROP FUNCTION IF EXISTS public.app_enable_tenant_isolation(regclass);

CREATE OR REPLACE FUNCTION public.app_enable_tenant_isolation(p_table regclass, p_column text DEFAULT 'company_id')
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_nullable boolean;
BEGIN
  SELECT NOT a.attnotnull INTO v_nullable
  FROM pg_attribute a
  WHERE a.attrelid = p_table AND a.attname = p_column AND NOT a.attisdropped;

  IF v_nullable IS NULL THEN
    RAISE EXCEPTION 'La tabla % no tiene columna %', p_table, p_column;
  ELSIF v_nullable THEN
    RAISE EXCEPTION 'La columna % de % admite NULL: usar la politica de catalogo mixto', p_column, p_table;
  END IF;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', p_table);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (%I = public.app_current_company_id()) WITH CHECK (%I = public.app_current_company_id())',
    p_table, p_column, p_column
  );
END
$function$;
