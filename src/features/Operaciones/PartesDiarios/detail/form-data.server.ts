'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { REMIT_NUMBERS_SELECT } from '../remitManager/lib/remit-numbers';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/form-data');

// ============================================================================
// 11. FORM DATA — customers, services, items, sectors, areas, equipment
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
 * Returns a single row by id to pre-populate the edit form.
 * Includes all relations needed (employees with roles, equipment, customer equipment).
 */
export async function getDailyReportRowForForm(rowId: string) {
  logger.debug('Obteniendo fila del parte para el formulario', { data: { rowId } });

  try {
    // Perímetro: sólo datos de la empresa activa.
    const companyId = await getActiveCompanyId();

    const row = await prisma.dailyreportrows.findUnique({
      where: { id: rowId, dailyreport: { company_id: companyId } },
      select: {
        id: true,
        customer_id: true,
        service_id: true,
        item_id: true,
        status: true,
        working_day: true,
        shift_12h: true,
        start_time: true,
        end_time: true,
        description: true,
        document_path: true,
        sector_service_id: true,
        areas_service_id: true,
        cancel_reason: true,
        type_service: true,
        completed_day: true,
        completed_night: true,
        preparte_id: true,
        dailyreportemployeerelations: {
          select: {
            id: true,
            employee_id: true,
            role: true,
          },
        },
        dailyreportequipmentrelations: {
          select: {
            id: true,
            equipment_id: true,
            other_equipment_id: true,
            // Para mostrar en el form los ya guardados que no están en la lista de opciones
            other_equipment: {
              select: { id: true, intern_number: true, serial_number: true, is_active: true },
            },
          },
        },
        dailyreport_customer_equipment_relations: {
          select: {
            id: true,
            customer_equipment_id: true,
          },
        },
      },
    });

    return row;
  } catch (error) {
    logger.error('Error al obtener fila del parte para el formulario', { data: { error, rowId } });
    throw new Error('No se pudo obtener la fila. Intente nuevamente.');
  }
}

export type DailyReportRowForForm = Awaited<ReturnType<typeof getDailyReportRowForForm>>;

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

// ============================================================================
// 15. ROW DETAIL (on-demand — ServiceDetailDialog)
// ============================================================================

/**
 * Fetches full detail data for a single row, including enriched employee/equipment info.
 * Used by ServiceDetailDialog to show DNI, email, phone, position, brand, model, etc.
 * This is fetched on-demand (not in the paginated query) to avoid bloating the main payload.
 */
export async function getDailyReportRowDetail(rowId: string) {
  logger.debug('Obteniendo detalle enriquecido de fila del parte diario', { data: { rowId } });

  try {
    // Perímetro: sólo datos de la empresa activa.
    const companyId = await getActiveCompanyId();

    const row = await prisma.dailyreportrows.findUnique({
      where: { id: rowId, dailyreport: { company_id: companyId } },
      select: {
        id: true,
        customer_id: true,
        service_id: true,
        item_id: true,
        description: true,
        status: true,
        working_day: true,
        shift_12h: true,
        start_time: true,
        end_time: true,
        remitos: REMIT_NUMBERS_SELECT,
        cancel_reason: true,
        type_service: true,
        completed_day: true,
        completed_night: true,
        last_comercial_edit_at: true,
        customers: {
          select: { id: true, name: true },
        },
        customer_services: {
          select: { id: true, service_name: true },
        },
        service_items: {
          select: { id: true, item_name: true, item_description: true },
        },
        service_sectors: {
          select: {
            id: true,
            sectors: { select: { id: true, name: true } },
          },
        },
        service_areas: {
          select: {
            id: true,
            areas_cliente: { select: { id: true, descripcion_corta: true } },
          },
        },
        preparte: {
          select: { id: true, numero_pedido: true },
        },
        dailyreportemployeerelations: {
          select: {
            id: true,
            employee_id: true,
            role: true,
            employees: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                file: true,
                cuil: true,
                email: true,
                phone: true,
                hierarchy: { select: { name: true } },
              },
            },
          },
        },
        dailyreportequipmentrelations: {
          select: {
            id: true,
            equipment_id: true,
            other_equipment_id: true,
            vehicles: {
              select: {
                id: true,
                domain: true,
                intern_number: true,
                year: true,
                condition: true,
                brand_vehicles: { select: { name: true } },
                model_vehicles: { select: { name: true } },
                types_of_vehicles: { select: { name: true } },
              },
            },
            other_equipment: {
              select: {
                id: true,
                intern_number: true,
                serial_number: true,
              },
            },
          },
        },
        dailyreport_customer_equipment_relations: {
          select: {
            id: true,
            customer_equipment_id: true,
            equipos_clientes: {
              select: { name: true, type: true },
            },
          },
        },
      },
    });

    return row;
  } catch (error) {
    logger.error('Error al obtener detalle de fila del parte diario', { data: { error, rowId } });
    throw new Error('No se pudo obtener el detalle de la fila. Intente nuevamente.');
  }
}

export type DailyReportRowDetailData = Awaited<ReturnType<typeof getDailyReportRowDetail>>;

