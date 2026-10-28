/**
 * Catálogo FUNCIONAL de módulos (F3 de la sala de control): qué se puede encender y apagar por instancia y por empresa.
 *
 * No es el catálogo de permisos (`permissions-map.ts`): un módulo de permisos mezcla funciones que se contratan por
 * separado (Gomería vive en el módulo `mantenimiento`, Facturación en `comercial`, Pagos en `compras`). Cada clave de
 * acá declara qué pestañas, rutas, jobs, buckets, recursos de API y tablas le pertenecen, y de qué otras claves depende.
 *
 * - Las dependencias son CONSTANTES (no datos): salen del código y de las FK obligatorias del esquema, y solo cambian con
 *   un despliegue. `catalog.test.ts` las coteja contra `schema.prisma`.
 * - Las claves son INMUTABLES: una clave renombrada no tiene fila de estado y queda apagada en todas las instancias.
 * - `nucleo` siempre está encendido y no aparece como interruptor.
 *
 * Módulo PURO, sin `server-only` ni imports de servidor: lo importan el seed y los scripts (Node ejecuta el TypeScript tal
 * cual, por eso los imports de tipos van con `import type`), la app, la API de administración y los tests.
 */
import type { StorageBucket } from '../../shared/lib/storage-buckets.ts';
import type { JobName } from '../Jobs/lib/types.ts';

export const MODULE_KEYS = [
  'nucleo',
  'empleados',
  'equipos',
  'documentacion',
  'clientes',
  'operaciones',
  'certificacion',
  'facturacion',
  'mantenimiento',
  'gomeria',
  'checklists',
  'formularios',
  'seleccion',
  'almacenes',
  'indumentaria',
  'compras',
  'pagos',
  'tesoreria',
  'hse',
  'portal',
  'movil',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/** La única clave que no se apaga. */
export const CORE_MODULE: ModuleKey = 'nucleo';

/** Ruta de un nodo del árbol de permisos: `modulo`, `modulo:tab` o `modulo:tab:sub` (gana la más específica). */
export type TabPath = string;

export interface ModuleDef {
  key: ModuleKey;
  /** Nombre que ve el panel. */
  name: string;
  /** Qué incluye, para el panel. */
  description: string;
  /** Solo `nucleo`: siempre encendido. */
  core?: true;
  /** Dependencias DURAS: bloquean el apagado (si hay dependientes encendidos) y el encendido (si faltan). */
  requires: readonly ModuleKey[];
  /** Dependencias duras alternativas: cada grupo exige AL MENOS UNA clave encendida. Solo la usa `documentacion`. */
  requiresAny?: readonly (readonly ModuleKey[])[];
  /** Dependencias BLANDAS: el consumidor se degrada. No bloquean; el plan las informa. */
  softDeps: readonly ModuleKey[];
  /** Qué deja de verse en este módulo si se apaga cada dependencia blanda (para el plan). */
  softImpactMessages?: Partial<Record<ModuleKey, string>>;
  /** Nodos del árbol de permisos de los que es dueño. */
  tabs: readonly TabPath[];
  /** Prefijos de página. El dueño de una URL es el prefijo más largo. */
  routes: readonly string[];
  jobs: readonly JobName[];
  buckets: readonly StorageBucket[];
  /** Recursos de `/api/external/v1`. */
  externalResources?: readonly string[];
  /** Entradas de `MOBILE_MODULES` de la API móvil. */
  mobile?: readonly string[];
  /**
   * Tablas propias (modelos de `schema.prisma`). Todo modelo tiene exactamente un dueño. La compuerta de RLS por módulo
   * (F3.4) se aplica a estas tablas menos las de `UNGATED_TABLES`.
   */
  tables: readonly string[];
  /** Reconciliación de cachés al encender (F3.2). */
  onEnable?: 'reconcile-documents' | 'reconcile-hse';
}

/**
 * Nodos que, además de su dueño, exigen otras claves. Caso que lo obliga: `documentacion` se puede tener solo con
 * Empleados o solo con Equipos (`requiresAny`), así que las pestañas de personas exigen `empleados` y las de equipos
 * exigen `equipos`.
 */
export const TAB_ALSO_REQUIRES: Readonly<Record<TabPath, readonly ModuleKey[]>> = {
  'documentacion:documentos-de-empleados': ['empleados'],
  'documentacion:detalle-de-documento:detalle-doc-empleado': ['empleados'],
  'dashboard:documentacion:empleados': ['empleados'],
  'configuracion:documentos:tipos-docs-personas': ['empleados'],
  'documentacion:documentos-de-equipos': ['equipos'],
  'dashboard:documentacion:vehiculos': ['equipos'],
  'configuracion:documentos:tipos-docs-equipos': ['equipos'],
};

/**
 * Tablas que, además de su dueño, solo tienen sentido con otras claves encendidas: son las que tienen una FK
 * obligatoria hacia una clave que su dueño no requiere (pivotes entre dos módulos, y los documentos de
 * `documentacion`, que requiere Empleados O Equipos). El test de coherencia con el esquema las acepta así.
 */
export const TABLE_ALSO_REQUIRES: Readonly<Record<string, readonly ModuleKey[]>> = {
  documents_employees: ['empleados'],
  documents_employees_logs: ['empleados'],
  documents_equipment: ['equipos'],
  documents_equipment_logs: ['equipos'],
  // Afectaciones de recursos a clientes (Comercial → Clientes → Empleados / Equipos).
  contractor_employee: ['empleados'],
  contractor_equipment: ['equipos'],
  contractor_other_equipment: ['equipos'],
  equipos_clientes: ['equipos'],
  // Una factura puede salir de certificaciones (blanda para Facturación).
  invoice_certifications: ['certificacion'],
  // Asignación de un empleado y un equipo a un cliente.
  assing_customer: ['empleados', 'equipos'],
};

/**
 * Tablas que NO llevan la compuerta de RLS por módulo (decisión 4 del blueprint): las maestras de las que casi todo
 * depende en forma dura, y los catálogos mixtos. Su apagado lo cubren los permisos (capa 1) y el proxy (capa 2).
 */
export const UNGATED_TABLES: ReadonlySet<string> = new Set([
  'employees',
  'vehicles',
  'other_equipment',
  'customers',
  'customer_services',
  'document_types',
  'daily_indicators',
  // Plantillas globales de checklists (sin `company_id` ni RLS): no hay política de empresa sobre la que apoyar la compuerta.
  'checklist_items',
  'checklist_sections',
  // Arrendamiento técnico entre procesos (clave + dueño + vencimiento): sin `company_id` ni RLS.
  'arca_locks',
]);

/**
 * Módulos cuyas tablas NO llevan la compuerta de RLS (decisión 4 del blueprint): el núcleo y las tres maestras
 * (empleados, equipos, clientes) de las que casi todo depende en forma dura, más la API móvil (sin tablas propias).
 * Su apagado lo cubren los permisos (capa 1) y las rutas y guardas (capa 2).
 */
export const RLS_UNGATED_MODULES: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  'nucleo',
  'empleados',
  'equipos',
  'clientes',
  'movil',
]);

