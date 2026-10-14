'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { assertCompanyAccess } from '@/shared/lib/tenant';

const logger = new Logger('shared/documents');

export type DocumentTableName = 'documents_equipment' | 'documents_employees';

/**
 * `applies` de los documentos ya presentados (con archivo) de un tipo,
 * para deshabilitar en el combobox los recursos que ya lo tienen.
 */
export const getAllDocumentsByIdDocumentTypeCientSide = async (
  selectedValue: string,
  company_id: string,
  tableName: DocumentTableName = 'documents_employees'
): Promise<{ applies: string | null }[]> => {
  if (!company_id) return [];
  await assertCompanyAccess(company_id);
  try {
    const where = { id_document_types: selectedValue, document_path: { not: null } };
    if (tableName === 'documents_employees') {
      return await prisma.documents_employees.findMany({
        where: { ...where, employees: { company_id } },
        select: { applies: true },
      });
    }
    return await prisma.documents_equipment.findMany({
      where: { ...where, vehicles: { company_id } },
      select: { applies: true },
    });
  } catch (error) {
    logger.error('Error al obtener documentos por tipo de documento', { data: { error, tableName } });
    return [];
  }
};
