'use server';

import { canViewServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import {
  getEmployeeDiagramHistory as readEmployeeDiagramHistory,
  getEmployeeDiagrams as readEmployeeDiagrams,
} from './lib/employee-diagram-queries';
import { createEmployeeMutation, updateEmployeeMutation } from './lib/employee-mutations';
import type { EmployeeFormData, EmployeeUpdateData } from './schemas/employee-schema';

const logger = new Logger('features/EmpleadoID');

/**
 * Obtiene un empleado por ID con todas sus relaciones necesarias para el detalle.
 * Wrapped con React.cache() para deduplicar llamadas dentro del mismo request.
 */
export const getEmployeeByIdCached = cache(async (employeeId: string) => {
  logger.debug('Obteniendo empleado por ID', { data: { employeeId } });
  // Sin `view` sobre Empleados el legajo no se entrega (la página responde 404).
  if (!(await canViewServer('empleados', 'employees'))) return null;
  const companyId = await getActiveCompanyId();

  try {
    // Perímetro sin RLS: el legajo sólo se lee si pertenece a la empresa activa.
    const employee = await prisma.employees.findFirst({
      where: withCompany({ id: employeeId }, companyId),
      select: {
        // Campos escalares de identidad
        id: true,
        firstname: true,
        lastname: true,
        full_name: true,
        cuil: true,
        document_type: true,
        document_number: true,
        // Campos personales
        nationality: true,
        gender: true,
        marital_status: true,
        level_of_education: true,
        born_date: true,
        picture: true,
        // Campos de contacto / domicilio
        street: true,
        street_number: true,
        postal_code: true,
        phone: true,
        email: true,
        // Campos laborales escalares
        file: true,
        normal_hours: true,
        date_of_admission: true,
        is_active: true,
        status: true,
        affiliate_status: true,
        reason_for_termination: true,
        termination_date: true,
        allocated_to: true,
        cost_type: true,
        // FKs escalares (necesarias para preseleccionar dropdowns)
        hierarchical_position: true,
        company_position: true,
        workflow_diagram: true,
        type_of_contract: true,
        guild_id: true,
        covenants_id: true,
        category_id: true,
        cost_center_id: true,
        province: true,
        city: true,
        birthplace: true,
        // Relaciones resueltas (id + name/nombre)
        countries: {
          select: { id: true, name: true },
        },
        provinces: {
          select: { id: true, name: true },
        },
        cities: {
          select: { id: true, name: true },
        },
        hierarchy: {
          select: { id: true, name: true },
        },
        company_positions: {
          select: { id: true, name: true },
        },
        work_diagram: {
          select: { id: true, name: true },
        },
        types_of_contract: {
          select: { id: true, name: true },
        },
        guild: {
          select: { id: true, name: true },
        },
        covenant: {
          select: { id: true, name: true },
        },
        category: {
          select: { id: true, name: true },
        },
        cost_center: {
          select: { id: true, name: true },
        },
        // M:M — sectores de taller asignados
        employee_workshop_sectors: {
          select: {
            workshop_sectors: {
              select: { id: true, name: true },
            },
          },
        },
        // M:M — afectaciones a clientes
        contractor_employee: {
          select: {
            customers: {
              select: { id: true, name: true },
            },
          },
        },
        // M:M — aptitudes técnicas
        empleado_aptitudes: {
          select: {
            aptitudes_tecnicas: {
              select: { id: true, nombre: true },
            },
          },
        },
      },
    });

    return employee;
  } catch (error) {
    logger.error('Error al obtener empleado por ID', { data: { error, employeeId } });
    throw error;
  }
});

// Tipos inferidos del retorno — NUNCA definir manualmente
export type EmployeeDetailData = Awaited<ReturnType<typeof getEmployeeByIdCached>>;

// ─── Funciones de catálogo ───────────────────────────────────────────────────

export async function getAllCountryOptions() {
  logger.debug('Obteniendo opciones de países');
  try {
    return await prisma.countries.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de países', { data: { error } });
    return [];
  }
}

export async function getAllCostCenterOptions() {
  logger.debug('Obteniendo opciones de centros de costo');
  try {
    return await prisma.cost_center.findMany({
      where: withCompany({}, await getActiveCompanyId()),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de centros de costo', { data: { error } });
    return [];
  }
}

export async function getAllHierarchyOptions() {
  logger.debug('Obteniendo opciones de jerarquías');
  try {
    return await prisma.hierarchy.findMany({
      where: withCompany({}, await getActiveCompanyId()),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de jerarquías', { data: { error } });
    return [];
  }
}

export async function getAllCompanyPositionOptions() {
  logger.debug('Obteniendo opciones de puestos');
  try {
    return await prisma.company_positions.findMany({
      where: withCompany({}, await getActiveCompanyId()),
      select: {
        id: true,
        name: true,
        hierarchical_position_id: true,
      },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de puestos', { data: { error } });
    return [];
  }
}

export async function getAllWorkDiagramOptions() {
  logger.debug('Obteniendo opciones de diagramas de trabajo');
  try {
    return await prisma.work_diagram.findMany({
      where: withCompany({}, await getActiveCompanyId()),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de diagramas de trabajo', { data: { error } });
    return [];
  }
}

export async function getAllGuildOptions() {
  logger.debug('Obteniendo opciones de sindicatos');
  try {
    return await prisma.guild.findMany({
      where: withCompany({ is_active: true }, await getActiveCompanyId()),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de sindicatos', { data: { error } });
    return [];
  }
}

export async function getAllCovenantOptions() {
  logger.debug('Obteniendo opciones de convenios');
  try {
    return await prisma.covenant.findMany({
      where: withCompany({ is_active: true }, await getActiveCompanyId()),
      select: { id: true, name: true, guild_id: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de convenios', { data: { error } });
    return [];
  }
}

export async function getAllCategoryOptions() {
  logger.debug('Obteniendo opciones de categorías');
  try {
    return await prisma.category.findMany({
      // category no tiene company_id: se acota por el convenio al que pertenece
      where: { is_active: true, covenant: { company_id: await getActiveCompanyId() } },
      select: { id: true, name: true, covenant_id: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de categorías', { data: { error } });
    return [];
  }
}

export async function getAllContractorOptions() {
  logger.debug('Obteniendo opciones de contratistas');
  try {
    return await prisma.customers.findMany({
      where: withCompany({ is_active: true }, await getActiveCompanyId()),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de contratistas', { data: { error } });
    return [];
  }
}

export async function getAllProvinceOptions() {
  logger.debug('Obteniendo opciones de provincias');
  try {
    return await prisma.provinces.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de provincias', { data: { error } });
    return [];
  }
}

export async function getCitiesByProvince(provinceId: bigint | null | undefined) {
  if (!provinceId) return [];
  logger.debug('Obteniendo ciudades por provincia', { data: { provinceId: String(provinceId) } });
  try {
    return await prisma.cities.findMany({
      where: { province_id: provinceId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener ciudades por provincia', { data: { error, provinceId: String(provinceId) } });
    return [];
  }
}

export async function getAllContractTypeOptions() {
  logger.debug('Obteniendo opciones de tipos de contrato');
  try {
    return await prisma.types_of_contract.findMany({
      where: withCompany({}, await getActiveCompanyId()),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de tipos de contrato', { data: { error } });
    return [];
  }
}

export async function getAllAptitudeOptions() {
  logger.debug('Obteniendo opciones de aptitudes técnicas');
  try {
    return await prisma.aptitudes_tecnicas.findMany({
      where: withCompany({}, await getActiveCompanyId()),
      select: {
        id: true,
        nombre: true,
        is_active: true,
        aptitudes_tecnicas_puestos: {
          select: { puesto_id: true },
        },
      },
      orderBy: { nombre: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de aptitudes técnicas', { data: { error } });
    return [];
  }
}

export async function getAllWorkshopSectorOptions() {
  logger.debug('Obteniendo opciones de sectores de taller');
  try {
    return await prisma.workshop_sectors.findMany({
      where: withCompany({ is_active: true }, await getActiveCompanyId()),
      select: {
        id: true,
        name: true,
        workshop_id: true,
        workshops: {
          select: { id: true, name: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener opciones de sectores de taller', { data: { error } });
    return [];
  }
}

/**
 * Obtiene todos los tipos de diagrama de la compañía del usuario actual.
 */
export async function getDiagramTypes() {
  // La empresa SIEMPRE sale de la sesión.
  const companyId = await getActiveCompanyId();
  logger.debug('Obteniendo tipos de diagrama', { data: { companyId } });
  try {
    return await prisma.diagram_type.findMany({
      where: withCompany({ is_active: true }, companyId),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener tipos de diagrama', { data: { error, companyId } });
    return [];
  }
}

// ─── Diagramas del empleado ───────────────────────────────────────────────────
// La lógica vive en `lib/employee-diagram-queries.ts` (sin `'use server'`); estas son las
// server actions expuestas, con el mismo nombre que siempre.

/** Historial de cambios de diagramas de un empleado (requiere `empleados:employees:view`). */
export async function getEmployeeDiagramHistory(employeeId: string) {
  return readEmployeeDiagramHistory(employeeId);
}

/** Diagramas asignados a un empleado, con el tipo incluido (requiere `empleados:employees:view`). */
export async function getEmployeeDiagrams(employeeId: string) {
  return readEmployeeDiagrams(employeeId);
}

// ─── Funciones de mutación ────────────────────────────────────────────────────
// La lógica vive en `lib/employee-mutations.ts`. Ver ahí el contrato de edición por deltas.

/** Crea un empleado (requiere `empleados:employees:create`). La empresa sale de la sesión. */
export async function createEmployee(data: EmployeeFormData) {
  return createEmployeeMutation(data);
}

/**
 * Actualiza un empleado (requiere `empleados:employees:update`). Las M:M se aplican con los
 * deltas `allocation_changes` / `aptitude_changes` / `workshop_sector_changes` (`{ add, remove }`).
 */
export async function updateEmployee(employeeId: string, data: EmployeeUpdateData) {
  return updateEmployeeMutation(employeeId, data);
}
