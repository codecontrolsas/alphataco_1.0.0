'use strict';
import { formatDocumentTypeName, formatPathSegment } from '@/shared/utils/legacy-mappers';
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Persistencia de documentos (Prisma) y rol del usuario en la empresa: server actions.
export { getActualRole } from '@/shared/actions/shared-users.server';
export { getAllDocumentsByIdDocumentTypeCientSide, uploadDocument } from '@/shared/actions/documents.server';

// tailwind-merge trata cualquier `text-<desconocido>` como color: sin este grupo,
// `cn('text-overline', 'text-muted-foreground')` borraría la clase de rol tipográfico.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['display', 'page-title', 'section', 'overline', 'body', 'cell', 'label', 'caption', 'kpi'] },
      ],
      // Sin estos, `shadow-overlay` y `ease-out-quick` se toman como color / no chocan con su grupo.
      shadow: [{ shadow: ['overlay'] }],
      ease: [{ ease: ['out-quick'] }],
    },
  },
});

// eslint-disable-next-line react-hooks/rules-of-hooks
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function formatCompanyName(companyName: string): string {
  // Transforma el nombre de la empresa eliminando los guiones bajos y convirtiendo a mayúsculas
  return companyName.replace(/_/g, ' ')?.toUpperCase();
}
export function validarCUIL(cuil: string) {
  // Elimina guiones y espacios
  cuil = cuil.replace(/[-\s]/g, '');

  // Verifica la longitud
  if (cuil?.length !== 11) {
    return false;
  }

  // Calcula el dígito verificador
  const coeficientes = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += parseInt(cuil[i]) * coeficientes[i];
  }
  let digitoVerificador = 11 - (suma % 11);
  if (digitoVerificador === 11) {
    digitoVerificador = 0;
  }

  // Compara con el último dígito
  return parseInt(cuil[10]) === digitoVerificador;
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
  const formatedVersion = version.replace(/\./g, '-');
  const formatedFileExtension = file_extension.replace(/\./g, '-');

  return `${formatedCompanyName}-(${company_cuit})/${resource}/${formatedAppliesName}/${formatedDocumentTypeName}-(${formatedVersion}).${formatedFileExtension}`;
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
