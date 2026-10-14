import { toDocumentStateCounts } from '@/features/Documentacion/shared/lib/state-counts';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('MonthlyEmployeeDocs/metrics.server');

/**
 * Tarjetas por estado de los documentos mensuales de empleados. Mismo universo que la tabla
 * (`buildWhereClause` en `actions.server.ts`): empleados de la empresa, tipos mensuales activos,
 * sin archivados y respetando el permiso de tipos privados. Sin los filtros del usuario.
 */
export async function getMonthlyEmployeeDocumentStateCounts() {
  const companyId = await getActiveCompanyId();

  try {
    const canViewPrivate = await checkPermissionServer('documentacion', 'documentos-de-empleados', 'view_private');
    const rows = await prisma.documents_employees.groupBy({
      by: ['state'],
      where: {
        archived_at: null,
        employees: { company_id: companyId },
        document_types: { is_it_montlhy: true, is_active: true, ...(!canViewPrivate && { private: { not: true } }) },
      },
      _count: { _all: true },
    });
    return toDocumentStateCounts(rows);
  } catch (error) {
    logger.error('Error al obtener las métricas de documentos mensuales de empleados', { data: { error } });
    throw error;
  }
}
