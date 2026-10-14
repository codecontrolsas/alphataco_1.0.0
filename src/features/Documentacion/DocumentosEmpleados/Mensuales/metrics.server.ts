import 'server-only';

import { Logger } from '@/lib/logger';
import { stateCountsOf } from '../../lists-shared/document-list-server';
import { loadEmployeeDocumentRows } from '../lib/employee-document-rows.server';

const logger = new Logger('MonthlyEmployeeDocs/metrics.server');

/**
 * Tarjetas por estado de los documentos mensuales de empleados. Salen de las MISMAS filas que la tabla (motor de cumplimiento, respetando
 * el permiso de tipos privados), sin los filtros del usuario, y exigen el mismo permiso `view`.
 * `pendiente` son las filas faltantes.
 */
export async function getMonthlyEmployeeDocumentStateCounts() {
  try {
    return await stateCountsOf('docs-empleados-mensuales', ({ companyId, canViewPrivate }) =>
      loadEmployeeDocumentRows(companyId, true, canViewPrivate, '')
    );
  } catch (error) {
    logger.error('Error al obtener las métricas de los documentos mensuales de empleados', { data: { error } });
    throw error;
  }
}
