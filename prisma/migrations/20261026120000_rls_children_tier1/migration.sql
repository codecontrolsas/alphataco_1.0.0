-- El helper se redefine aqui (esta migracion se reintenta en produccion tras fallar): el rellenado de company_id
-- desactiva los triggers de usuario de la tabla solo durante el UPDATE.
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
  -- El rellenado no es una edicion de negocio: se desactivan los triggers de usuario de la tabla (inmutabilidad de
  -- comprobantes autorizados, historial, `updated_at`...) solo durante el UPDATE. Los de FK son internos y siguen activos.
  EXECUTE format('ALTER TABLE %s DISABLE TRIGGER USER', p_child);
  EXECUTE format(
    'UPDATE %s c SET company_id = p.company_id FROM %s p WHERE c.%I = p.%I AND c.company_id IS NULL',
    p_child, p_parent, p_fk, p_parent_key
  );
  EXECUTE format('ALTER TABLE %s ENABLE TRIGGER USER', p_child);
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



-- Lote L5 (hijas de primer nivel): padres que ya tienen company_id.
-- Cada hija recibe company_id derivado de su padre (ver app_add_company_id_from_parent).
-- Inerte para la app mientras conecte como duenio de las tablas (RLS no le aplica).
SELECT public.app_add_company_id_from_parent('public.aptitudes_tecnicas_puestos', 'aptitud_id', 'public.aptitudes_tecnicas');
SELECT public.app_add_company_id_from_parent('public.areas_cliente', 'customer_id', 'public.customers');
SELECT public.app_add_company_id_from_parent('public.assing_customer', 'employee_id', 'public.employees');
SELECT public.app_add_company_id_from_parent('public.certification_lines', 'certification_id', 'public.certifications');
SELECT public.app_add_company_id_from_parent('public.checklist_template_items', 'template_id', 'public.checklist_templates');
SELECT public.app_add_company_id_from_parent('public.checklist_template_sections', 'template_id', 'public.checklist_templates');
SELECT public.app_add_company_id_from_parent('public.checklist_template_sub_types', 'template_id', 'public.checklist_templates');
SELECT public.app_add_company_id_from_parent('public.clothing_delivery_items', 'clothing_delivery_id', 'public.clothing_deliveries');
SELECT public.app_add_company_id_from_parent('public.clothing_item_brand_sizes', 'clothing_item_id', 'public.clothing_items');
SELECT public.app_add_company_id_from_parent('public.contractor_other_equipment', 'contractor_id', 'public.customers');
SELECT public.app_add_company_id_from_parent('public.customer_receipt_lines', 'receipt_id', 'public.customer_receipts');
SELECT public.app_add_company_id_from_parent('public.customer_receipt_payments', 'receipt_id', 'public.customer_receipts');
SELECT public.app_add_company_id_from_parent('public.diagrams_logs', 'employee_id', 'public.employees');
SELECT public.app_add_company_id_from_parent('public.empleado_aptitudes', 'aptitud_id', 'public.aptitudes_tecnicas');
SELECT public.app_add_company_id_from_parent('public.employee_workshop_sectors', 'employee_id', 'public.employees');
SELECT public.app_add_company_id_from_parent('public.employees_diagram', 'employee_id', 'public.employees');
SELECT public.app_add_company_id_from_parent('public.equipment_owner_contract_types', 'equipment_owner_id', 'public.equipment_owners');
SELECT public.app_add_company_id_from_parent('public.equipos_clientes', 'customer_id', 'public.customers');
SELECT public.app_add_company_id_from_parent('public.form_answers', 'form_id', 'public.custom_form');
SELECT public.app_add_company_id_from_parent('public.invoice_certifications', 'invoice_id', 'public.invoices');
SELECT public.app_add_company_id_from_parent('public.invoice_lines', 'invoice_id', 'public.invoices');
SELECT public.app_add_company_id_from_parent('public.invoice_vat', 'invoice_id', 'public.invoices');
SELECT public.app_add_company_id_from_parent('public.kpi_revisions', 'kpi_id', 'public.kpis');
SELECT public.app_add_company_id_from_parent('public.maintenance_order_item_repair_types', 'maintenance_order_item_id', 'public.maintenance_order_items');
SELECT public.app_add_company_id_from_parent('public.material_request_lines', 'request_id', 'public.material_requests');
SELECT public.app_add_company_id_from_parent('public.other_equipment_certifications', 'equipment_id', 'public.other_equipment');
SELECT public.app_add_company_id_from_parent('public.own_check_events', 'check_id', 'public.own_checks');
SELECT public.app_add_company_id_from_parent('public.payment_order_lines', 'payment_order_id', 'public.payment_orders');
SELECT public.app_add_company_id_from_parent('public.payment_order_payments', 'payment_order_id', 'public.payment_orders');
SELECT public.app_add_company_id_from_parent('public.payment_order_rejections', 'payment_order_id', 'public.payment_orders');
SELECT public.app_add_company_id_from_parent('public.payment_order_withholdings', 'payment_order_id', 'public.payment_orders');
SELECT public.app_add_company_id_from_parent('public.preparte_change_logs', 'preparte_id', 'public.preparte');
SELECT public.app_add_company_id_from_parent('public.purchase_order_lines', 'order_id', 'public.purchase_orders');
SELECT public.app_add_company_id_from_parent('public.purchase_order_rejections', 'order_id', 'public.purchase_orders');
SELECT public.app_add_company_id_from_parent('public.purchase_quote_lines', 'quote_id', 'public.purchase_quotes');
SELECT public.app_add_company_id_from_parent('public.purchase_receipt_lines', 'receipt_id', 'public.purchase_receipts');
SELECT public.app_add_company_id_from_parent('public.purchase_request_lines', 'request_id', 'public.purchase_requests');
SELECT public.app_add_company_id_from_parent('public.sector_repair_types', 'repair_type_id', 'public.types_of_repairs');
SELECT public.app_add_company_id_from_parent('public.sectors', 'customer_id', 'public.customers');
SELECT public.app_add_company_id_from_parent('public.service_areas', 'service_id', 'public.customer_services');
SELECT public.app_add_company_id_from_parent('public.service_item_price_revisions', 'service_item_id', 'public.service_items');
SELECT public.app_add_company_id_from_parent('public.service_sectors', 'service_id', 'public.customer_services');
SELECT public.app_add_company_id_from_parent('public.stock_movement_lines', 'movement_id', 'public.stock_movements');
SELECT public.app_add_company_id_from_parent('public.sub_type_compatible_items', 'sub_type_id', 'public.sub_type');
SELECT public.app_add_company_id_from_parent('public.supplier_category_links', 'supplier_id', 'public.suppliers');
SELECT public.app_add_company_id_from_parent('public.supplier_contacts', 'supplier_id', 'public.suppliers');
SELECT public.app_add_company_id_from_parent('public.supplier_documents', 'supplier_id', 'public.suppliers');
SELECT public.app_add_company_id_from_parent('public.supplier_invoice_lines', 'invoice_id', 'public.supplier_invoices');
SELECT public.app_add_company_id_from_parent('public.supplier_invoice_taxes', 'invoice_id', 'public.supplier_invoices');
SELECT public.app_add_company_id_from_parent('public.supplier_invoice_vat', 'invoice_id', 'public.supplier_invoices');
SELECT public.app_add_company_id_from_parent('public.supplier_withholding_profiles', 'supplier_id', 'public.suppliers');
SELECT public.app_add_company_id_from_parent('public.third_party_check_events', 'check_id', 'public.third_party_checks');
SELECT public.app_add_company_id_from_parent('public.third_party_check_operation_items', 'operation_id', 'public.third_party_check_operations');
SELECT public.app_add_company_id_from_parent('public.tire_service_items', 'service_order_id', 'public.tire_service_orders');
SELECT public.app_add_company_id_from_parent('public.tire_template_axles', 'template_id', 'public.tire_templates');
SELECT public.app_add_company_id_from_parent('public.vehicle_axle_tire_sizes', 'vehicle_id', 'public.vehicles');
SELECT public.app_add_company_id_from_parent('public.vehicle_tire_positions', 'vehicle_id', 'public.vehicles');
SELECT public.app_add_company_id_from_parent('public.work_order_items', 'work_order_id', 'public.work_orders');