/**
 * Tablas compartidas por dos módulos: ven las filas si está encendido ALGUNO. Mantenimiento arma sus solicitudes con
 * los desvíos de checklist (una «carga manual» escribe una respuesta y desvíos propios) y Checklists no requiere
 * Mantenimiento, así que con la compuerta solo por dueño (`checklists`) apagar Checklists rompería el alta de pedidos.
 */
export const TABLE_GATE_ANY: Readonly<Record<string, readonly ModuleKey[]>> = {
  checklist_answers: ['checklists', 'mantenimiento'],
  checklist_deviations: ['checklists', 'mantenimiento'],
};

/** Compuerta de RLS de una tabla: TODAS las claves de `all` y, si `any` no es vacío, AL MENOS UNA de `any`. */
export interface ModuleGate {
  table: string;
  owner: ModuleKey;
  all: readonly ModuleKey[];
  any: readonly ModuleKey[];
}

/**
 * Compuerta de RLS por módulo (F3.4) de una tabla, o `null` si no lleva (módulo sin compuerta o tabla en
 * `UNGATED_TABLES`). Por defecto exige el dueño; `TABLE_ALSO_REQUIRES` suma claves (una pivote entre dos módulos se
 * oculta con cualquiera de los dos apagado, así no queda visible la pivote con el padre oculto) y `TABLE_GATE_ANY`
 * reemplaza el dueño por una alternativa.
 */
