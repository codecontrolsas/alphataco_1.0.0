import type { ActionSlug, ModuleSlug } from '@/features/Permissions/permissions-map';

/**
 * Registro de widgets del Dashboard personalizable.
 *
 * Es la única fuente de qué se puede poner en un tablero: id estable (es lo que se guarda en
 * `user_dashboards.layout`), rótulo, sección del catálogo, permisos que exige y tamaños
 * admitidos. Módulo sin directiva y sin dependencias de servidor: lo leen el servidor (para
 * filtrar por permisos y validar layouts) y el cliente (catálogo "Agregar widget").
 *
 * Regla de permisos: un widget se ve si el usuario tiene TODAS las claves de `requires`: el
 * `view` de la sección del Dashboard de la que sale (`dashboard:<sección>:view`) y el `view` del
 * módulo de origen de los datos. Si además declara `requiresAny` (widgets que combinan fuentes
 * independientes, como personal y equipos), alcanza con que se cumpla UN grupo completo de claves;
 * el widget muestra solo la fuente que el usuario puede ver. Las acciones de datos conservan sus
 * guards propios (`requireDashboardView`, `assertCanViewKpiCharts`), así que esto es la puerta de
 * visibilidad, no la única defensa.
 */

/** Clave `modulo:tab:accion` tal como la devuelve el mapa de permisos del usuario. */
export type PermissionKey = `${ModuleSlug}:${string}:${ActionSlug}`;

