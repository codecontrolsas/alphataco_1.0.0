-- Helper para habilitar el aislamiento por empresa en una tabla. Copia de prisma/sql/tenant.sql; no aplica a ninguna tabla todavia.
-- function app_enable_tenant_isolation: aislamiento por empresa para una tabla con `company_id uuid NOT NULL`.
-- Habilita RLS y deja la politica `tenant_isolation` (lectura y escritura solo de la empresa activa).
-- Falla si la tabla no tiene la columna o es nullable: esos casos llevan otra politica (catalogos mixtos, herencia).
-- El duenio de la tabla y alphataco_system (BYPASSRLS) no pasan por la politica; alphataco_app si.
CREATE OR REPLACE FUNCTION public.app_enable_tenant_isolation(p_table regclass)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_nullable boolean;
BEGIN
  SELECT NOT a.attnotnull INTO v_nullable
  FROM pg_attribute a
  WHERE a.attrelid = p_table AND a.attname = 'company_id' AND NOT a.attisdropped;

  IF v_nullable IS NULL THEN
    RAISE EXCEPTION 'La tabla % no tiene columna company_id', p_table;
  ELSIF v_nullable THEN
    RAISE EXCEPTION 'La columna company_id de % admite NULL: usar la politica de catalogo mixto', p_table;
  END IF;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', p_table);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (company_id = public.app_current_company_id()) WITH CHECK (company_id = public.app_current_company_id())',
    p_table
  );
END
$function$;
