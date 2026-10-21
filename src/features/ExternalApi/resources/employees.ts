import type { Prisma } from '@/generated/prisma/client';
import { prismaBase } from '@/shared/lib/prisma';
import { createTenantClient } from '@/shared/lib/tenant-context';
import { EMPLOYEE_SELECT } from '@/shared/prisma-selects/employee-select';
import { buildCreatedAtFilter, type ExternalListQuery, type ExternalListResult } from '../lib/request';
import { toPublicDate, toPublicReference, type PublicReference } from './shared';

/**
 * Recurso "empleados" de la API externa (ticket 671).
 *
 * Los campos salen de EMPLOYEE_SELECT, el mismo que alimenta la tabla de
 * Empleados: lo que ve el usuario en pantalla es lo que recibe el sistema
 * externo.
 */

type EmployeeRow = Prisma.employeesGetPayload<{ select: typeof EMPLOYEE_SELECT }>;

export async function fetchExternalEmployees(params: {
  companyId: string;
  query: ExternalListQuery;
}): Promise<ExternalListResult<EmployeeRow>> {
  const { companyId, query } = params;
  const db = createTenantClient(prismaBase, { companyId, userId: null, kind: 'api' });

  const where: Prisma.employeesWhereInput = {
    company_id: companyId,
    // Por defecto solo activos; en true se devuelven tambien las bajas
    ...(query.includeInactive ? {} : { is_active: true }),
    ...(buildCreatedAtFilter(query) ? { created_at: buildCreatedAtFilter(query) } : {}),
  };

  const [data, total] = await Promise.all([
    db.employees.findMany({
      where,
      select: EMPLOYEE_SELECT,
      orderBy: { file: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.employees.count({ where }),
  ]);

  return { data, total };
}

export type PublicEmployee = {
  id: string;
  fileNumber: string;
  firstName: string;
  lastName: string;
  fullName: string | null;
  documentType: string | null;
  documentNumber: string;
  cuil: string;
  nationality: string | null;
  birthDate: string | null;
  birthCountry: PublicReference | null;
  gender: string | null;
  maritalStatus: string | null;
  educationLevel: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  streetNumber: string | null;
  city: PublicReference | null;
  province: PublicReference | null;
  postalCode: string | null;
  position: PublicReference | null;
  /** Sector del organigrama interno. No confundir con /commercial-sectors ni con workshopSectors */
  organizationalSector: PublicReference | null;
  contractType: PublicReference | null;
  workDiagram: PublicReference | null;
  category: PublicReference | null;
  covenant: PublicReference | null;
  guild: PublicReference | null;
  costCenter: PublicReference | null;
  costType: string | null;
  normalHours: string | null;
  admissionDate: string | null;
  affiliateStatus: string | null;
  documentationStatus: string | null;
  workshopSectors: PublicReference[];
  technicalAptitudes: PublicReference[];
  assignedCustomers: PublicReference[];
  isActive: boolean;
  terminationDate: string | null;
  terminationReason: string | null;
  createdAt: string;
};

/**
 * Traduce la fila de Prisma al JSON publico.
 *
 * Es el unico lugar que define el contrato hacia el tercero: si manana cambia
 * un nombre de columna interno, se ajusta aca y la integracion externa no se
 * entera.
 */
export function toPublicEmployee(row: EmployeeRow): PublicEmployee {
  return {
    id: row.id,
    fileNumber: row.file,
    firstName: row.firstname,
    lastName: row.lastname,
    fullName: row.full_name,
    documentType: row.document_type,
    documentNumber: row.document_number,
    cuil: row.cuil,
    nationality: row.nationality,
    birthDate: row.born_date,
    birthCountry: toPublicReference(row.countries),
    gender: row.gender,
    maritalStatus: row.marital_status,
    educationLevel: row.level_of_education,
    email: row.email,
    phone: row.phone,
    street: row.street,
    streetNumber: row.street_number,
    city: toPublicReference(row.cities),
    province: toPublicReference(row.provinces),
    postalCode: row.postal_code,
    position: toPublicReference(row.company_positions),
    organizationalSector: toPublicReference(row.hierarchy),
    contractType: toPublicReference(row.types_of_contract),
    workDiagram: toPublicReference(row.work_diagram),
    category: toPublicReference(row.category),
    covenant: toPublicReference(row.covenant),
    guild: toPublicReference(row.guild),
    costCenter: toPublicReference(row.cost_center),
    costType: row.cost_type,
    normalHours: row.normal_hours,
    admissionDate: toPublicDate(row.date_of_admission),
    affiliateStatus: row.affiliate_status,
    documentationStatus: row.status,
    workshopSectors: row.employee_workshop_sectors.map((relation) => ({
      id: relation.workshop_sectors.id,
      name: relation.workshop_sectors.name,
    })),
    technicalAptitudes: row.empleado_aptitudes.map((relation) => ({
      id: relation.aptitudes_tecnicas.id,
      name: relation.aptitudes_tecnicas.nombre,
    })),
    assignedCustomers: row.contractor_employee
      .filter((relation) => relation.customers !== null)
      .map((relation) => ({ id: relation.customers!.id, name: relation.customers!.name })),
    isActive: row.is_active ?? false,
    terminationDate: toPublicDate(row.termination_date),
    terminationReason: row.reason_for_termination,
    createdAt: row.created_at.toISOString(),
  };
}
