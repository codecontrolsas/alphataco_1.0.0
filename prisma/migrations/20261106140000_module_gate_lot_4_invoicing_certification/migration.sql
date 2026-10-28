-- F3.4 · RLS por módulo, lote 4 de 6: Facturación y Certificación (blueprint §5.3).
-- Política RESTRICTIVA `module_gate` (helper `app_enable_module_gate`, prisma/sql/modules.sql) sobre las tablas de cada
-- módulo, con las tablas del catálogo (`src/features/Modules/catalog.ts`). Con el módulo apagado para la empresa de la
-- transacción, `alphataco_app` no ve ni escribe esas filas; `alphataco_system` y el dueño de las tablas no pasan por ella.
-- Con el módulo encendido (la línea de base de la demo, dev, CI y e2e) la política deja pasar todo: es inerte.

-- facturacion (9 tablas)
SELECT public.app_enable_module_gate('public.company_fiscal_profiles', ARRAY['facturacion']::text[]);
SELECT public.app_enable_module_gate('public.sales_points', ARRAY['facturacion']::text[]);
SELECT public.app_enable_module_gate('public.arca_credentials', ARRAY['facturacion']::text[]);
SELECT public.app_enable_module_gate('public.arca_tokens', ARRAY['facturacion']::text[]);
SELECT public.app_enable_module_gate('public.arca_call_logs', ARRAY['facturacion']::text[]);
SELECT public.app_enable_module_gate('public.invoices', ARRAY['facturacion']::text[]);
SELECT public.app_enable_module_gate('public.invoice_lines', ARRAY['facturacion']::text[]);
SELECT public.app_enable_module_gate('public.invoice_vat', ARRAY['facturacion']::text[]);
SELECT public.app_enable_module_gate('public.invoice_certifications', ARRAY['facturacion', 'certificacion']::text[]);

-- certificacion (2 tablas)
SELECT public.app_enable_module_gate('public.certifications', ARRAY['certificacion']::text[]);
SELECT public.app_enable_module_gate('public.certification_lines', ARRAY['certificacion']::text[]);