/** Anchos de widget sobre la grilla de 12 columnas (en orden creciente). */
export const WIDGET_SIZES = ['xs', 'sm', 'md', 'lg', 'xl', 'full'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = {
  xs: '1/6 del ancho',
  sm: '1/4 del ancho',
  md: '1/3 del ancho',
  lg: 'Medio ancho',
  xl: '2/3 del ancho',
  full: 'Ancho completo',
};

/** Secciones del catálogo (agrupan el panel "Agregar widget"). */
export const WIDGET_SECTIONS = {
  resumen: 'Resumen',
  vencimientos: 'Vencimientos',
  operacion: 'Operación',
  flota: 'Flota y taller',
  personal: 'Personal',
  desvios: 'Control de desvíos',
  indicadores: 'Indicadores (KPIs)',
} as const;
export type WidgetSection = keyof typeof WIDGET_SECTIONS;

export interface WidgetDefinition {
  id: string;
  title: string;
  description: string;
  section: WidgetSection;
  requires: readonly PermissionKey[];
  /** Grupos alternativos de claves: se ve si se cumple algún grupo completo (además de `requires`). */
  requiresAny?: readonly (readonly PermissionKey[])[];
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  maxSize: WidgetSize;
}

const DASH_PRINCIPAL: PermissionKey = 'dashboard:principal:view';
const EMPLOYEES: PermissionKey = 'empleados:employees:view';
const DIAGRAMS: PermissionKey = 'empleados:diagrams:view';
const VEHICLES: PermissionKey = 'equipos:equipos:view';
const DAILY_REPORTS: PermissionKey = 'operaciones:dailyreportstable:view';
const WORKSHOP: PermissionKey = 'mantenimiento:maint_taller:view';

/** Fuentes de los widgets que combinan personal y equipos: las mismas claves que los `expiring-*-docs`. */
const EMPLOYEE_DOCS_SOURCE = ['dashboard:empleados:view', 'documentacion:documentos-de-empleados:view'] as const;
const VEHICLE_DOCS_SOURCE = ['dashboard:vehiculos:view', 'documentacion:documentos-de-equipos:view'] as const;

export const WIDGETS = [
  // ── Resumen (dashboard:principal) ───────────────────────────────────────
  {
    id: 'kpi-employees',
    title: 'Empleados',
    description: 'Cantidad de empleados activos',
    section: 'resumen',
    requires: [DASH_PRINCIPAL, EMPLOYEES],
    defaultSize: 'xs',
    minSize: 'xs',
    maxSize: 'md',
  },
  {
    id: 'kpi-active-vehicles',
    title: 'Equipos activos',
    description: 'Toda la flota activa, operativa o fuera de servicio',
    section: 'resumen',
    requires: [DASH_PRINCIPAL, VEHICLES],
    defaultSize: 'xs',
    minSize: 'xs',
    maxSize: 'md',
  },
  {
    id: 'kpi-operative-fleet',
    title: 'Flota operativa',
    description: 'Equipos activos menos los fuera de servicio',
    section: 'resumen',
    requires: [DASH_PRINCIPAL, VEHICLES],
    defaultSize: 'xs',
    minSize: 'xs',
    maxSize: 'md',
  },
  {
    id: 'kpi-today-services',
    title: 'Servicios del día (total)',
    description: 'Servicios del parte de hoy pendientes o ejecutados',
    section: 'resumen',
    requires: [DASH_PRINCIPAL, DAILY_REPORTS],
    defaultSize: 'xs',
    minSize: 'xs',
    maxSize: 'md',
  },
  {
    id: 'kpi-operativity',
    title: 'Operatividad',
    description: 'Porcentaje de equipos operativos sobre la flota total',
    section: 'resumen',
    requires: [DASH_PRINCIPAL, VEHICLES],
    defaultSize: 'xs',
    minSize: 'xs',
    maxSize: 'md',
  },
  {
    id: 'kpi-checklist-missing',
    title: 'Equipos sin checklist',
    description: 'Equipos sin checklist en el mes y en el histórico',
    section: 'resumen',
    requires: [DASH_PRINCIPAL, 'equipos:checklist-equipo:view'],
    defaultSize: 'xs',
    minSize: 'xs',
    maxSize: 'md',
  },
  {
    id: 'services-today',
    title: 'Servicios del día por tipo y cliente',
    description: 'Servicios de hoy por tipo y por cliente',
    section: 'resumen',
    requires: [DASH_PRINCIPAL, DAILY_REPORTS],
    defaultSize: 'lg',
    minSize: 'md',
    maxSize: 'full',
  },
  {
    id: 'hr-today',
    title: 'Recursos humanos',
    description: 'Personal con diagrama, en operación, disponible y novedades de hoy',
    section: 'resumen',
    requires: [DASH_PRINCIPAL, DIAGRAMS],
    defaultSize: 'lg',
    minSize: 'md',
    maxSize: 'full',
  },
  {
    id: 'equipment-operation',
    title: 'Estado de equipos',
    description: 'Equipos operativos, en reparación y disponibles',
    section: 'resumen',
    requires: [DASH_PRINCIPAL, VEHICLES],
    defaultSize: 'lg',
    minSize: 'md',
    maxSize: 'full',
  },
  {
    id: 'equipment-fleet',
    title: 'Estado de flota',
    description: 'Composición de la flota por condición y tipo',
    section: 'resumen',
    requires: [DASH_PRINCIPAL, VEHICLES],
    defaultSize: 'lg',
    minSize: 'md',
    maxSize: 'full',
  },
  // ── Vencimientos ────────────────────────────────────────────────────────
  {
    id: 'expiring-employee-docs',
    title: 'Vencimientos de personal',
    description: 'Documentos de empleados vencidos o que vencen en 30 días',
    section: 'vencimientos',
    requires: ['dashboard:empleados:view', 'documentacion:documentos-de-empleados:view'],
    defaultSize: 'full',
    minSize: 'lg',
    maxSize: 'full',
  },
  {
    id: 'expiring-vehicle-docs',
    title: 'Vencimientos de equipos',
    description: 'Documentos de vehículos y equipamiento vencidos o que vencen en 30 días',
    section: 'vencimientos',
    requires: ['dashboard:vehiculos:view', 'documentacion:documentos-de-equipos:view'],
    defaultSize: 'full',
    minSize: 'lg',
    maxSize: 'full',
  },
  {
    id: 'document-compliance',
    title: 'Estado documental',
    description: 'Empleados y equipos en regla, con documentos vencidos o con faltantes',
    section: 'vencimientos',
    requires: [],
    requiresAny: [EMPLOYEE_DOCS_SOURCE, VEHICLE_DOCS_SOURCE],
    defaultSize: 'lg',
    minSize: 'md',
    maxSize: 'full',
  },
  {
    id: 'expiring-weeks',
    title: 'Vencimientos por semana',
    description: 'Documentos que vencen en cada una de las próximas 4 semanas',
    section: 'vencimientos',
    requires: [],
    requiresAny: [EMPLOYEE_DOCS_SOURCE, VEHICLE_DOCS_SOURCE],
    defaultSize: 'lg',
    minSize: 'md',
    maxSize: 'full',
  },
  {
    id: 'expiring-timeline',
    title: 'Línea de vencimientos',
    description: 'Documentos que vencen día por día en los próximos 30 días',
    section: 'vencimientos',
    requires: [],
    requiresAny: [EMPLOYEE_DOCS_SOURCE, VEHICLE_DOCS_SOURCE],
    defaultSize: 'full',
    minSize: 'lg',
    maxSize: 'full',
  },
  // ── Análisis › Operación ────────────────────────────────────────────────
  {
    id: 'operations-charts',
    title: 'Histórico de servicios',
    description: 'Servicios por período, ranking de clientes y centros de costo',
    section: 'operacion',
    requires: ['dashboard:operaciones:view', DAILY_REPORTS],
    defaultSize: 'full',
    minSize: 'lg',
    maxSize: 'full',
  },
  // ── Análisis › Flota y taller ───────────────────────────────────────────
  {
    id: 'maintenance-charts',
    title: 'Flota y taller',
    description: 'Equipos en mantenimiento por tipo y clase, origen de solicitudes y titularidad',
    section: 'flota',
    requires: ['dashboard:mantenimiento:view', WORKSHOP],
    defaultSize: 'full',
    minSize: 'lg',
    maxSize: 'full',
  },
  // ── Análisis › Personal ─────────────────────────────────────────────────
  {
    id: 'hr-summary',
    title: 'Resumen de ausentismo',
    description: 'Tarjetas con ausentismo, dotación y ausencias del período',
    section: 'personal',
    requires: ['dashboard:rrhh:view', EMPLOYEES, DIAGRAMS],
    defaultSize: 'full',
    minSize: 'lg',
    maxSize: 'full',
  },
  {
    id: 'hr-absenteeism-trend',
    title: 'Variación de ausentismo',
    description: 'Evolución del ausentismo en el tiempo',
    section: 'personal',
    requires: ['dashboard:rrhh:view', EMPLOYEES, DIAGRAMS],
    defaultSize: 'lg',
    minSize: 'md',
    maxSize: 'full',
  },
  {
    id: 'hr-absence-reasons',
    title: 'Motivos de ausencia',
    description: 'Ausencias por motivo y por sector',
    section: 'personal',
    requires: ['dashboard:rrhh:view', EMPLOYEES, DIAGRAMS],
    defaultSize: 'lg',
    minSize: 'md',
    maxSize: 'full',
  },
  {
    id: 'hr-department-summary',
    title: 'Resumen por sector',
    description: 'Ausentismo y dotación por sector',
    section: 'personal',
    requires: ['dashboard:rrhh:view', EMPLOYEES, DIAGRAMS],
    defaultSize: 'lg',
    minSize: 'md',
    maxSize: 'full',
  },
  {
    id: 'hr-daily-absence',
    title: 'Ausentismo diario',
    description: 'Ausencias registradas por día',
    section: 'personal',
    requires: ['dashboard:rrhh:view', EMPLOYEES, DIAGRAMS],
    defaultSize: 'lg',
    minSize: 'md',
    maxSize: 'full',
  },
  {
    id: 'hr-distribution',
    title: 'Distribución de empleados',
    description: 'Empleados por género, puesto y tipo de contrato',
    section: 'personal',
    requires: ['dashboard:rrhh:view', EMPLOYEES, DIAGRAMS],
    defaultSize: 'lg',
    minSize: 'md',
    maxSize: 'full',
  },
  {
    id: 'hr-headcount-trend',
    title: 'Variación de dotación',
    description: 'Evolución de la cantidad de empleados',
    section: 'personal',
    requires: ['dashboard:rrhh:view', EMPLOYEES, DIAGRAMS],
    defaultSize: 'lg',
    minSize: 'md',
    maxSize: 'full',
  },
  {
    id: 'hr-employee-absence',
    title: 'Detalle de ausencias',
    description: 'Ausencias por empleado con su legajo',
    section: 'personal',
    requires: ['dashboard:rrhh:view', EMPLOYEES, DIAGRAMS],
    defaultSize: 'full',
    minSize: 'lg',
    maxSize: 'full',
  },
  // ── Análisis › Control de desvíos ───────────────────────────────────────
  {
    id: 'deviations-series',
    title: 'Desvíos del parte diario',
    description: 'Serie de desvíos de los partes diarios',
    section: 'desvios',
    requires: ['dashboard:desvios:view', 'mantenimiento:equipments_with_deviations:view'],
    defaultSize: 'full',
    minSize: 'lg',
    maxSize: 'full',
  },
  {
    id: 'order-management',
    title: 'Gestión de pedidos',
    description: 'Pedidos del preparte por estado y cliente',
    section: 'desvios',
    requires: ['dashboard:desvios:view', 'operaciones:preparte:view'],
    defaultSize: 'full',
    minSize: 'lg',
    maxSize: 'full',
  },
  // ── Indicadores (Configuración › KPIs) ──────────────────────────────────
  {
    id: 'kpi-charts',
    title: 'Gráficos de KPIs',
    description: 'Evolución de cada indicador contra su umbral',
    section: 'indicadores',
    requires: ['configuracion:graficos:view'],
    defaultSize: 'full',
    minSize: 'lg',
    maxSize: 'full',
  },
  {
    id: 'kpi-indicators',
    title: 'Indicadores',
    description: 'Listado de indicadores con su umbral y fórmula',
    section: 'indicadores',
    requires: ['configuracion:indicadores:view'],
    defaultSize: 'full',
    minSize: 'lg',
    maxSize: 'full',
  },
] as const satisfies readonly WidgetDefinition[];

export type WidgetId = (typeof WIDGETS)[number]['id'];

const WIDGETS_BY_ID: ReadonlyMap<string, WidgetDefinition> = new Map(WIDGETS.map((widget) => [widget.id, widget]));

export function getWidgetDefinition(id: string): WidgetDefinition | undefined {
  return WIDGETS_BY_ID.get(id);
}

/** Todas las claves que hay que consultar para resolver la visibilidad del catálogo completo. */
export const ALL_WIDGET_PERMISSION_KEYS: readonly PermissionKey[] = [
  ...new Set(
    WIDGETS.flatMap((widget): PermissionKey[] => [
      ...widget.requires,
      ...(('requiresAny' in widget ? widget.requiresAny : undefined) ?? []).flat(),
    ])
  ),
];

/** `true` si las claves concedidas alcanzan para ver el widget (`requires` completo y algún grupo de `requiresAny`). */
export function isWidgetGranted(widget: WidgetDefinition, granted: ReadonlySet<PermissionKey>): boolean {
  if (!widget.requires.every((key) => granted.has(key))) return false;
  if (!widget.requiresAny || widget.requiresAny.length === 0) return true;
  return widget.requiresAny.some((group) => group.every((key) => granted.has(key)));
}

/** Índice del tamaño en `WIDGET_SIZES` (para comparar y para achicar/agrandar). */
export function sizeIndex(size: WidgetSize): number {
  return WIDGET_SIZES.indexOf(size);
}

/** Lleva un tamaño al rango admitido por el widget. */
export function clampWidgetSize(widget: WidgetDefinition, size: WidgetSize): WidgetSize {
  const index = Math.min(Math.max(sizeIndex(size), sizeIndex(widget.minSize)), sizeIndex(widget.maxSize));
  return WIDGET_SIZES[index];
}

/**
 * Tableros por defecto: reproducen las secciones/vistas del Dashboard anterior (Resumen,
 * Vencimientos y las cuatro vistas de Análisis) más los KPIs de Configuración; entre todos cubren
 * cada widget del registro, así nadie pierde algo que hoy puede ver. Se muestran sin escribir en la base mientras el
 * usuario no tenga tableros propios; la primera personalización los guarda a todos.
 */
export const BOARD_TEMPLATES = [
  {
    key: 'resumen',
    name: 'Resumen',
    description: 'Estado general de personal, equipos y servicios de hoy',
    widgets: [
      'kpi-employees',
      'kpi-active-vehicles',
      'kpi-operative-fleet',
      'kpi-today-services',
      'kpi-operativity',
      'kpi-checklist-missing',
      'services-today',
      'hr-today',
      'equipment-operation',
      'equipment-fleet',
    ],
  },
  {
    key: 'vencimientos',
    name: 'Vencimientos',
    description: 'Documentos vencidos o que vencen en los próximos 30 días',
    widgets: [
      'document-compliance',
      'expiring-weeks',
      'expiring-timeline',
      'expiring-employee-docs',
      'expiring-vehicle-docs',
    ],
  },
  {
    key: 'operacion',
    name: 'Operación',
    description: 'Histórico de servicios, ranking de clientes y centros de costo',
    widgets: ['operations-charts'],
  },
  {
    key: 'flota',
    name: 'Flota y taller',
    description: 'Equipos en mantenimiento, origen y tipo de solicitudes',
    widgets: ['maintenance-charts'],
  },
  {
    key: 'personal',
    name: 'Personal',
    description: 'Ausentismo, dotación y distribución del personal',
    widgets: [
      'hr-summary',
      'hr-absenteeism-trend',
      'hr-absence-reasons',
      'hr-department-summary',
      'hr-daily-absence',
      'hr-distribution',
      'hr-headcount-trend',
      'hr-employee-absence',
    ],
  },
  {
    key: 'desvios',
    name: 'Control de desvíos',
    description: 'Desvíos de partes diarios y gestión de pedidos',
    widgets: ['deviations-series', 'order-management'],
  },
  {
    key: 'indicadores',
    name: 'Indicadores',
    description: 'Evolución de los KPIs contra su umbral',
    widgets: ['kpi-charts', 'kpi-indicators'],
  },
] as const satisfies readonly { key: string; name: string; description: string; widgets: readonly WidgetId[] }[];

export type BoardTemplateKey = (typeof BOARD_TEMPLATES)[number]['key'];

/**
 * Links viejos (`?tab=` / `?subtab=` de las secciones Resumen/Vencimientos/Análisis, que siguen
 * en el Manual de Ayuda y en marcadores) → tablero por defecto equivalente.
 */
export function templateKeyFromLegacyParams(
  tab: string | undefined,
  subtab: string | undefined
): BoardTemplateKey | null {
  if (tab === 'principal') return 'resumen';
  if (tab === 'documentacion') return 'vencimientos';
  if (tab === 'estadisticas') {
    if (subtab === 'mantenimiento') return 'flota';
    if (subtab === 'rrhh') return 'personal';
    if (subtab === 'desvios') return 'desvios';
    return 'operacion';
  }
  return null;
}
