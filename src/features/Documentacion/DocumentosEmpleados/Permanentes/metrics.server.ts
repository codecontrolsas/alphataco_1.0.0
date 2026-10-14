import { toDocumentStateCounts } from '@/features/Documentacion/shared/lib/state-counts';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('DocumentosEmpleadosPermanentes/metrics.server');

/**
 * Tarjetas por estado de los documentos permanentes de empleados. Mismo universo que la tabla
 * (`buildWhereClause` en `actions.server.ts`): empleados activos de la empresa, tipos permanentes,
 * sin archivados y respetando el permiso de tipos privados. Sin los filtros del usuario.
 */
export async function getEmployeePermanentDocumentStateCounts() {
  const companyId = await getActiveCompanyId();

  try {
    const canViewPrivate = await checkPermissionServer('documentacion', 'documentos-de-empleados', 'view_private');
    const rows = await prisma.documents_employees.groupBy({
      by: ['state'],
      where: {
        archived_at: null,
        employees: { company_id: companyId, is_active: true },
        document_types: { is_it_montlhy: false, ...(!canViewPrivate && { private: { not: true } }) },
      },
      _count: { _all: true },
    });
    return toDocumentStateCounts(rows);
  } catch (error) {
    logger.error('Error al obtener las métricas de documentos permanentes de empleados', { data: { error } });
    throw error;
  }
}
