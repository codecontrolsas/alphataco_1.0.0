import { toDocumentStateCounts } from '@/features/Documentacion/shared/lib/state-counts';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('MonthlyEquipmentDocs/metrics.server');

/**
 * Tarjetas por estado de los documentos mensuales de equipos. Mismo universo que la tabla
 * (`buildWhereClause` en `actions.server.ts`): equipos activos de la empresa, tipos mensuales
 * activos, sin archivados y respetando el permiso de tipos privados. Sin los filtros del usuario.
 */
export async function getMonthlyEquipmentDocumentStateCounts() {
  const companyId = await getActiveCompanyId();

  try {
    const canViewPrivate = await checkPermissionServer('documentacion', 'documentos-de-equipos', 'view_private');
    const rows = await prisma.documents_equipment.groupBy({
      by: ['state'],
      where: {
        archived_at: null,
        vehicles: { company_id: companyId, is_active: true },
        document_types: { is_it_montlhy: true, is_active: true, ...(!canViewPrivate && { private: { not: true } }) },
      },
      _count: { _all: true },
    });
    return toDocumentStateCounts(rows);
  } catch (error) {
    logger.error('Error al obtener las métricas de documentos mensuales de equipos', { data: { error } });
    throw error;
  }
}
