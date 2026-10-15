/**
 * Texto en lenguaje natural de lo que habilita un conjunto de permisos ("Qué puede hacer"),
 * y el estado de cada módulo para el rail del editor. Puro, sin React.
 */

import { sortActions } from './action-order';
import { keysOfTabs, moduleTabIds, permissionKey, type PermissionIndex } from './permission-rules';
import type { PermissionModule, PermissionTab } from './permission-types';

export type ModuleAccessStatus = 'none' | 'view' | 'full' | 'custom';

export const MODULE_STATUS_LABEL: Record<ModuleAccessStatus, string> = {
  none: 'Sin acceso',
  view: 'Solo ver',
  full: 'Completo',
  custom: 'Personalizado',
};

export interface ModuleAccess {
  granted: number;
  total: number;
  status: ModuleAccessStatus;
}

export function getGroupAccess(index: PermissionIndex, tabIds: string[], granted: ReadonlySet<string>): ModuleAccess {
  const keys = keysOfTabs(index, tabIds);
  let grantedCount = 0;
  let onlyViews = true;
  for (const key of keys) {
    if (!granted.has(key)) continue;
    grantedCount += 1;
    if (index.slugByKey.get(key) !== 'view') onlyViews = false;
  }
  const status: ModuleAccessStatus =
    grantedCount === 0 ? 'none' : grantedCount === keys.length ? 'full' : onlyViews ? 'view' : 'custom';
  return { granted: grantedCount, total: keys.length, status };
}

export function getModuleAccess(index: PermissionIndex, module: PermissionModule, granted: ReadonlySet<string>) {
  return getGroupAccess(index, moduleTabIds(index, module), granted);
}

/** "ver, crear y editar" */
export function joinSpanish(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase('es') + text.slice(1);

export interface TabSummaryLine {
  tabId: string;
  /** "Solicitudes" o "Equipos › Documentos" para sub-pestañas */
  path: string;
  /** "ver, crear y aprobar; sin importes" */
  text: string;
  /** "ver, crear y aprobar" */
  actionsText: string;
  /** La vista tiene importes y no se ven */
  missesPrices: boolean;
}

/** Una línea por pestaña con acceso: qué acciones tiene y si le faltan los importes. */
export function summarizeModule(module: PermissionModule, granted: ReadonlySet<string>): TabSummaryLine[] {
  const lines: TabSummaryLine[] = [];

  const visit = (tab: PermissionTab, parents: string[]) => {
    const path = [...parents, tab.name];
    const active = sortActions(tab.actions).filter((action) => granted.has(permissionKey(tab.id, action.id)));
    if (active.length > 0) {
      const names = active.map((action) => lowerFirst(action.name));
      const pricesAction = tab.actions.find((action) => action.slug === 'view_prices');
      const missesPrices = !!pricesAction && !granted.has(permissionKey(tab.id, pricesAction.id));
      const actionsText = joinSpanish(names);
      lines.push({
        tabId: tab.id,
        path: path.join(' › '),
        text: `${actionsText}${missesPrices ? '; sin importes' : ''}`,
        actionsText,
        missesPrices,
      });
    }
    for (const subtab of tab.subtabs) visit(subtab, path);
  };

  for (const tab of module.tabs) visit(tab, []);
  return lines;
}

export interface ModuleSummary {
  module: PermissionModule;
  access: ModuleAccess;
  lines: TabSummaryLine[];
}

/** Resumen de todos los módulos con algún acceso, en el orden del menú. */
export function summarizeAccess(
  index: PermissionIndex,
  modules: PermissionModule[],
  granted: ReadonlySet<string>
): ModuleSummary[] {
  return modules
    .map((module) => ({ module, access: getModuleAccess(index, module, granted), lines: [] as TabSummaryLine[] }))
    .filter((entry) => entry.access.granted > 0)
    .map((entry) => ({ ...entry, lines: summarizeModule(entry.module, granted) }));
}

/** Diferencias del acceso efectivo de un usuario contra lo que le dan sus roles. */
export function diffAgainstRoles(
  index: PermissionIndex,
  effective: ReadonlySet<string>,
  fromRoles: ReadonlySet<string>
) {
  let extra = 0;
  let removed = 0;
  for (const key of index.allKeys) {
    const isEffective = effective.has(key);
    const isFromRoles = fromRoles.has(key);
    if (isEffective && !isFromRoles) extra += 1;
    if (!isEffective && isFromRoles) removed += 1;
  }
  return { extra, removed };
}

const upperFirst = (text: string) => text.charAt(0).toLocaleUpperCase('es') + text.slice(1);

/**
 * Resumen corto de un módulo para el encabezado del panel: agrupa las vistas que tienen las
 * mismas acciones ("Ver, crear y editar en 4 vistas. Ver en Resumen y Análisis").
 */
export function summarizeModuleBrief(lines: TabSummaryLine[]): string {
  if (lines.length === 0) return '';
  const groups = new Map<string, { line: TabSummaryLine; paths: string[] }>();
  for (const line of lines) {
    const group = groups.get(line.text);
    if (group) group.paths.push(line.path);
    else groups.set(line.text, { line, paths: [line.path] });
  }
  return Array.from(groups.values())
    .sort((a, b) => b.paths.length - a.paths.length)
    .map(({ line, paths }) => {
      const where = paths.length > 3 ? `${paths.length} vistas` : joinSpanish(paths);
      return `${upperFirst(line.actionsText)} en ${where}${line.missesPrices ? ' (sin importes)' : ''}`;
    })
    .join('. ');
}