export function moduleGateFor(table: string): ModuleGate | null {
  const owner = moduleForTable(table);
  if (!owner || RLS_UNGATED_MODULES.has(owner) || UNGATED_TABLES.has(table)) return null;
  const any = TABLE_GATE_ANY[table] ?? [];
  const all = any.length > 0 ? [] : [owner];
  const also = TABLE_ALSO_REQUIRES[table] ?? [];
  return { table, owner, all: [...new Set([...all, ...also])], any };
}

/** Todas las tablas con compuerta, agrupadas por la clave dueña (es el reparto de los lotes de la migración). */
export function gatedTables(): ModuleGate[] {
  return MODULE_KEYS.flatMap((key) => MODULE_CATALOG[key].tables)
    .map((table) => moduleGateFor(table))
    .filter((gate): gate is ModuleGate => gate !== null);
}

/** Rutas públicas que sirven a varias claves: alcanza con que esté encendida ALGUNA. */
export const SHARED_ROUTES: readonly { prefix: string; anyOf: readonly ModuleKey[] }[] = [
  { prefix: '/maintenance', anyOf: ['mantenimiento', 'checklists', 'gomeria'] },
];

export const MODULE_CATALOG: Readonly<Record<ModuleKey, ModuleDef>> = {
  nucleo: {
    key: 'nucleo',
    name: 'Núcleo',
    description: 'Inicio, configuración general, usuarios y roles, indicadores, avisos, ayuda y manual.',
    core: true,
    requires: [],
    softDeps: [],
    tabs: [
      'dashboard',
      'dashboard:principal',
      'dashboard:estadisticas',
      'configuracion',
      'configuracion:general',
      'configuracion:general:kpis',
      'ayuda',
      // Contenedor estructural: si fuera de `clientes`, apagar Clientes apagaría Certificación y Facturación por herencia.
      'comercial',
    ],
    routes: ['/dashboard', '/dashboard/configuration', '/dashboard/notifications', '/dashboard/help', '/manual'],
    jobs: ['processed-commands-purge', 'daily-indicators'],
    buckets: ['logo', 'avatar'],
    tables: [
      'actions',
      'modules',
      'tabs',
      'roles',
      'role_permissions',
      'user_permissions',
      'user_roles',
      'role_notifications',
      'notification_settings',
      'notification_events',
      'notification_deliveries',
      'company',
      'profile',
      'share_company_users',
      'user',
      'session',
      'account',
      'verification',
      'provinces',
      'cities',
      'countries',
      'industry_type',
      'instance_settings',
      'instance_modules',
      'company_modules',
      'module_change_log',
      'module_tab_owners',
      'handle_errors',
      'jobs_runs',
      'processed_commands',
      'support_ticket_views',
      'user_table_preferences',
      'user_dashboards',
      'user_dashboard_shares',
      'external_api_clients',
      'external_api_access_logs',
      'kpis',
      'kpi_revisions',
      'daily_indicators',
      'cost_center',
      // Sectores de la empresa (pestaña «Sectores», slug histórico `organigrama`): estructura común.
      'hierarchy',
      // Catálogo mixto de tipos de documento: lo usan Documentación, Selección y HSE (decisión del blueprint, §5.3).
      'document_types',
    ],
  },
  empleados: {
    key: 'empleados',
    name: 'Empleados',
    description: 'Legajos, diagramas de trabajo y la configuración de RR.HH.',
    requires: [],
    softDeps: ['documentacion'],
    softImpactMessages: { documentacion: 'Los legajos dejan de mostrar el estado documental.' },
    tabs: ['empleados', 'configuracion:rrhh', 'configuracion:general:org-chart', 'dashboard:estadisticas:rrhh'],
    routes: ['/dashboard/employee'],
    jobs: [],
    buckets: [],
    externalResources: ['employees'],
    mobile: ['empleados.employees'],
    tables: [
      'employees',
      'category',
      'category_employee',
      'company_positions',
      'covenant',
      'guild',
      'types_of_contract',
      'aptitudes_tecnicas',
      'aptitudes_tecnicas_puestos',
      'empleado_aptitudes',
      'companies_employees',
      'org_chart_positions',
      'employees_diagram',
      'diagram_type',
      'diagrams_logs',
      'work_diagram',
      'work_diagram_active_novelties',
    ],
  },
  equipos: {
    key: 'equipos',
    name: 'Equipos',
    description: 'Vehículos y otros equipos, sus titulares y la configuración de flota.',
    requires: [],
    softDeps: ['documentacion'],
    softImpactMessages: { documentacion: 'Los equipos dejan de mostrar el estado documental.' },
    tabs: ['equipos', 'configuracion:vehicles'],
    routes: ['/dashboard/equipment'],
    jobs: [],
    buckets: [],
    externalResources: ['vehicles', 'other-equipment'],
    tables: [
      'vehicles',
      'other_equipment',
      'other_equipment_certifications',
      'brand_vehicles',
      'model_vehicles',
      'type',
      'types_of_vehicles',
      'sub_type',
      'sub_type_compatible_items',
      'type_hitch_types',
      'type_operative',
      'equipment_owners',
      'equipment_owner_contract_types',
      'role_hidden_equipment_types',
      'user_equipment_type_visibility',
    ],
  },
  documentacion: {
    key: 'documentacion',
    name: 'Documentación',
    description: 'Documentos de empleados, equipos y empresa, vencimientos y tipos de documento.',
    requires: [],
    requiresAny: [['empleados', 'equipos']],
    softDeps: [],
    tabs: [
      'documentacion',
      'configuracion:documentos',
      'configuracion:general:documentacion',
      'dashboard:documentacion',
    ],
    routes: ['/dashboard/document'],
    jobs: ['documents-status', 'documents-expiry'],
    buckets: ['document-files', 'document-files-expired'],
    tables: [
      'documents_company',
      'documents_employees',
      'documents_employees_logs',
      'documents_equipment',
      'documents_equipment_logs',
    ],
    onEnable: 'reconcile-documents',
  },
  clientes: {
    key: 'clientes',
    name: 'Clientes',
    description: 'Clientes, contratos, ítems, unidades de medida y reglas de precio; afectación de recursos.',
    requires: [],
    softDeps: [],
    tabs: ['comercial:comerce'],
    routes: ['/dashboard/comercial', '/dashboard/configuration/customers', '/dashboard/configuration/services'],
    jobs: [],
    buckets: ['contract-documents'],
    externalResources: ['customers', 'commercial-sectors', 'customer-areas'],
    tables: [
      'customers',
      'customer_services',
      'contacts',
      'service_items',
      'service_areas',
      'service_sectors',
      'areas_cliente',
      'area_province',
      'sectors',
      'measure_units',
      'assing_customer',
      'contractor_employee',
      'contractor_equipment',
      'contractor_other_equipment',
      'equipos_clientes',
      'documents_contracts',
      'service_item_price_revisions',
      'price_update_rules',
      'price_update_runs',
    ],
  },
  operaciones: {
    key: 'operaciones',
    name: 'Operaciones',
    description: 'Prepartes, partes diarios y remitos.',
    requires: ['clientes', 'empleados', 'equipos'],
    softDeps: [],
    tabs: ['operaciones', 'dashboard:estadisticas:operaciones'],
    routes: ['/dashboard/operations'],
    jobs: ['daily-report-deviations'],
    buckets: ['daily-reports', 'preparte-img'],
    mobile: ['operaciones.daily-report-rows', 'operaciones.daily-reports', 'operaciones.resources'],
    tables: [
      'dailyreport',
      'dailyreportrows',
      'dailyreportrows_history',
      'dailyreportemployeerelations',
      'dailyreportequipmentrelations',
      'dailyreport_customer_equipment_relations',
      'preparte',
      'preparte_change_logs',
      'remitos',
      'remito_documents',
    ],
  },
  certificacion: {
    key: 'certificacion',
    name: 'Certificación',
    description: 'Certificación de los partes diarios de cada cliente.',
    requires: ['operaciones', 'clientes'],
    softDeps: [],
    tabs: ['comercial:comerce:certificaciones', 'comercial:comerce:daily_reports'],
    routes: [],
    jobs: [],
    buckets: [],
    tables: ['certifications', 'certification_lines'],
  },
  facturacion: {
    key: 'facturacion',
    name: 'Facturación',
    description: 'Comprobantes electrónicos (ARCA), puntos de venta y datos fiscales.',
    requires: ['clientes'],
    softDeps: ['certificacion'],
    softImpactMessages: { certificacion: 'No se pueden facturar certificaciones.' },
    tabs: ['comercial:comerce:facturacion', 'configuracion:general:datos-fiscales'],
    routes: ['/dashboard/comercial/facturacion'],
    jobs: [],
    buckets: ['invoice-pdfs'],
    tables: [
      'company_fiscal_profiles',
      'sales_points',
      'arca_credentials',
      'arca_tokens',
      'arca_locks',
      'arca_call_logs',
      'invoices',
      'invoice_lines',
      'invoice_vat',
      'invoice_certifications',
    ],
  },
  mantenimiento: {
    key: 'mantenimiento',
    name: 'Mantenimiento',
    description: 'Pedidos de mantenimiento, órdenes de taller, panel del operario e historial del equipo.',
    requires: ['equipos', 'empleados'],
    softDeps: ['almacenes', 'checklists', 'formularios', 'documentacion'],
    softImpactMessages: {
      almacenes: 'Las órdenes de taller dejan de mostrar materiales.',
      checklists: 'Los pedidos dejan de originarse en desvíos de checklist.',
      formularios: 'Las órdenes dejan de ofrecer formularios.',
      documentacion: 'Las validaciones de taller dejan de actualizar el estado documental.',
    },
    tabs: [
      'mantenimiento',
      'configuracion:mantenimiento',
      'equipos:detalle-equipo:historial-mantenimiento-equipo',
      'dashboard:estadisticas:mantenimiento',
      'dashboard:estadisticas:desvios',
    ],
    routes: ['/dashboard/maintenance', '/operator', '/maintenance/equipment/*/request'],
    jobs: [],
    buckets: ['repair-images'],
    tables: [
      'maintenance_activity_log',
      'maintenance_group_type_of_repairs',
      'maintenance_order_item_repair_types',
      'maintenance_order_items',
      'maintenance_orders',
      'maintenance_request_groups',
      'maintenance_request_items',
      'maintenance_requests',
      'sector_repair_types',
      'types_of_repairs',
      'work_order_item_repairs',
      'work_order_items',
      'work_orders',
      'employee_workshop_sectors',
      'workshop_sectors',
      'workshops',
    ],
  },
  gomeria: {
    key: 'gomeria',
    name: 'Gomería',
    description: 'Cubiertas, plantillas por eje y órdenes de gomería.',
    requires: ['mantenimiento', 'equipos', 'almacenes'],
    softDeps: [],
    tabs: ['mantenimiento:gomeria', 'equipos:cubiertas-equipo'],
    routes: ['/maintenance/equipment/*/tire-service'],
    jobs: [],
    buckets: ['tire-discards'],
    tables: [
      'tire_brands',
      'tire_types',
      'tire_materials',
      'tires',
      'tire_templates',
      'tire_template_axles',
      'vehicle_tire_positions',
      'vehicle_axle_tire_sizes',
      'tire_service_orders',
      'tire_service_items',
    ],
  },
  checklists: {
    key: 'checklists',
    name: 'Checklists',
    description: 'Checklists de equipos por QR y sus desvíos.',
    requires: ['equipos'],
    softDeps: ['mantenimiento'],
    softImpactMessages: { mantenimiento: 'Un desvío crítico deja de abrir un pedido de reparación.' },
    tabs: ['equipos:checklist-equipo'],
    routes: ['/maintenance/equipment/*/checklists'],
    jobs: [],
    buckets: [],
    tables: [
      'checklist_answers',
      'checklist_deviations',
      'checklist_items',
      'checklist_sections',
      'checklist_templates',
      'checklist_template_items',
      'checklist_template_sections',
      'checklist_template_sub_types',
      'checklist_template_types',
    ],
  },
  formularios: {
    key: 'formularios',
    name: 'Formularios',
    description: 'Formularios personalizados y sus respuestas.',
    requires: [],
    softDeps: [],
    tabs: ['formularios'],
    routes: ['/dashboard/forms'],
    jobs: [],
    buckets: [],
    tables: ['custom_form', 'form_answers'],
  },
  seleccion: {
    key: 'seleccion',
    name: 'Selección',
    description: 'Candidatos y pre legajos con su documentación de ingreso.',
    requires: ['empleados', 'documentacion'],
    softDeps: [],
    tabs: ['seleccion'],
    routes: ['/dashboard/recruitment'],
    jobs: [],
    buckets: [],
    tables: ['pre_employees', 'documents_pre_employees'],
  },
  almacenes: {
    key: 'almacenes',
    name: 'Almacenes',
    description: 'Depósitos, materiales, stock, movimientos, préstamos y pedidos de materiales.',
    requires: [],
    softDeps: ['equipos', 'clientes', 'mantenimiento'],
    tabs: ['almacenes'],
    routes: ['/dashboard/warehouse'],
    jobs: ['warehouse-batch-expiry'],
    buckets: [],
    tables: [
      'warehouses',
      'material_categories',
      'measurement_units',
      'materials',
      'material_batches',
      'material_units',
      'stock_balances',
      'stock_movements',
      'stock_movement_lines',
      'material_unit_write_offs',
      'material_requests',
      'material_request_lines',
      'warehouse_settings',
    ],
  },
  indumentaria: {
    key: 'indumentaria',
    name: 'Indumentaria',
    description: 'Catálogo de indumentaria y entregas firmadas a los empleados.',
    requires: ['empleados', 'almacenes'],
    softDeps: [],
    tabs: ['configuracion:rrhh:listado_maestro_articulos', 'empleados:detalle-empleado:indumentaria_empleado'],
    routes: ['/clothing'],
    jobs: [],
    buckets: ['clothing-signatures'],
    tables: [
      'clothing_brands',
      'clothing_deliveries',
      'clothing_delivery_items',
      'clothing_item_brand_sizes',
      'clothing_item_materials',
      'clothing_items',
      'clothing_sizes',
    ],
  },
  compras: {
    key: 'compras',
    name: 'Compras',
    description: 'Proveedores, solicitudes, cotizaciones, órdenes, recepciones y facturas de proveedor.',
    requires: ['almacenes'],
    softDeps: [],
    tabs: ['compras'],
    routes: ['/dashboard/purchases'],
    jobs: [],
    buckets: ['supplier-documents'],
    tables: [
      'suppliers',
      'supplier_contacts',
      'supplier_categories',
      'supplier_category_links',
      'supplier_documents',
      'purchase_requests',
      'purchase_request_lines',
      'purchase_quotes',
      'purchase_quote_lines',
      'purchase_orders',
      'purchase_order_lines',
      'purchase_order_rejections',
      'purchase_receipts',
      'purchase_receipt_lines',
      'supplier_invoices',
      'supplier_invoice_lines',
      'supplier_invoice_vat',
      'supplier_invoice_taxes',
      'purchase_expense_categories',
    ],
  },
  pagos: {
    key: 'pagos',
    name: 'Pagos',
    description: 'Órdenes de pago a proveedores y retenciones practicadas.',
    requires: ['compras', 'tesoreria'],
    softDeps: [],
    tabs: ['compras:pagos', 'compras:retenciones'],
    routes: [],
    jobs: [],
    buckets: [],
    tables: [
      'payment_orders',
      'payment_order_rejections',
      'payment_order_lines',
      'payment_order_withholdings',
      'payment_order_payments',
      'withholding_regimes',
      'supplier_withholding_profiles',
    ],
  },
  tesoreria: {
    key: 'tesoreria',
    name: 'Tesorería',
    description: 'Cuentas, movimientos, cobranzas, cheques y conciliación bancaria.',
    requires: ['clientes'],
    softDeps: ['compras'],
    softImpactMessages: { compras: 'Los cheques propios dejan de vincularse con proveedores.' },
    tabs: ['tesoreria'],
    routes: ['/dashboard/treasury'],
    jobs: [],
    // Certificados de las retenciones sufridas (`tesoreria:retenciones-sufridas`), aunque el bucket se llame de clientes.
    buckets: ['customer-documents'],
    tables: [
      'treasury_accounts',
      'treasury_movements',
      'treasury_concepts',
      'treasury_transfers',
      'customer_receipts',
      'customer_receipt_lines',
      'customer_receipt_withholdings',
      'customer_receipt_payments',
      'third_party_checks',
      'third_party_check_operations',
      'third_party_check_operation_items',
      'third_party_check_events',
      'checkbooks',
      'own_checks',
      'own_check_events',
      'bank_statement_profiles',
      'bank_statements',
      'bank_statement_lines',
    ],
  },
  hse: {
    key: 'hse',
    name: 'HSE',
    description: 'Documentos HSE, capacitaciones, exámenes, actas y constancias.',
    requires: ['empleados'],
    softDeps: ['documentacion'],
    softImpactMessages: { documentacion: 'Las constancias dejan de verse en el legajo.' },
    tabs: ['hse'],
    routes: ['/dashboard/hse'],
    jobs: ['hse-expiry', 'hse-expired-attempts'],
    buckets: ['hse-files'],
    tables: [
      'hse_document_types',
      'hse_documents',
      'hse_document_versions',
      'hse_document_targets',
      'hse_document_acknowledgements',
      'hse_trainings',
      'hse_training_targets',
      'hse_training_materials',
      'hse_training_questions',
      'hse_training_options',
      'hse_training_answer_keys',
      'hse_training_assignments',
      'hse_training_attempts',
      'hse_training_answers',
      'hse_training_material_reads',
      'hse_training_material_opens',
      'hse_training_instructors',
      'hse_training_records',
      'hse_training_record_instructors',
      'hse_training_record_attendees',
      'hse_training_certificates',
      'hse_training_document_types',
      'hse_expiry_notices',
    ],
    onEnable: 'reconcile-hse',
  },
  portal: {
    key: 'portal',
    name: 'Portal del empleado',
    description: 'Acceso de los empleados a /portal para leer documentos HSE y rendir capacitaciones.',
    // Dura mientras el portal solo muestre contenido HSE (decisión 3 del blueprint).
    requires: ['empleados', 'hse'],
    softDeps: [],
    tabs: ['empleados:detalle-empleado:portal_empleado'],
    routes: ['/portal'],
    jobs: [],
    buckets: [],
    tables: ['employee_portal_access', 'employee_portal_access_events'],
  },
  movil: {
    key: 'movil',
    name: 'API móvil',
    description: 'API de la app móvil (proceso `api`). `MOBILE_API_ENABLED` solo decide qué contenedor la atiende.',
    requires: ['empleados'],
    softDeps: ['operaciones'],
    softImpactMessages: { operaciones: 'La app deja de ofrecer los partes diarios.' },
    tabs: [],
    routes: ['/api/mobile'],
    jobs: [],
    buckets: [],
    tables: [],
  },
};

