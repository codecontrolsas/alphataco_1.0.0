-- Helper para catalogos mixtos (company_id nullable). Copia de prisma/sql/tenant.sql; no aplica a ninguna tabla todavia.
-- function app_enable_tenant_catalog: catalogo mixto (`company_id` nullable; NULL = fila global compartida).
-- Todas las empresas LEEN las globales y las propias; solo se ESCRIBEN las propias. Las globales las gestiona
-- alphataco_system (BYPASSRLS) o el duenio de la tabla. Ver D3 en docs/arquitectura/LOOP-ESTADO.md.
CREATE OR REPLACE FUNCTION public.app_enable_tenant_catalog(p_table regclass)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = p_table AND a.attname = 'company_id' AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'La tabla % no tiene columna company_id', p_table;
  END IF;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_catalog_read ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_catalog_insert ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_catalog_update ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_catalog_delete ON %s', p_table);
  EXECUTE format(
    'CREATE POLICY tenant_catalog_read ON %s FOR SELECT USING (company_id IS NULL OR company_id = public.app_current_company_id())',
    p_table
  );
  EXECUTE format(
    'CREATE POLICY tenant_catalog_insert ON %s FOR INSERT WITH CHECK (company_id = public.app_current_company_id())',
    p_table
  );
  EXECUTE format(
    'CREATE POLICY tenant_catalog_update ON %s FOR UPDATE USING (company_id = public.app_current_company_id()) WITH CHECK (company_id = public.app_current_company_id())',
    p_table
  );
  EXECUTE format(
    'CREATE POLICY tenant_catalog_delete ON %s FOR DELETE USING (company_id = public.app_current_company_id())',
    p_table
  );
END
$function$;
