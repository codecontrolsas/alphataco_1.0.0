import { countRowStates } from '@/features/Documentacion/shared/lib/state-counts';
import { Logger } from '@/lib/logger';
import { loadAuthorizedCompanyDocumentRows } from './lib/company-document-rows.server';

const logger = new Logger('Documentacion/DocumentosEmpresa/metrics.server');

/**
 * Tarjetas por estado de los documentos de la empresa. Salen de las MISMAS filas que la tabla
 * (motor de cumplimiento, permanentes o mensuales según la pestaña), sin los filtros del usuario.
 * `pendiente` son las filas faltantes.
 */
export async function getCompanyDocumentStateCounts(isMonthly: boolean) {
  try {
    return countRowStates(await loadAuthorizedCompanyDocumentRows(isMonthly));
  } catch (error) {
    logger.error('Error al obtener las métricas de documentos de empresa', { data: { error, isMonthly } });
    throw error;
  }
}