/** Claves apagables (todas menos `nucleo`), en el orden del catálogo. */
export const SWITCHABLE_MODULE_KEYS: readonly ModuleKey[] = MODULE_KEYS.filter((key) => key !== CORE_MODULE);

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === 'string' && (MODULE_KEYS as readonly string[]).includes(value);
}

/** ¿La clave está encendida en este conjunto? `nucleo` siempre. */
export function isModuleEnabled(enabled: ReadonlySet<string>, key: ModuleKey): boolean {
  return key === CORE_MODULE || enabled.has(key);
}

/** Todas las dependencias duras directas, incluidas las de los grupos `requiresAny`. */
function directHardDeps(key: ModuleKey): ModuleKey[] {
  const def = MODULE_CATALOG[key];
  return [...def.requires, ...(def.requiresAny ?? []).flat()];
}

/**
 * Cierre transitivo de las dependencias duras (sin la clave misma). Incluye los miembros de los grupos `requiresAny`:
 * es el conjunto de claves de las que la clave PUEDE depender.
 */
export function requiresClosure(key: ModuleKey): ReadonlySet<ModuleKey> {
  const seen = new Set<ModuleKey>();
  const stack = directHardDeps(key);
  while (stack.length > 0) {
    const next = stack.pop() as ModuleKey;
    if (seen.has(next)) continue;
    seen.add(next);
    stack.push(...directHardDeps(next));
  }
  seen.delete(key);
  return seen;
}

