'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId, NoActiveCompanyError } from '@/shared/lib/tenant';

const logger = new Logger('shared/employees');

/** Empresa activa o null (los listados legacy devolvían [] sin empresa en vez de lanzar). */
async function activeCompanyOrNull(): Promise<string | null> {
  try {
    return await getActiveCompanyId();
  } catch (error) {
    if (error instanceof NoActiveCompanyError) return null;
    throw error;
  }
}

const employeeRelations = {
  contractor_employee: { include: { customers: true } },
  company_positions: true,
  hierarchy: true,
  cities: true,
  provinces: true,
  work_diagram: true,
  countries: true,
  cost_center: true,
} as const;

/** Todos los empleados de la empresa activa con sus relaciones (shape legacy de PostgREST). */
export const fetchAllEmployees = async (_role?: string) => {
  const company_id = await activeCompanyOrNull();
  if (!company_id) return [];

  try {
    return await prisma.employees.findMany({
      where: withCompany({}, company_id),
      include: employeeRelations,
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    });
  } catch (error) {
    logger.error('Error fetching employees', { data: { error } });
    return [];
  }
};

export const fetchAllEmployeesOnlyName = async (_role?: string) => {
  const company_id = await activeCompanyOrNull();
  if (!company_id) return [];

  try {
    return await prisma.employees.findMany({
      where: withCompany({}, company_id),
      select: { id: true, firstname: true, lastname: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    });
  } catch (error) {
    logger.error('Error fetching employees names', { data: { error } });
    return [];
  }
};

export const fetchSimpleDataEmployee = async () => {
  const company_id = await activeCompanyOrNull();
  if (!company_id) return [];

  try {
    // Solo empleados activos: los dados de baja no deben figurar para crear nuevas
    // alertas/documentos. Sus documentos existentes se conservan, no se tocan aqui.
    return await prisma.employees.findMany({
      where: withCompany({ is_active: true }, company_id),
      select: { id: true, firstname: true, lastname: true, cuil: true },
    });
  } catch (error) {
    logger.error('Error fetching simple employees', { data: { error } });
    return [];
  }
};
