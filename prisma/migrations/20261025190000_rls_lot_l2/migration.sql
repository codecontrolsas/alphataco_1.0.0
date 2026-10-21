-- Lote L2 de RLS: catalogos mixtos (filas globales con company_id NULL + filas propias de cada empresa).
-- Inerte mientras la app conecte como el usuario duenio de las tablas; rige para alphataco_app.
SELECT public.app_enable_tenant_catalog('public.brand_vehicles');
SELECT public.app_enable_tenant_catalog('public.document_types');
SELECT public.app_enable_tenant_catalog('public.guild');
SELECT public.app_enable_tenant_catalog('public.sub_type');
SELECT public.app_enable_tenant_catalog('public.type');