/** Claves que dependen en forma dura (directa o transitiva) de `key`. */
export function dependentsOf(key: ModuleKey): ModuleKey[] {
  return MODULE_KEYS.filter((other) => other !== key && requiresClosure(other).has(key));
}

/** Dependientes DIRECTOS (para mostrar «Lo requieren» en el panel). */
export function directDependentsOf(key: ModuleKey): ModuleKey[] {
  return MODULE_KEYS.filter((other) => directHardDeps(other).includes(key));
}

/** Dependencias duras que faltan para que `key` funcione con el conjunto `enabled`. Vacío = satisfecha. */
export function missingDependencies(key: ModuleKey, enabled: ReadonlySet<string>): ModuleKey[] {
  const def = MODULE_CATALOG[key];
  const missing = def.requires.filter((dep) => !isModuleEnabled(enabled, dep));
  for (const group of def.requiresAny ?? []) {
    if (!group.some((dep) => isModuleEnabled(enabled, dep))) missing.push(...group);
  }
  return [...new Set(missing)];
}

/**
 * Orden de apagado de un conjunto de claves: primero los dependientes, después aquello de lo que dependen. Es el orden
 * en el que se muestran y se registran las claves de una cascada.
 */
export function shutdownOrder(keys: Iterable<ModuleKey>): ModuleKey[] {
  const set = new Set(keys);
  const depth = (key: ModuleKey): number => dependentsOf(key).filter((dep) => set.has(dep)).length;
  return [...set].sort((a, b) => depth(a) - depth(b) || MODULE_KEYS.indexOf(a) - MODULE_KEYS.indexOf(b));
}

