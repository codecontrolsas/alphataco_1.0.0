'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/form-data');

// ============================================================================
// FORM DATA — catálogos (clientes, empleados, equipos) del formulario de línea
// ============================================================================

/**
 * Returns all active customers with their services, items, sectors, areas,
 * and customer equipment — used to populate the DailyReportRowForm.
 */
export async function getCustomersForForm() {
  logger.debug('Obteniendo clientes para el formulario de parte diario');

  try {
    // Perímetro: sólo datos de la empresa activa.
    const companyId = await getActiveCompanyId();

    const data = await prisma.customers.findMany({
      where: { is_active: true, company_id: companyId },
      select: {
        id: true,
        name: true,
        is_active: true,
        equipos_clientes: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        customer_services: {
          where: { is_active: true },
          select: {
            id: true,
            service_name: true,
            is_active: true,
            service_validity: true,
            service_items: {
              where: { is_active: true },
              select: {
                id: true,
                item_name: true,
                is_active: true,
                needs_personnel: true,
                needs_equipment: true,
                measure_units: {
                  select: { id: true, unit: true },
                },
              },
            },
            service_sectors: {
              select: {
                id: true,
                service_id: true,
                sectors: {
                  select: { id: true, name: true, descripcion_corta: true },
                },
              },
            },
            service_areas: {
              select: {
                id: true,
                service_id: true,
                areas_cliente: {
                  select: { id: true, nombre: true, descripcion_corta: true },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return data;
  } catch (error) {
    logger.error('Error al obtener clientes para el formulario', { data: { error } });
    throw new Error('No se pudieron obtener los clientes. Intente nuevamente.');
  }
}

export type CustomersForForm = Awaited<ReturnType<typeof getCustomersForForm>>;
export type CustomerForForm = CustomersForForm[number];

/**
 * Returns all active employees for the daily report form,
 * including contractor assignments (to detect if they are assigned to a customer).
 */
export async function getEmployeesForForm(reportDate?: string) {
  logger.debug('Obteniendo empleados para el formulario de parte diario');

  try {
    // Perímetro: sólo datos de la empresa activa.
    const companyId = await getActiveCompanyId();

    const dateToCheck = reportDate ? new Date(reportDate) : new Date();
    const day = dateToCheck.getDate();
    const month = dateToCheck.getMonth() + 1;
    const year = dateToCheck.getFullYear();

    const data = await prisma.employees.findMany({
      where: { is_active: true, company_id: companyId },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        file: true,
        contractor_employee: {
          select: {
            customers: {
              select: { id: true, name: true },
            },
          },
        },
        company_positions: {
          select: { id: true, name: true },
        },
        employees_diagram: {
          where: { day, month, year },
          select: {
            id: true,
            diagram_type_employees_diagram_diagram_typeTodiagram_type: {
              select: { id: true, name: true, work_active: true },
            },
          },
        },
      },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    });

    return data;
  } catch (error) {
    logger.error('Error al obtener empleados para el formulario', { data: { error } });
    throw new Error('No se pudieron obtener los empleados. Intente nuevamente.');
  }
}

export type EmployeesForForm = Awaited<ReturnType<typeof getEmployeesForForm>>;
export type EmployeeForForm = EmployeesForForm[number];

/**
 * Returns all active vehicles (equipos propios) for the daily report form,
 * including contractor assignments and condition info.
 */
export async function getVehiclesForForm() {
  logger.debug('Obteniendo vehículos para el formulario de parte diario');

  try {
    // Perímetro: sólo datos de la empresa activa.
    const companyId = await getActiveCompanyId();

    const data = await prisma.vehicles.findMany({
      where: { is_active: true, company_id: companyId },
      select: {
        id: true,
        domain: true,
        serie: true,
        condition: true,
        intern_number: true,
        brand_vehicles: {
          select: { name: true },
        },
        type: true,
        type_vehicles_typeTotype: {
          select: { id: true, name: true },
        },
        contractor_equipment: {
          select: {
            customers: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { domain: 'asc' },
    });

    return data;
  } catch (error) {
    logger.error('Error al obtener vehículos para el formulario', { data: { error } });
    throw new Error('No se pudieron obtener los vehículos. Intente nuevamente.');
  }
}

export type VehiclesForForm = Awaited<ReturnType<typeof getVehiclesForForm>>;
export type VehicleForForm = VehiclesForForm[number];

/**
 * Returns all operative other equipment for the daily report form.
 */
export async function getOtherEquipmentForForm() {
  logger.debug('Obteniendo otros equipos para el formulario de parte diario');

  try {
    // Perímetro: sólo datos de la empresa activa.
    const companyId = await getActiveCompanyId();

    const data = await prisma.other_equipment.findMany({
      // Excluir dados de baja, igual que getVehiclesForForm: si no, el equipo
      // dado de baja aparece duplicado junto a su reemplazo con el mismo interno.
      where: { condition: 'operativo', is_active: true, company_id: companyId },
      select: {
        id: true,
        intern_number: true,
        serial_number: true,
        condition: true,
        type: {
          select: { id: true, name: true },
        },
        contractor_other_equipment: {
          select: {
            customers: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { intern_number: 'asc' },
    });

    return data;
  } catch (error) {
    logger.error('Error al obtener otros equipos para el formulario', { data: { error } });
    throw new Error('No se pudieron obtener los otros equipos. Intente nuevamente.');
  }
}

export type OtherEquipmentForForm = Awaited<ReturnType<typeof getOtherEquipmentForForm>>;
export type OtherEquipmentItem = OtherEquipmentForForm[number];

// El formulario de edición y el detalle de línea viven en `form-data/`; los tipos se re-exportan para no mover importadores.
export type { DailyReportRowForForm } from './form-data/row-form.server';
