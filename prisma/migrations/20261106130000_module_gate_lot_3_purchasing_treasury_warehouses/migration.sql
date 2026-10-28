-- F3.4 · RLS por módulo, lote 3 de 6: Pagos, Tesorería, Compras y Almacenes (blueprint §5.3).
-- Política RESTRICTIVA `module_gate` (helper `app_enable_module_gate`, prisma/sql/modules.sql) sobre las tablas de cada
-- módulo, con las tablas del catálogo (`src/features/Modules/catalog.ts`). Con el módulo apagado para la empresa de la
-- transacción, `alphataco_app` no ve ni escribe esas filas; `alphataco_system` y el dueño de las tablas no pasan por ella.
-- Con el módulo encendido (la línea de base de la demo, dev, CI y e2e) la política deja pasar todo: es inerte.

-- pagos (7 tablas)
SELECT public.app_enable_module_gate('public.payment_orders', ARRAY['pagos']::text[]);
SELECT public.app_enable_module_gate('public.payment_order_rejections', ARRAY['pagos']::text[]);
SELECT public.app_enable_module_gate('public.payment_order_lines', ARRAY['pagos']::text[]);
SELECT public.app_enable_module_gate('public.payment_order_withholdings', ARRAY['pagos']::text[]);
SELECT public.app_enable_module_gate('public.payment_order_payments', ARRAY['pagos']::text[]);
SELECT public.app_enable_module_gate('public.withholding_regimes', ARRAY['pagos']::text[]);
SELECT public.app_enable_module_gate('public.supplier_withholding_profiles', ARRAY['pagos']::text[]);

-- tesoreria (18 tablas)
SELECT public.app_enable_module_gate('public.treasury_accounts', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.treasury_movements', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.treasury_concepts', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.treasury_transfers', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.customer_receipts', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.customer_receipt_lines', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.customer_receipt_withholdings', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.customer_receipt_payments', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.third_party_checks', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.third_party_check_operations', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.third_party_check_operation_items', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.third_party_check_events', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.checkbooks', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.own_checks', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.own_check_events', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.bank_statement_profiles', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.bank_statements', ARRAY['tesoreria']::text[]);
SELECT public.app_enable_module_gate('public.bank_statement_lines', ARRAY['tesoreria']::text[]);

-- compras (19 tablas)
SELECT public.app_enable_module_gate('public.suppliers', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.supplier_contacts', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.supplier_categories', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.supplier_category_links', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.supplier_documents', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.purchase_requests', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.purchase_request_lines', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.purchase_quotes', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.purchase_quote_lines', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.purchase_orders', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.purchase_order_lines', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.purchase_order_rejections', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.purchase_receipts', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.purchase_receipt_lines', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.supplier_invoices', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.supplier_invoice_lines', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.supplier_invoice_vat', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.supplier_invoice_taxes', ARRAY['compras']::text[]);
SELECT public.app_enable_module_gate('public.purchase_expense_categories', ARRAY['compras']::text[]);

-- almacenes (13 tablas)
SELECT public.app_enable_module_gate('public.warehouses', ARRAY['almacenes']::text[]);
SELECT public.app_enable_module_gate('public.material_categories', ARRAY['almacenes']::text[]);
SELECT public.app_enable_module_gate('public.measurement_units', ARRAY['almacenes']::text[]);
SELECT public.app_enable_module_gate('public.materials', ARRAY['almacenes']::text[]);
SELECT public.app_enable_module_gate('public.material_batches', ARRAY['almacenes']::text[]);
SELECT public.app_enable_module_gate('public.material_units', ARRAY['almacenes']::text[]);
SELECT public.app_enable_module_gate('public.stock_balances', ARRAY['almacenes']::text[]);
SELECT public.app_enable_module_gate('public.stock_movements', ARRAY['almacenes']::text[]);
SELECT public.app_enable_module_gate('public.stock_movement_lines', ARRAY['almacenes']::text[]);
SELECT public.app_enable_module_gate('public.material_unit_write_offs', ARRAY['almacenes']::text[]);
SELECT public.app_enable_module_gate('public.material_requests', ARRAY['almacenes']::text[]);
SELECT public.app_enable_module_gate('public.material_request_lines', ARRAY['almacenes']::text[]);
SELECT public.app_enable_module_gate('public.warehouse_settings', ARRAY['almacenes']::text[]);
