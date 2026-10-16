import { Logger } from '@/lib/logger';
import { DocumentListAccessError } from '../../lists-shared/document-list-server';
import { summarizeDocumentRows, type DocumentSummary } from '../../shared/compliance/summary';
import { DocumentStatusChip } from '../../shared/components/DocumentStatusChip';
import { loadEquipmentPermanentRows } from '../lib/permanent-list.server';
import { EquipmentDossierZip } from './EquipmentDossierZip';

const logger = new Logger('features/Documentacion/EquipmentDocumentStatus');

/**
 * Estado documental del equipo en la cabecera de su ficha: chip + "N de M vigentes" + descarga del
 * legajo. Usa las MISMAS filas (y la misma caché por request) que la pestaña Documentación y el
 * gemelo, así que no agrega consultas. Sin el permiso de la lista de permanentes se queda solo con el
 * estado guardado; si la carga falla, también (nunca "0 de 0").
 */
export async function EquipmentDocumentStatus({ equipmentId, status }: { equipmentId: string; status: string | null }) {
  let summary: DocumentSummary | null = null;
  let hasFiles = false;
  try {
    const rows = await loadEquipmentPermanentRows(equipmentId);
    summary = summarizeDocumentRows(rows);
    hasFiles = rows.some((row) => !row.isMissing && !row.notApplicable && row.document_path);
  } catch (error) {
    if (!(error instanceof DocumentListAccessError)) {
      logger.warn('No se pudo cargar el estado documental del equipo', { data: { error, equipmentId } });
    }
  }

  return (
    <>
      <DocumentStatusChip status={status} summary={summary} />
      {hasFiles && <EquipmentDossierZip equipmentId={equipmentId} />}
    </>
  );
}
