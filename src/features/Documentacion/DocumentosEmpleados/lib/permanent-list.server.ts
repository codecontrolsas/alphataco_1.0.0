import 'server-only';

import { assertDocumentListAccess } from '../../lists-shared/document-list-server';
import { loadEmployeeDocumentRows } from './employee-document-rows.server';

/**
 * Filas de la lista de permanentes de UN empleado (la de su ficha, que incluye "ya no aplica"),
 * calculadas por el motor de cumplimiento. Exige el permiso `view` de la subtab. Comparte la caché por
 * request con la pestaña Documentación y la cabecera de la ficha (misma clave: empresa, empleado).
 */
export async function loadEmployeePermanentRows(employeeId: string) {
  const { companyId, canViewPrivate } = await assertDocumentListAccess('docs-empleados-permanentes');
  return loadEmployeeDocumentRows(companyId, false, canViewPrivate, employeeId);
}
