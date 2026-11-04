import type { ModuleKey } from '@/features/Modules/catalog';
import { resolveDashboardAccess } from '../dashboards/access';
import { allowedResources, resolveDocumentAccess } from '../documents/access';
import { resolveEmployeeAccess } from '../employees/access';
import { resolveEquipmentAccess } from '../equipment/access';
import type { MobileKeyPermissions } from '../lib/user-permissions';
import { resolveTrainingAccess } from '../trainings/access';

/**
 * Qué grupos de la búsqueda global puede ver el usuario: cada grupo exige lo MISMO que la lista de su pantalla (permiso
 * de la lista web y módulo de la clase encendido). Un grupo sin permiso no aparece. Lo usan `/search` y `/me`.
 */

/** Destinos que la app ofrece como «módulos» (búsqueda por nombre): clave estable, nombre y sinónimos. */
const APP_MODULES: { key: string; name: string; keywords: readonly string[]; allowed: (a: SearchAccess) => boolean }[] = [
  { key: 'employees', name: 'Empleados', keywords: ['personal', 'legajo', 'legajos'], allowed: (a) => a.groups.employees },
  { key: 'equipment', name: 'Equipos', keywords: ['flota', 'vehiculos', 'vehículos', 'equipamiento'], allowed: (a) => a.groups.equipment },
  { key: 'documents', name: 'Documentación', keywords: ['documentos', 'vencimientos'], allowed: (a) => a.groups.documents },
  { key: 'daily-reports', name: 'Partes diarios', keywords: ['parte', 'operaciones', 'servicios'], allowed: (a) => a.groups['daily-reports'] },
  { key: 'trainings', name: 'Capacitaciones', keywords: ['cursos', 'hse', 'examenes', 'exámenes'], allowed: (a) => a.groups.trainings },
  { key: 'dashboards', name: 'Tableros', keywords: ['inicio', 'resumen', 'indicadores'], allowed: (a) => a.dashboards },
  { key: 'notifications', name: 'Avisos', keywords: ['notificaciones', 'alertas'], allowed: () => true },
];

export function resolveSearchAccess(perms: MobileKeyPermissions, enabled: ReadonlySet<string>) {
  const employees = resolveEmployeeAccess(perms);
  const equipment = resolveEquipmentAccess(perms);
  const documents = resolveDocumentAccess(perms);
  const training = resolveTrainingAccess(perms);
  const dashboards = resolveDashboardAccess(perms, enabled).available;
  const on = (module: ModuleKey) => enabled.has(module);

  const groups = {
    employees: on('empleados') && (employees.listActive || employees.listInactive),
    equipment:
      on('equipos') && (equipment.vehicle.listActive || equipment.other.listActive || equipment.vehicle.listInactive),
    documents: on('documentacion') && allowedResources(documents, enabled).length > 0,
    trainings: on('hse') && training.list,
    'daily-reports': on('operaciones') && perms.has('operaciones:detalle-parte-diario:view'),
    modules: true,
  };

  return { employees, equipment, documents, training, dashboards, groups };
}

export type SearchAccess = ReturnType<typeof resolveSearchAccess>;

export function searchableGroups(access: SearchAccess) {
  return (Object.entries(access.groups) as [keyof SearchAccess['groups'], boolean][])
    .filter(([, allowed]) => allowed)
    .map(([type]) => type);
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Destinos de la app que coinciden con la consulta (nombre o sinónimos) y que el usuario puede abrir. */
export function matchAppModules(access: SearchAccess, q: string) {
  const needle = fold(q);
  return APP_MODULES.filter(
    (module) =>
      module.allowed(access) && [module.name, ...module.keywords].some((text) => fold(text).includes(needle))
  ).map(({ key, name }) => ({ key, name }));
}