/** ¿El prefijo de ruta (con `*` como un segmento cualquiera) cubre la URL? Devuelve el largo en segmentos o -1. */
function matchRoute(route: string, pathname: string): number {
  const routeParts = route.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (routeParts.length > pathParts.length) return -1;
  for (let i = 0; i < routeParts.length; i += 1) {
    if (routeParts[i] !== '*' && routeParts[i] !== pathParts[i]) return -1;
  }
  return routeParts.length;
}

/** Dueño de una URL: el prefijo más largo de `routes` (o `null` si ninguna clave la declara). */
export function moduleForPath(pathname: string): ModuleKey | null {
  let best: { key: ModuleKey; length: number } | null = null;
  for (const key of MODULE_KEYS) {
    for (const route of MODULE_CATALOG[key].routes) {
      const length = matchRoute(route, pathname);
      if (length >= 0 && (!best || length > best.length)) best = { key, length };
    }
  }
  return best?.key ?? null;
}

/**
 * Claves que habilitan una URL: alcanza con que esté encendida ALGUNA. Una ruta propia de una clave devuelve solo esa;
 * una ruta compartida sin dueño más específico (la raíz del QR `/maintenance`) devuelve las claves que la comparten.
 * `null` = la URL no pertenece a ninguna clave apagable (o es del núcleo): no se corta.
 */
