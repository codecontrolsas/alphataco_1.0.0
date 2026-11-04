import { visibleWidgetIdsFor } from '@/features/Dashboard/Boards/lib/boards.server';
import {
  ALL_WIDGET_PERMISSION_KEYS,
  getWidgetDefinition,
  type WidgetId,
} from '@/features/Dashboard/lib/widget-registry';
import type { ModuleKey } from '@/features/Modules/catalog';
import { isSupportedWidget } from '../contracts/dashboards';
import type { MobileKeyPermissions } from '../lib/user-permissions';

/**
 * Qué puede ver de los tableros el usuario de la app móvil, con la regla de la web:
 *
 * - Un widget se ve si el usuario tiene TODAS las claves de `requires` y algún grupo completo de `requiresAny`
 *   (`isWidgetGranted`), y su sección está activa (#802). Es `visibleWidgetIdsFor`, la misma función que usa
 *   `getVisibleWidgetIds` de la web, alimentada con los permisos explícitos del usuario (`user_has_permission`).
 * - Además, la app no ofrece un widget cuyo módulo dueño de los datos esté apagado para la empresa (`WIDGET_MODULES`).
 * - Fuentes de los widgets de documentos: `dashboard:<empleados|vehiculos>:view` + `documentacion:<documentos-de-…>:view`
 *   y los módulos de la clase; los tipos privados, solo con `view_private`.
 */

/** Módulos (además de `movil` y `nucleo`) de los que depende cada widget que la app calcula. */
const WIDGET_MODULES: Record<string, readonly ModuleKey[]> = {
  'kpi-employees': ['empleados'],
  'kpi-active-vehicles': ['equipos'],
  'kpi-operative-fleet': ['equipos', 'operaciones'],
  'kpi-operativity': ['equipos', 'operaciones'],
  'kpi-today-services': ['operaciones'],
  'services-today': ['operaciones'],
  'hr-today': ['empleados', 'operaciones'],
  'equipment-operation': ['equipos', 'operaciones'],
  'document-compliance': ['documentacion'],
  'expiring-weeks': ['documentacion'],
  'expiring-timeline': ['documentacion'],
  'expiring-employee-docs': ['documentacion', 'empleados'],
  'expiring-vehicle-docs': ['documentacion', 'equipos'],
  'hr-summary': ['empleados'],
  'hr-absenteeism-trend': ['empleados'],
  'hr-absence-reasons': ['empleados'],
  'hr-department-summary': ['empleados'],
  'hr-daily-absence': ['empleados'],
  'hr-distribution': ['empleados'],
  'hr-headcount-trend': ['empleados'],
  'hr-employee-absence': ['empleados'],
};

export function resolveDashboardAccess(perms: MobileKeyPermissions, enabledModules: ReadonlySet<string>) {
  const granted = new Set(ALL_WIDGET_PERMISSION_KEYS.filter((key) => perms.hasKey(key)));
  const visible = visibleWidgetIdsFor(granted);

  const employeeDocs =
    perms.hasKey('dashboard:empleados:view') &&
    perms.hasKey('documentacion:documentos-de-empleados:view') &&
    enabledModules.has('documentacion') &&
    enabledModules.has('empleados');
  const vehicleDocs =
    perms.hasKey('dashboard:vehiculos:view') &&
    perms.hasKey('documentacion:documentos-de-equipos:view') &&
    enabledModules.has('documentacion') &&
    enabledModules.has('equipos');

  /** El widget es visible para el rol y, si la app lo calcula, sus módulos están encendidos. */
  const canSeeWidget = (id: WidgetId): boolean => {
    if (!visible.has(id)) return false;
    if (!isSupportedWidget(id)) return true;
    return (WIDGET_MODULES[id] ?? []).every((module) => enabledModules.has(module));
  };

  const visibleWidgets = [...visible].filter(canSeeWidget);

  return {
    /** Widgets que la web le muestra (permisos y secciones activas); la base de los tableros que se listan. */
    visibleIds: visible,
    /** Ve al menos un widget: si no, la app no ofrece tableros. */
    available: visibleWidgets.length > 0,
    canSeeWidget,
    widgetTitle: (id: string) => getWidgetDefinition(id)?.title ?? id,
    documents: {
      employees: employeeDocs,
      vehicles: vehicleDocs,
      privateEmployees: perms.has('documentacion:documentos-de-empleados:view_private'),
      privateVehicles: perms.has('documentacion:documentos-de-equipos:view_private'),
    },
  };
}

export type DashboardAccess = ReturnType<typeof resolveDashboardAccess>;
