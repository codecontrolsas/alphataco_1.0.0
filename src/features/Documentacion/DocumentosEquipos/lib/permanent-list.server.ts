import 'server-only';

import { assertDocumentListAccess } from '../../lists-shared/document-list-server';
import { equipmentDocumentSpec, loadEquipmentDocumentRows } from './equipment-document-rows.server';

/** En permanentes la columna "Documento" es `document_type` (en mensuales, `documentType`). */
export const EQUIPMENT_PERMANENT_SPEC = equipmentDocumentSpec('document_type');

/**
 * Filas de la lista de permanentes, calculadas por el motor de cumplimiento: por equipo activo y tipo
 * permanente que le aplica, el documento vigente o una fila faltante. Con `equipmentId` es la lista
 * embebida en la ficha del equipo (incluye "ya no aplica"). Exige el permiso `view` de la subtab.
 */
export async function loadEquipmentPermanentRows(equipmentId?: string) {
  const { companyId, canViewPrivate } = await assertDocumentListAccess('docs-equipos-permanentes');
  return loadEquipmentDocumentRows(companyId, false, canViewPrivate, equipmentId ?? '');
}
