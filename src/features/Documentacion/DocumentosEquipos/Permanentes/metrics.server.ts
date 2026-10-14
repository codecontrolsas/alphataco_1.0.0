import 'server-only';

import { Logger } from '@/lib/logger';
import { stateCountsOf } from '../../lists-shared/document-list-server';
import { loadEquipmentDocumentRows } from '../lib/equipment-document-rows.server';

const logger = new Logger('DocumentosEquiposPermanentes/metrics.server');

/**
 * Tarjetas por estado de los documentos permanentes de equipos. Salen de las MISMAS filas que la tabla (motor de cumplimiento, respetando
 * el permiso de tipos privados), sin los filtros del usuario, y exigen el mismo permiso `view`.
 * `pendiente` son las filas faltantes.
 */
export async function getEquipmentPermanentDocumentStateCounts() {
  try {
    return await stateCountsOf('docs-equipos-permanentes', ({ companyId, canViewPrivate }) =>
      loadEquipmentDocumentRows(companyId, false, canViewPrivate, '')
    );
  } catch (error) {
    logger.error('Error al obtener las métricas de los documentos permanentes de equipos', { data: { error } });
    throw error;
  }
}
