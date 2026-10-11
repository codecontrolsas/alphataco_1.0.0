import type { ModuleSlug } from '@/features/Permissions/permissions-map';
import { MODULE_ICONS, type ModuleIcon } from '@/shared/constants/module-icons';
import {
  ArrowLeftRight,
  BookOpen,
  Building2,
  Car,
  ChartColumn,
  CircleDot,
  ClipboardList,
  FileCheck,
  FileQuestion,
  FileText,
  FileType,
  GitBranch,
  HandCoins,
  HandHelping,
  House,
  Layers,
  LifeBuoy,
  Package,
  PackageCheck,
  ReceiptText,
  Banknote,
  Percent,
  BookOpenText,
  Landmark,
  Plus,
  Repeat,
  Settings,
  TriangleAlert,
  Truck,
  UserPlus,
  Users,
  Warehouse,
  Wrench,
  XCircle,
} from 'lucide-react';

/** Icono de un item del sidebar. Misma forma que la del mapa compartido de modulos. */
export type NavIcon = ModuleIcon;

/**
 * Sub-item del sidebar: una tab de primer nivel del modulo.
 *
 * `tabSlug` es a la vez el valor del query param (`?tab=<tabSlug>`) y el slug con el que
 * `permissions-map` identifica la tab: en los 9 modulos con tabs, el `value` que declara
 * el `TabsManagerServer` y su `tabSlug` son el mismo string, y todos usan `paramName="tab"`.
 */
export type NavigationSubLink = {
  name: string;
  tabSlug: string;
  /** Contador a mostrar junto al sub-item (y, plegado, sobre el modulo). */
  badge?: NavBadge;
};

/** Contadores que puede llevar un item del sidebar. */
export type NavBadge = 'support-tickets';

export type NavigationLink = {
  name: string;
  moduleSlug: ModuleSlug;
  href: string;
  icon: NavIcon;
  position: number;
  /**
   * Tabs de primer nivel del modulo, en el orden en que las declara su componente.
   * Se omite en los modulos de una sola tab (Comercial, Formularios, Seleccion): un
   * desplegable con un solo hijo es ruido.
   */
  items?: NavigationSubLink[];
  /** Contador del modulo cuando se dibuja como link directo (sin sub-items visibles). */
  badge?: NavBadge;
};

/**
 * Navegacion del sidebar.
 *
 * Los sub-items NO se derivan de `permissions-map`: las tabs de primer nivel del mapa
 * incluyen entradas que no son tabs sino rutas de detalle (`detalle-empleado`,
 * `detalle-equipo`, `detalle-parte-diario`, `detalle-de-documento`) y, al reves, hay tabs
 * reales que el mapa no lista en primer nivel (`equipments_with_deviations` en Mantenimiento,
 * `vehicles`/`others`/`inactive` en Equipos, que son subtabs de `equipos`). Derivarlos del mapa generaria items que
 * apuntan a un `?tab=` inexistente y el modulo caeria a su tab por defecto en silencio.
 *
 * Por eso se declaran aca, espejando las tabs que realmente monta cada modulo, y se filtran
 * con la MISMA regla de permisos que usa `TabsManagerServer` (ver `buildSidebarItems`).
 *
 * Si se agrega o renombra una tab de primer nivel en un modulo, hay que reflejarlo aca.
 */
