'use client';

import type { fetchAllDocumentTypes } from '@/features/Documentacion/shared/actions/document-actions';
import type { fetchCurrentCompany } from '@/shared/actions/company.actions';
import UploadDocumentMultiForm from './UploadDocumentMultiForm';

/** Carga multirrecurso de empleados: la lógica vive en `UploadDocumentMultiForm`. */
function UploadDocumentMultiEmployee({
  employees,
  allDocumentTypes,
  currentCompany,
}: {
  employees: { label: string; value: string; cuit: string }[];
  allDocumentTypes: Awaited<ReturnType<typeof fetchAllDocumentTypes>>;
  currentCompany: Awaited<ReturnType<typeof fetchCurrentCompany>>;
}) {
  return (
    <UploadDocumentMultiForm
      resource="empleado"
      options={employees}
      allDocumentTypes={allDocumentTypes}
      currentCompany={currentCompany}
    />
  );
}

export default UploadDocumentMultiEmployee;
