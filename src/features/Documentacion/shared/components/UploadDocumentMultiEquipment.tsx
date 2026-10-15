'use client';

import type { fetchAllDocumentTypes } from '@/features/Documentacion/shared/actions/document-actions';
import type { fetchCurrentCompany } from '@/shared/actions/company.actions';
import UploadDocumentMultiForm from './UploadDocumentMultiForm';

/** Carga multirrecurso de equipos: la lógica vive en `UploadDocumentMultiForm`. */
function UploadDocumentMultiEquipment({
  equipments,
  allDocumentTypes,
  currentCompany,
}: {
  equipments: { label: string; value: string }[];
  allDocumentTypes: Awaited<ReturnType<typeof fetchAllDocumentTypes>>;
  currentCompany: Awaited<ReturnType<typeof fetchCurrentCompany>>;
}) {
  return (
    <UploadDocumentMultiForm
      resource="equipo"
      options={equipments}
      allDocumentTypes={allDocumentTypes}
      currentCompany={currentCompany}
    />
  );
}

export default UploadDocumentMultiEquipment;
