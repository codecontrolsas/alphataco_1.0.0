import 'server-only';

import { Logger } from '@/lib/logger';
import { stateCountsOf } from '../../lists-shared/document-list-server';
import { loadEmployeeDocumentRows } from '../lib/employee-document-rows.server';

const logger = new Logger('DocumentosEmpleadosPermanentes/metrics.server');

/**
 * Tarjetas por estado de los documentos permanentes de empleados. Salen de las MISMAS filas que la tabla (motor de cumplimiento, respetando
 * el permiso de tipos privados), sin los filtros del usuario, y exigen el mismo permiso `view`.
 * `pendiente` son las filas faltantes.
 */
export async function getEmployeePermanentDocumentStateCounts() {
  try {
    return await stateCountsOf('docs-empleados-permanentes', ({ companyId, canViewPrivate }) =>
      loadEmployeeDocumentRows(companyId, false, canViewPrivate, '')
    );
  } catch (error) {
    logger.error('Error al obtener las métricas de los documentos permanentes de empleados', { data: { error } });
    throw error;
  }
}
