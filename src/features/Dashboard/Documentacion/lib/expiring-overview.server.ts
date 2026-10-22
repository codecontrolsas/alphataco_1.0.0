import 'server-only';

import { canViewDashboard, type DashboardTab } from '@/features/Dashboard/lib/permissions.server';
import { arToday, daysUntil, parseValidity } from '@/features/Documentacion/shared/compliance/dates';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { cache } from 'react';
import type { DocumentResourceKind } from './document-list-links';
import { bucketExpiringDays, type ExpiringSeries } from './expiring-buckets';
import { loadEmployeeExpiringRows, loadVehicleExpiringRows } from './expiring-rows.server';

const logger = new Logger('features/Dashboard/Documentacion/expiring-overview');

/** Resultado de una fuente: sin permiso y error de carga se distinguen para no mostrar un "0" que engaña. */
export type ExpiringSource = { status: 'ok'; series: ExpiringSeries } | { status: 'forbidden' } | { status: 'error' };

export interface ExpiringOverview {
  /** Hoy en hora argentina (`YYYY-MM-DD`): base de todos los cálculos de días. */
  today: string;
  employees: ExpiringSource;
  vehicles: ExpiringSource;
}

const SOURCES = {
  employees: { dashboardTab: 'empleados', documentTab: 'documentos-de-empleados', load: loadEmployeeExpiringRows },
  vehicles: { dashboardTab: 'vehiculos', documentTab: 'documentos-de-equipos', load: loadVehicleExpiringRows },
} as const satisfies Record<
  DocumentResourceKind,
  { dashboardTab: DashboardTab; documentTab: string; load: () => Promise<ReadonlyArray<{ validity: Date | null }>> }
>;

/** Mismas claves que exigen los widgets `expiring-*-docs`: `dashboard:<x>:view` + `documentacion:<doc>:view`. */
async function loadSource(kind: DocumentResourceKind, today: string): Promise<ExpiringSource> {
  const source = SOURCES[kind];
  const [canDashboard, canDocuments] = await Promise.all([
    canViewDashboard(source.dashboardTab),
    checkPermissionServer('documentacion', source.documentTab, 'view'),
  ]);
  if (!canDashboard || !canDocuments) return { status: 'forbidden' };

  try {
    const rows = await source.load();
    const daysLeft = rows.flatMap((row) => {
      const day = parseValidity(row.validity);
      return day === null ? [] : [daysUntil(day, today)];
    });
    return { status: 'ok', series: bucketExpiringDays(daysLeft) };
  } catch (error) {
    logger.error('Error al calcular los próximos vencimientos', { data: { error, kind } });
    return { status: 'error' };
  }
}

/**
 * Próximos vencimientos de personal y de equipos para la línea de tiempo y las barras semanales.
 * Parte de las filas de las listas `expiring-*-docs` (memoizadas por request): las dos fuentes y los dos
 * widgets comparten UNA carga por tipo de recurso, sin consultas nuevas.
 */
export const loadExpiringOverview = cache(async (): Promise<ExpiringOverview> => {
  const today = arToday();
  const [employees, vehicles] = await Promise.all([loadSource('employees', today), loadSource('vehicles', today)]);
  return { today, employees, vehicles };
});
