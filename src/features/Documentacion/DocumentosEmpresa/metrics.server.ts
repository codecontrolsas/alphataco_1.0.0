import { toDocumentStateCounts } from '@/features/Documentacion/shared/lib/state-counts';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('Documentacion/DocumentosEmpresa/metrics.server');

/**
 * Tarjetas por estado de los documentos de la empresa. Mismo universo que la tabla
 * (`buildWhereClause` en `actions.server.ts`): documentos de la empresa activa, permanentes o
 * mensuales según la pestaña, respetando el permiso de tipos privados. Sin los filtros del usuario.
 */
export async function getCompanyDocumentStateCounts(isMonthly: boolean) {
  const companyId = await getActiveCompanyId();

  try {
    const canViewPrivate = await checkPermissionServer('documentacion', 'documentos-de-empresa', 'view_private');
    const rows = await prisma.documents_company.groupBy({
      by: ['state'],
      where: {
        applies: companyId,
        document_types: { is_it_montlhy: isMonthly, ...(!canViewPrivate && { private: { not: true } }) },
      },
      _count: { _all: true },
    });
    return toDocumentStateCounts(rows);
  } catch (error) {
    logger.error('Error al obtener las métricas de documentos de empresa', { data: { error, isMonthly } });
    throw error;
  }
}
