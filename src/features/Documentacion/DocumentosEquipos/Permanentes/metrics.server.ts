import { toDocumentStateCounts } from '@/features/Documentacion/shared/lib/state-counts';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { buildBaseWhereClause } from './lib/where';

const logger = new Logger('DocumentosEquiposPermanentes/metrics.server');

/**
 * Tarjetas por estado de los documentos permanentes de equipos. Usa el mismo WHERE base que la
 * tabla (`buildBaseWhereClause`: equipos activos de la empresa, tipos permanentes activos, sin
 * archivados, permiso de tipos privados) y no aplica los filtros del usuario.
 */
export async function getEquipmentPermanentDocumentStateCounts() {
  const companyId = await getActiveCompanyId();

  try {
    const rows = await prisma.documents_equipment.groupBy({
      by: ['state'],
      where: await buildBaseWhereClause(companyId),
      _count: { _all: true },
    });
    return toDocumentStateCounts(rows);
  } catch (error) {
    logger.error('Error al obtener las métricas de documentos permanentes de equipos', { data: { error } });
    throw error;
  }
}
