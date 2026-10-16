'use client';

import { DocumentsDownloadDialog } from '@/features/Documentacion/lists-shared/DocumentsDownloadDialog';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { getAllEmployeePermanentDocumentsForExport } from '../Permanentes/actions.server';

/** "Descargar legajo (ZIP)" del empleado: sus documentos permanentes cargados, con el diálogo de la lista. */
export function EmployeeDossierZip({ employeeId }: { employeeId: string }) {
  return (
    <DocumentsDownloadDialog
      queryKey={['employee-dossier-zip', employeeId]}
      fetchRows={async () => unwrapExportResult(await getAllEmployeePermanentDocumentsForExport({}, employeeId))}
      getResourceLabel={(row) => (row.employees ? `${row.employees.lastname} ${row.employees.firstname}` : 'Empleado')}
      getFileResourceName={(row) =>
        row.employees ? `${row.employees.lastname}_${row.employees.firstname}` : 'Empleado'
      }
      zipFileName="legajo-empleado.zip"
      triggerLabel="Descargar legajo (ZIP)"
    />
  );
}
