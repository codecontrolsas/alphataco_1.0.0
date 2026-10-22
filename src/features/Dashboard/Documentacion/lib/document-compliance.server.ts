import 'server-only';

import { canViewDashboard } from '@/features/Dashboard/lib/permissions.server';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import type { DocumentResourceKind } from './document-list-links';

const logger = new Logger('features/Dashboard/Documentacion/document-compliance');

/** Cuántos recursos activos hay en cada estado documental (`status` guardado por el motor de cumplimiento). */
export interface ComplianceCounts {
  /** Documentación al día. */
  complete: number;
  /** Completo, pero con algún documento vencido. */
  expired: number;
  /** Faltan o hay documentos rechazados. */
  incomplete: number;
  total: number;
}

export type ComplianceSource =
  | { status: 'ok'; counts: ComplianceCounts }
  | { status: 'forbidden' }
  | { status: 'error' };

interface StatusGroup {
  status: string | null;
  count: number;
}

function toCounts(groups: readonly StatusGroup[]): ComplianceCounts {
  const counts: ComplianceCounts = { complete: 0, expired: 0, incomplete: 0, total: 0 };
  for (const { status, count } of groups) {
    if (status === 'Completo') counts.complete += count;
    else if (status === 'Completo_con_doc_vencida') counts.expired += count;
    else if (status === 'Incompleto') counts.incomplete += count;
    else continue; // Avalado / sin estado: no es documental.
    counts.total += count;
  }
  return counts;
}

/** Una consulta agrupada por tipo de recurso (la misma que usan las tarjetas de sus listados), acotada a la empresa activa. */
async function countEmployeesByStatus(companyId: string): Promise<StatusGroup[]> {
  const rows = await prisma.employees.groupBy({
    by: ['status'],
    where: { company_id: companyId, is_active: true },
    _count: { _all: true },
  });
  return rows.map((row) => ({ status: row.status, count: row._count._all }));
}

async function countVehiclesByStatus(companyId: string): Promise<StatusGroup[]> {
  const rows = await prisma.vehicles.groupBy({
    by: ['status'],
    where: { company_id: companyId, is_active: true },
    _count: { _all: true },
  });
  return rows.map((row) => ({ status: row.status, count: row._count._all }));
}

const GROUP_BY = {
  employees: countEmployeesByStatus,
  vehicles: countVehiclesByStatus,
} as const satisfies Record<DocumentResourceKind, (companyId: string) => Promise<StatusGroup[]>>;

const PERMISSIONS = {
  employees: { dashboardTab: 'empleados', documentTab: 'documentos-de-empleados' },
  vehicles: { dashboardTab: 'vehiculos', documentTab: 'documentos-de-equipos' },
} as const;

export const loadComplianceCounts = cache(async (kind: DocumentResourceKind): Promise<ComplianceSource> => {
  const { dashboardTab, documentTab } = PERMISSIONS[kind];
  const [canDashboard, canDocuments] = await Promise.all([
    canViewDashboard(dashboardTab),
    checkPermissionServer('documentacion', documentTab, 'view'),
  ]);
  if (!canDashboard || !canDocuments) return { status: 'forbidden' };

  try {
    return { status: 'ok', counts: toCounts(await GROUP_BY[kind](await getActiveCompanyId())) };
  } catch (error) {
    logger.error('Error al calcular el estado documental', { data: { error, kind } });
    return { status: 'error' };
  }
});
