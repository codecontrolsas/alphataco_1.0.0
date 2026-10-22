'use strict';
import { toPathExtension, toPathIdentifier } from '@/shared/lib/storage-file-name';
import { formatDocumentTypeName, formatPathSegment } from '@/shared/utils/legacy-mappers';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// eslint-disable-next-line react-hooks/rules-of-hooks
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function formatCompanyName(companyName: string): string {
  // Transforma el nombre de la empresa eliminando los guiones bajos y convirtiendo a mayúsculas
  return companyName.replace(/_/g, ' ')?.toUpperCase();
}
export function calculateNameOFDocument(
  company_name: string,
  company_cuit: string,
  applies: string,
  document_name: string,
  version: string,
  file_extension: string,
  resource: string
) {
  // Todo segmento del path se normaliza: Storage rechaza tildes y ñ con `InvalidKey`.
  const formatedCompanyName = formatPathSegment(company_name);
  const formatedAppliesName = formatPathSegment(applies);
  const formatedDocumentTypeName = formatDocumentTypeName(document_name);
  const formatedVersion = version.replace(/[^A-Za-z0-9-]/g, '-');
  const formatedFileExtension = toPathExtension(file_extension);

  return `${formatedCompanyName}-(${toPathIdentifier(company_cuit)})/${formatPathSegment(resource)}/${formatedAppliesName}/${formatedDocumentTypeName}-(${formatedVersion}).${formatedFileExtension}`;
}

/** Shape mínimo de equipo que acepta `mapEquipmentToChecklistFormat` (PostgREST legacy o `fetchAllEquipment`). */
export type ChecklistEquipmentInput = {
  id: string;
  domain: string | null;
  serie: string | null;
  intern_number: string | null;
  kilometer?: string | null;
  engine_hours?: string | null;
  model: { name: string | null } | null;
  brand: { name: string | null } | null;
  type: { id: string | number; name: string | null } | string | number | null;
  subType: { id: string; name: string | null } | string | null;
};

/**
 * Mapea un equipo al formato esperado por NormalizedChecklistForm
 */
export const mapEquipmentToChecklistFormat = (equipment: ChecklistEquipmentInput) => {
  // Manejar subType que puede ser un objeto expandido o null
  let subTypeId: string | null = null;
  if (equipment.subType) {
    if (typeof equipment.subType === 'object' && 'id' in equipment.subType) {
      subTypeId = equipment.subType.id as string;
    } else if (typeof equipment.subType === 'string') {
      subTypeId = equipment.subType;
    }
  }

  // Manejar type que puede ser un objeto expandido
  let typeId: string | null = null;
  if (equipment.type) {
    if (typeof equipment.type === 'object' && 'id' in equipment.type) {
      typeId = String(equipment.type.id);
    } else if (typeof equipment.type === 'string') {
      typeId = equipment.type;
    } else if (typeof equipment.type === 'number') {
      typeId = String(equipment.type);
    }
  }

  return {
    label: equipment.domain
      ? `${equipment.domain} - ${equipment.intern_number || '(Sin información)'}`
      : `${equipment.serie} - ${equipment.intern_number || '(Sin información)'}`,
    value: equipment.id,
    domain: equipment.domain,
    serie: equipment.serie,
    kilometer: equipment.kilometer ?? '0',
    engine_hours: equipment.engine_hours ?? '0',
    model: equipment.model?.name || 'N/A',
    brand: equipment.brand?.name || 'N/A',
    intern_number: equipment.intern_number || '',
    sub_type_id: subTypeId,
    type_id: typeId,
    type_name: (typeof equipment.type === 'object' && equipment.type?.name) || 'N/A',
    sub_type_name: (typeof equipment.subType === 'object' && equipment.subType?.name) || 'N/A',
  };
};