export function routeModules(pathname: string): readonly ModuleKey[] | null {
  const owner = moduleForPath(pathname);
  if (owner && owner !== CORE_MODULE) return [owner];
  const shared = SHARED_ROUTES.find((route) => matchRoute(route.prefix, pathname) >= 0);
  if (shared && !owner) return shared.anyOf;
  return null;
}

/** Clave dueña de un job, sacada de `jobs` (no se escribe dos veces). */
export function moduleForJob(job: JobName): ModuleKey | null {
  return MODULE_KEYS.find((key) => MODULE_CATALOG[key].jobs.includes(job)) ?? null;
}

/** Clave dueña de un bucket. */
export function moduleForBucket(bucket: StorageBucket): ModuleKey | null {
  return MODULE_KEYS.find((key) => MODULE_CATALOG[key].buckets.includes(bucket)) ?? null;
}

/** Clave dueña de una tabla (modelo de Prisma). */
export function moduleForTable(table: string): ModuleKey | null {
  return MODULE_KEYS.find((key) => MODULE_CATALOG[key].tables.includes(table)) ?? null;
}

/** Clave dueña de un recurso de `/api/external/v1`. */
export function moduleForExternalResource(resource: string): ModuleKey | null {
  return MODULE_KEYS.find((key) => MODULE_CATALOG[key].externalResources?.includes(resource)) ?? null;
}

/** Clave dueña de una entrada de `MOBILE_MODULES` de la API móvil. */
export function moduleForMobileEntry(entry: string): ModuleKey | null {
  return MODULE_KEYS.find((key) => MODULE_CATALOG[key].mobile?.includes(entry)) ?? null;
}
