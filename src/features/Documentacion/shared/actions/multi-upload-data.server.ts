'use server';

import { Logger } from '@/lib/logger';
import { fetchCurrentCompany } from '@/shared/actions/company.actions';
import { fetchSimpleDataEquipment } from '@/shared/actions/equipment.actions';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { employeeLabel } from '@/shared/lib/resource-labels';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { assertDocumentUploadAccess } from '../lib/document-permissions';
import { fetchAllDocumentTypes } from './document-actions';

const logger = new Logger('Documentacion/multi-upload-data');

/** Empleados ACTIVOS de la empresa activa para el combo del diálogo (`[legajo] Apellido Nombre`). */
async function loadActiveEmployeeOptions() {
  const companyId = await getActiveCompanyId();
  try {
    const rows = await prisma.employees.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, firstname: true, lastname: true, file: true, cuil: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    });
    return rows.map((employee) => ({ label: employeeLabel(employee), value: employee.id, cuit: employee.cuil }));
  } catch (error) {
    logger.error('Error al obtener empleados para documentos multirecurso', { data: { error } });
    throw error;
  }
}

/**
 * Datos del diálogo "Documento Multirecurso": se piden recién cuando se abre (antes viajaban en cada
 * carga de la lista, con todos los empleados o equipos de la empresa), y sólo los del tipo de recurso
 * que ese diálogo ofrece. Exige poder subir documentos de ese recurso.
 */
export async function getMultiDocumentUploadData(input: { onlyEmployees?: boolean; onlyEquipment?: boolean }) {
  await Promise.all([
    input.onlyEmployees ? assertDocumentUploadAccess('employee') : Promise.resolve(),
    input.onlyEquipment ? assertDocumentUploadAccess('vehicle') : Promise.resolve(),
  ]);
  const [employees, equipmentRows, allDocumentTypes, currentCompany] = await Promise.all([
    input.onlyEmployees ? loadActiveEmployeeOptions() : Promise.resolve([]),
    input.onlyEquipment ? fetchSimpleDataEquipment() : Promise.resolve([]),
    fetchAllDocumentTypes(),
    fetchCurrentCompany(),
  ]);

  const equipments = equipmentRows.map((equipment) => ({
    label: equipment.domain
      ? `${equipment.domain} - ${equipment.intern_number || equipment.serie}`
      : `${equipment.serie} - ${equipment.intern_number || equipment.serie}`,
    value: equipment.id,
  }));

  return {
    employees,
    equipments,
    employeeDocumentTypes: allDocumentTypes.filter((type) => type.applies === 'Persona' && type.multiresource),
    equipmentDocumentTypes: allDocumentTypes.filter((type) => type.applies === 'Equipos' && type.multiresource),
    currentCompany,
  };
}

export type MultiDocumentUploadData = Awaited<ReturnType<typeof getMultiDocumentUploadData>>;
