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

/**
 * Grupos del menú (mapa v2, `docs/rediseno-ui/etapa-0/mapa-nuevo.md`): el menú se agrupa por lo que
 * hace la empresa y no por tipo de registro. Un link sin `group` va arriba de todo (Hoy); `pie`
 * queda pegado al final del menú (Ajustes, Soporte).
 */
export type NavGroup = 'trabajo' | 'recursos' | 'control' | 'negocio' | 'pie';

/** Rótulo visible de cada grupo, en el orden en que se dibujan. `pie` no lleva rótulo. */
export const NAV_GROUP_LABELS: Record<Exclude<NavGroup, 'pie'>, string> = {
  trabajo: 'Trabajo',
  recursos: 'Recursos',
  control: 'Control',
  negocio: 'Negocio',
};

/** Contadores que puede llevar un item del sidebar. */
export type NavBadge = 'support-tickets';

export type NavigationLink = {
  name: string;
  moduleSlug: ModuleSlug;
  href: string;
  icon: NavIcon;
  position: number;
  /** Grupo del menú; sin grupo, el link va primero y sin rótulo. */
  group?: NavGroup;
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
    name: 'Hoy',
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
    name: 'Personas',
    moduleSlug: 'empleados',
    href: '/dashboard/employee',
    icon: MODULE_ICONS.empleados,
    position: 5,
    group: 'recursos',
    items: [
      { name: 'Empleados', tabSlug: 'employees' },
      { name: 'Diagramas', tabSlug: 'diagrams' },
    ],
  },
  {
    // Una sola seccion: se dibuja como link directo, sin desplegable.
    name: 'Ingresos',
    moduleSlug: 'seleccion',
    href: '/dashboard/recruitment',
    icon: MODULE_ICONS.seleccion,
    position: 6,
    group: 'recursos',
  },
  {
    name: 'Flota',
    moduleSlug: 'equipos',
    href: '/dashboard/equipment',
    icon: MODULE_ICONS.equipos,
    position: 7,
    group: 'recursos',
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
    name: 'Clientes',
    moduleSlug: 'comercial',
    href: '/dashboard/comercial',
    icon: MODULE_ICONS.comercial,
    position: 10,
    group: 'negocio',
  },
  {
    name: 'Cumplimiento',
    moduleSlug: 'documentacion',
    href: '/dashboard/document',
    icon: MODULE_ICONS.documentacion,
    position: 8,
    group: 'control',
    items: [
      { name: 'Documentos de Empleados', tabSlug: 'documentos-de-empleados' },
      { name: 'Documentos de Equipos', tabSlug: 'documentos-de-equipos' },
      { name: 'Documentos de Empresa', tabSlug: 'documentos-de-empresa' },
    ],
  },
  {
    name: 'Servicios',
    moduleSlug: 'operaciones',
    href: '/dashboard/operations',
    icon: MODULE_ICONS.operaciones,
    position: 2,
    group: 'trabajo',
    items: [
      { name: 'Gestor de Pedidos', tabSlug: 'preparte' },
      { name: 'Partes Diarios', tabSlug: 'dailyreportstable' },
    ],
  },
  {
    name: 'Taller',
    moduleSlug: 'mantenimiento',
    href: '/dashboard/maintenance',
    icon: MODULE_ICONS.mantenimiento,
    position: 3,
    group: 'trabajo',
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
    name: 'Depósito',
    moduleSlug: 'almacenes',
    href: '/dashboard/warehouse',
    icon: MODULE_ICONS.almacenes,
    position: 4,
    group: 'trabajo',
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
    name: 'Inspecciones',
    moduleSlug: 'formularios',
    href: '/dashboard/forms',
    icon: MODULE_ICONS.formularios,
    position: 9,
    group: 'control',
  },
  {
    name: 'Soporte',
    moduleSlug: 'ayuda',
    href: '/dashboard/help',
    icon: MODULE_ICONS.ayuda,
    position: 12,
    group: 'pie',
    items: [
      { name: 'Tickets', tabSlug: 'tickets', badge: 'support-tickets' },
      { name: 'Manual de uso', tabSlug: 'manual' },
    ],
  },
  {
    name: 'Ajustes',
    moduleSlug: 'configuracion',
    href: '/dashboard/configuration',
    icon: MODULE_ICONS.configuracion,
    position: 11,
    group: 'pie',
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