export const navigationLinks: NavigationLink[] = [
  {
    name: 'Dashboard',
    moduleSlug: 'dashboard',
    href: '/dashboard',
    icon: MODULE_ICONS.dashboard,
    position: 1,
    items: [
      { name: 'Principal', tabSlug: 'principal' },
      { name: 'Documentación', tabSlug: 'documentacion' },
      { name: 'Estadísticas', tabSlug: 'estadisticas' },
    ],
  },
  {
    name: 'Empleados',
    moduleSlug: 'empleados',
    href: '/dashboard/employee',
    icon: MODULE_ICONS.empleados,
    position: 2,
    items: [
      { name: 'Empleados', tabSlug: 'employees' },
      { name: 'Diagramas', tabSlug: 'diagrams' },
    ],
  },
  {
    // Una sola seccion: se dibuja como link directo, sin desplegable.
    name: 'Selección',
    moduleSlug: 'seleccion',
    href: '/dashboard/recruitment',
    icon: MODULE_ICONS.seleccion,
    position: 3,
  },
  {
    name: 'Equipos',
    moduleSlug: 'equipos',
    href: '/dashboard/equipment',
    icon: MODULE_ICONS.equipos,
    position: 4,
    items: [
      { name: 'Vehículos', tabSlug: 'vehicles' },
      { name: 'Equipamiento', tabSlug: 'others' },
      { name: 'Dados de Baja', tabSlug: 'inactive' },
    ],
  },
  {
    name: 'Comercial',
    moduleSlug: 'comercial',
    href: '/dashboard/comercial',
    icon: MODULE_ICONS.comercial,
    position: 5,
  },
  {
    name: 'Documentación',
    moduleSlug: 'documentacion',
    href: '/dashboard/document',
    icon: MODULE_ICONS.documentacion,
    position: 6,
    items: [
      { name: 'Documentos de Empleados', tabSlug: 'documentos-de-empleados' },
      { name: 'Documentos de Equipos', tabSlug: 'documentos-de-equipos' },
      { name: 'Documentos de Empresa', tabSlug: 'documentos-de-empresa' },
    ],
  },
  {
    name: 'Operaciones',
    moduleSlug: 'operaciones',
    href: '/dashboard/operations',
    icon: MODULE_ICONS.operaciones,
    position: 7,
    items: [
      { name: 'Gestor de Pedidos', tabSlug: 'preparte' },
      { name: 'Partes Diarios', tabSlug: 'dailyreportstable' },
    ],
  },
  {
    name: 'Mantenimiento',
    moduleSlug: 'mantenimiento',
    href: '/dashboard/maintenance',
    icon: MODULE_ICONS.mantenimiento,
    position: 8,
    items: [
      { name: 'Operaciones', tabSlug: 'maint_operaciones' },
      { name: 'Vista Taller', tabSlug: 'workshop_view' },
      { name: 'Taller', tabSlug: 'maint_taller' },
      { name: 'Nuevo Pedido', tabSlug: 'nuevo_pedido' },
      { name: 'Equipos con Desvíos', tabSlug: 'equipments_with_deviations' },
      { name: 'Gomería', tabSlug: 'gomeria' },
    ],
  },
  {
    name: 'Almacenes',
    moduleSlug: 'almacenes',
    href: '/dashboard/warehouse',
    icon: MODULE_ICONS.almacenes,
    position: 9,
    items: [
      { name: 'Stock', tabSlug: 'stock' },
      { name: 'Movimientos', tabSlug: 'movimientos' },
      { name: 'Préstamos', tabSlug: 'prestamos' },
      { name: 'Pedidos', tabSlug: 'pedidos' },
      { name: 'Materiales', tabSlug: 'materiales' },
      { name: 'Depósitos', tabSlug: 'depositos' },
      { name: 'Configuración', tabSlug: 'config-almacen' },
    ],
  },
  {
    name: 'Compras',
    moduleSlug: 'compras',
    href: '/dashboard/purchases',
    icon: MODULE_ICONS.compras,
    position: 10,
    items: [
      { name: 'Solicitudes', tabSlug: 'solicitudes' },
      { name: 'Cotizaciones', tabSlug: 'cotizaciones' },
      { name: 'Órdenes de compra', tabSlug: 'ordenes' },
      { name: 'Recepciones', tabSlug: 'recepciones' },
      { name: 'Facturas', tabSlug: 'facturas' },
      { name: 'Pagos', tabSlug: 'pagos' },
      { name: 'Retenciones', tabSlug: 'retenciones' },
      { name: 'Libro IVA', tabSlug: 'libro-iva' },
      { name: 'Proveedores', tabSlug: 'proveedores' },
      { name: 'Configuración', tabSlug: 'config-compras' },
    ],
  },
  {
    name: 'Tesorería',
    moduleSlug: 'tesoreria',
    href: '/dashboard/treasury',
    icon: MODULE_ICONS.tesoreria,
    position: 11,
    items: [
      { name: 'Cuentas', tabSlug: 'cuentas' },
      { name: 'Movimientos', tabSlug: 'movimientos' },
      { name: 'Transferencias', tabSlug: 'transferencias' },
      { name: 'Cobranzas', tabSlug: 'cobranzas' },
      { name: 'Retenciones sufridas', tabSlug: 'retenciones-sufridas' },
      { name: 'Configuración', tabSlug: 'config-tesoreria' },
    ],
  },
  {
    name: 'Formularios',
    moduleSlug: 'formularios',
    href: '/dashboard/forms',
    icon: MODULE_ICONS.formularios,
    position: 12,
  },
  {
    name: 'Ayuda',
    moduleSlug: 'ayuda',
    href: '/dashboard/help',
    icon: MODULE_ICONS.ayuda,
    position: 13,
    items: [
      { name: 'Tickets', tabSlug: 'tickets', badge: 'support-tickets' },
      { name: 'Manual de uso', tabSlug: 'manual' },
    ],
  },
  {
    name: 'Configuración',
    moduleSlug: 'configuracion',
    href: '/dashboard/configuration',
    icon: MODULE_ICONS.configuracion,
    position: 14,
    items: [
      { name: 'General', tabSlug: 'general' },
      { name: 'RRHH', tabSlug: 'rrhh' },
      { name: 'Equipos', tabSlug: 'vehicles' },
      { name: 'Mantenimiento', tabSlug: 'mantenimiento' },
      { name: 'Documentos', tabSlug: 'documentos' },
    ],
  },
];

