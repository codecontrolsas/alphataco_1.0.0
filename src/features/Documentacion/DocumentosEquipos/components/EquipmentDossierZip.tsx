'use client';

import { DocumentsDownloadDialog } from '@/features/Documentacion/lists-shared/DocumentsDownloadDialog';
import { equipmentDocumentLabel } from '@/features/Documentacion/lists-shared/document-list-export';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { getAllEquipmentPermanentDocumentsForExport } from '../Permanentes/queries.server';

/** "Descargar legajo (ZIP)" del equipo: sus documentos permanentes cargados, con el diálogo de la lista. */
export function EquipmentDossierZip({ equipmentId }: { equipmentId: string }) {
  return (
    <DocumentsDownloadDialog
      queryKey={['equipment-dossier-zip', equipmentId]}
      fetchRows={async () => unwrapExportResult(await getAllEquipmentPermanentDocumentsForExport({}, equipmentId))}
      getResourceLabel={equipmentDocumentLabel}
      getFileResourceName={equipmentDocumentLabel}
      zipFileName="legajo-equipo.zip"
      triggerLabel="Descargar legajo (ZIP)"
    />
  );
}
