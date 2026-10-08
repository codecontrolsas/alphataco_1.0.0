import type { ModuleSlug } from '@/features/Permissions/permissions-map';
import { MODULE_ICONS, type ModuleIcon } from '@/shared/constants/module-icons';
import {
  ArrowLeftRight,
  BookOpen,
  Building2,
  ChartColumn,
  CircleDot,
  ClipboardList,
  FileCheck,
  FileText,
  FileType,
  GitBranch,
  HandHelping,
  House,
  Layers,
  LifeBuoy,
  Package,
  Plus,
  Settings,
  TriangleAlert,
  Truck,
  UserPlus,
  Users,
  Warehouse,
  Wrench,
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
  /**
   * De donde leer el permiso, cuando la tab NO pertenece al modulo de este link.
   *
   * Pasa con las pantallas que un modulo MONTA pero no POSEE: Equipos y Empleados muestran
   * "Tipos de Documentos", cuya tab vive en Configuracion. Sin esto el sub-item se filtraba
   * contra un permiso inexistente (`equipos:documentos:view`) y no aparecia nunca, aunque la
   * pagina si montaba la tab — el menu y la pagina decian cosas distintas.
   */
  permission?: { moduleSlug: ModuleSlug; tabSlug: string };
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
 * `tipos-de-documentos` en Equipos y Empleados). Derivarlos del mapa generaria items que
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
      { name: 'Equipos', tabSlug: 'equipos' },
      { name: 'Documentos de Equipos', tabSlug: 'documentos-de-equipos' },
      {
        name: 'Tipos de Documentos',
        tabSlug: 'tipos-de-documentos',
        permission: { moduleSlug: 'configuracion', tabSlug: 'documentos' },
      },
      { name: 'Mantenimiento', tabSlug: 'type_of_repairs' },
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
    name: 'Formularios',
    moduleSlug: 'formularios',
    href: '/dashboard/forms',
    icon: MODULE_ICONS.formularios,
    position: 10,
  },
  {
    name: 'Ayuda',
    moduleSlug: 'ayuda',
    href: '/dashboard/help',
    icon: MODULE_ICONS.ayuda,
    position: 11,
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
    position: 12,
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
 * (`tipos-de-documentos` esta en empleados, equipos y documentacion).
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
  'equipos:equipos': Truck,
  'equipos:documentos-de-equipos': FileText,
  'equipos:tipos-de-documentos': FileType,
  'equipos:type_of_repairs': Wrench,
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
  'ayuda:tickets': LifeBuoy,
  'ayuda:manual': BookOpen,
};