/**
 * Iconos por tab, para los sub-items. Son los mismos que usa cada modulo en el label de su
 * `TabsManagerServer`: el precedente manda, para que la tab se vea igual en los dos lados.
 * La clave es `<moduleSlug>:<tabSlug>` porque hay slugs repetidos entre modulos
 * (`documentos-de-equipos` esta en documentacion y en el detalle del equipo, `vehicles` en
 * equipos y configuracion).
 */
export const SUB_ITEM_ICONS: Record<string, NavIcon> = {
  'dashboard:principal': House,
  'dashboard:documentacion': FileText,
  'dashboard:estadisticas': ChartColumn,
  'configuracion:general': Building2,
  'configuracion:rrhh': Users,
  'configuracion:vehicles': Truck,
  'configuracion:mantenimiento': Wrench,
  'configuracion:documentos': FileType,
  'empleados:employees': Users,
  'empleados:diagrams': GitBranch,
  'equipos:vehicles': Car,
  'equipos:others': Package,
  'equipos:inactive': XCircle,
  'documentacion:documentos-de-empleados': Users,
  'documentacion:documentos-de-equipos': Truck,
  'documentacion:documentos-de-empresa': Building2,
  'operaciones:preparte': Package,
  'operaciones:dailyreportstable': ClipboardList,
  'mantenimiento:maint_operaciones': ClipboardList,
  'mantenimiento:workshop_view': Building2,
  'mantenimiento:maint_taller': Warehouse,
  'mantenimiento:nuevo_pedido': Plus,
  'mantenimiento:equipments_with_deviations': TriangleAlert,
  'mantenimiento:gomeria': CircleDot,
  'almacenes:stock': Layers,
  'almacenes:movimientos': ArrowLeftRight,
  'almacenes:prestamos': HandHelping,
  'almacenes:pedidos': ClipboardList,
  'almacenes:materiales': Package,
  'almacenes:depositos': Warehouse,
  'almacenes:config-almacen': Settings,
  'compras:solicitudes': ClipboardList,
  'compras:cotizaciones': FileQuestion,
  'compras:ordenes': FileCheck,
  'compras:recepciones': PackageCheck,
  'compras:facturas': ReceiptText,
  'compras:pagos': Banknote,
  'compras:retenciones': Percent,
  'compras:libro-iva': BookOpenText,
  'compras:proveedores': Truck,
  'compras:config-compras': Settings,
  'tesoreria:cuentas': Landmark,
  'tesoreria:movimientos': ArrowLeftRight,
  'tesoreria:transferencias': Repeat,
  'tesoreria:cobranzas': HandCoins,
  'tesoreria:retenciones-sufridas': Percent,
  'tesoreria:config-tesoreria': Settings,
  'ayuda:tickets': LifeBuoy,
  'ayuda:manual': BookOpen,
};
