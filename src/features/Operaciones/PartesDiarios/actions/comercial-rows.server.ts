'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { withSessionActor } from '@/features/Operaciones/lib/with-session-actor';
import type { daily_report_status, daily_report_type_enum } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { resolveRowQuantity } from '../lib/row-quantity';
import { reconcileRowResourceStatus } from '../lib/row-resource-status';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';

const logger = new Logger('features/Operaciones/PartesDiarios/comercial-rows');

// ============================================================================
// CATÁLOGOS DEL FORMULARIO DE LÍNEA (tablero comercial / certificación)
// ============================================================================

/**
 * Clientes de la empresa activa con contratos, sectores, áreas, ítems y equipos,
 * que es lo que necesita el formulario de alta/edición de una línea de parte diario.
 *
 * `item_price` (Decimal) se devuelve como `number`: un `Decimal` de Prisma no cruza el
 * límite Server → Client.
 */
export async function getCustomersForRowForm() {
  try {
    const companyId = await getActiveCompanyId();

    const customers = await prisma.customers.findMany({
      where: { company_id: companyId },
      select: {
        id: true,
        name: true,
        is_active: true,
        cuit: true,
        equipos_clientes: { select: { id: true, name: true, type: true }, orderBy: { name: 'asc' } },
        customer_services: {
          select: {
            id: true,
            customer_id: true,
            service_name: true,
            is_active: true,
            service_validity: true,
            service_sectors: {
              select: {
                id: true,
                service_id: true,
                sector_id: true,
                sectors: { select: { id: true, name: true } },
              },
            },
            service_areas: {
              select: {
                id: true,
                service_id: true,
                area_id: true,
                areas_cliente: { select: { id: true, nombre: true, descripcion_corta: true } },
              },
            },
            service_items: {
              select: {
                id: true,
                item_name: true,
                item_description: true,
                item_price: true,
                is_active: true,
                needs_personnel: true,
                needs_equipment: true,
                customer_service_id: true,
                measure_units: { select: { id: true, unit: true } },
              },
              orderBy: { item_name: 'asc' },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return customers.map((customer) => ({
      ...customer,
      cuit: customer.cuit.toString(),
      customer_services: customer.customer_services.map((service) => ({
        ...service,
        service_items: service.service_items.map((item) => ({ ...item, item_price: Number(item.item_price) })),
      })),
    }));
  } catch (error) {
    logger.error('Error al obtener los clientes del formulario de línea', { data: { error } });
    return [];
  }
}

export type CustomerForRowForm = Awaited<ReturnType<typeof getCustomersForRowForm>>[number];

/** Empleados de la empresa activa para asignar a una línea. */
export async function getActiveEmployeesForRowForm() {
  try {
    const companyId = await getActiveCompanyId();
    return await prisma.employees.findMany({
      where: { company_id: companyId },
      select: { id: true, firstname: true, lastname: true, file: true, is_active: true },
      orderBy: { firstname: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener los empleados del formulario de línea', { data: { error } });
    return [];
  }
}

/** Vehículos de la empresa activa para asignar a una línea. */
export async function getActiveEquipmentsForRowForm() {
  try {
    const companyId = await getActiveCompanyId();
    return await prisma.vehicles.findMany({
      where: { company_id: companyId },
      select: {
        id: true,
        intern_number: true,
        domain: true,
        is_active: true,
        condition: true,
        brand_vehicles: { select: { id: true, name: true } },
        model_vehicles: { select: { id: true, name: true } },
        sub_type: { select: { id: true, name: true } },
        type_vehicles_typeTotype: { select: { id: true, name: true } },
      },
      orderBy: { intern_number: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener los equipos del formulario de línea', { data: { error } });
    return [];
  }
}

// ============================================================================
// ALTA / EDICIÓN DE UNA LÍNEA DESDE EL TABLERO COMERCIAL
// ============================================================================

export interface ComercialRowInput {
  /** Fecha del parte diario en `YYYY-MM-DD` (sólo en el alta). */
  date?: string;
  customer_id: string;
  service_id: string;
  item_id: string;
  working_day: string;
  /**
   * Cantidad de la línea. Si no viene, vale 1 (`resolveRowQuantity`). Se acepta `string`
   * porque el input del formulario entrega texto y convertirlo a `number` antes de tiempo
   * pierde decimales: la conversión a `Decimal` la hace el helper.
   */
  quantity?: string | number | null;
  employees?: string[];
  equipment?: string[];
  customer_equipment?: string[];
  start_time?: string | null;
  end_time?: string | null;
  status: string;
  description?: string | null;
  sector_service_id?: string | null;
  areas_service_id?: string | null;
  type_service?: daily_report_type_enum | null;
  completed_day?: boolean | null;
  completed_night?: boolean | null;
}

/** `''` en una FK uuid es un 400 de Postgres: se normaliza a `null`. */
function toUuidOrNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

/** `HH:mm[:ss]` → columna `time` de Postgres (Prisma la modela como Date sobre 1970-01-01). */
function toPgTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`1970-01-01T${value.length === 5 ? `${value}:00` : value}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toRowStatus(value: string): daily_report_status {
  return value as daily_report_status;
}

/**
 * Verifica que cliente, contrato, ítem, sector, área, empleados y equipos pertenezcan a la
 * empresa activa. Sin RLS es la única defensa contra asociar recursos de otra empresa.
 */
async function assertRowReferences(companyId: string, input: ComercialRowInput): Promise<void> {
  const sectorId = toUuidOrNull(input.sector_service_id);
  const areaId = toUuidOrNull(input.areas_service_id);
  const employeeIds = input.employees ?? [];
  const equipmentIds = input.equipment ?? [];
  const customerEquipmentIds = input.customer_equipment ?? [];

  const [customer, service, item, sector, area, employees, vehicles, customerEquipment] = await Promise.all([
    prisma.customers.findFirst({ where: { id: input.customer_id, company_id: companyId }, select: { id: true } }),
    prisma.customer_services.findFirst({
      where: { id: input.service_id, customers: { company_id: companyId } },
      select: { id: true },
    }),
    prisma.service_items.findFirst({
      where: { id: input.item_id, customer_services: { customers: { company_id: companyId } } },
      select: { id: true },
    }),
    sectorId
      ? prisma.service_sectors.findFirst({
          where: { id: sectorId, customer_services: { customers: { company_id: companyId } } },
          select: { id: true },
        })
      : Promise.resolve(null),
    areaId
      ? prisma.service_areas.findFirst({
          where: { id: areaId, customer_services: { customers: { company_id: companyId } } },
          select: { id: true },
        })
      : Promise.resolve(null),
    employeeIds.length
      ? prisma.employees.findMany({ where: { id: { in: employeeIds }, company_id: companyId }, select: { id: true } })
      : Promise.resolve([]),
    equipmentIds.length
      ? prisma.vehicles.findMany({ where: { id: { in: equipmentIds }, company_id: companyId }, select: { id: true } })
      : Promise.resolve([]),
    customerEquipmentIds.length
      ? prisma.equipos_clientes.findMany({
          where: { id: { in: customerEquipmentIds }, customers: { company_id: companyId } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const missing =
    !customer ||
    !service ||
    !item ||
    (sectorId && !sector) ||
    (areaId && !area) ||
    employees.length !== employeeIds.length ||
    vehicles.length !== equipmentIds.length ||
    customerEquipment.length !== customerEquipmentIds.length;

  if (missing) {
    throw new Error('Alguno de los datos de la línea no pertenece a la empresa activa.');
  }
}

/** Reemplaza las relaciones de una línea dentro de una transacción. */
async function syncRowRelations(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  rowId: string,
  input: { employees?: string[]; equipment?: string[]; customer_equipment?: string[] }
): Promise<void> {
  if (input.employees !== undefined) {
    await tx.dailyreportemployeerelations.deleteMany({ where: { daily_report_row_id: rowId } });
    if (input.employees.length > 0) {
      await tx.dailyreportemployeerelations.createMany({
        data: input.employees.map((employeeId) => ({ daily_report_row_id: rowId, employee_id: employeeId })),
      });
    }
  }

  if (input.equipment !== undefined) {
    await tx.dailyreportequipmentrelations.deleteMany({ where: { daily_report_row_id: rowId } });
    if (input.equipment.length > 0) {
      await tx.dailyreportequipmentrelations.createMany({
        data: input.equipment.map((equipmentId) => ({ daily_report_row_id: rowId, equipment_id: equipmentId })),
      });
    }
  }

  if (input.customer_equipment !== undefined) {
    await tx.dailyreport_customer_equipment_relations.deleteMany({ where: { daily_report_row_id: rowId } });
    if (input.customer_equipment.length > 0) {
      await tx.dailyreport_customer_equipment_relations.createMany({
        data: input.customer_equipment.map((equipmentId) => ({
          daily_report_row_id: rowId,
          customer_equipment_id: equipmentId,
        })),
      });
    }
  }
}

/**
 * Crea una línea de parte diario desde el tablero comercial, junto con el parte diario de
 * la fecha si todavía no existe y todas las relaciones, en una sola transacción.
 *
 * Reemplaza la orquestación que el formulario hacía con 6 llamadas desde el navegador.
 */
export async function createComercialDailyReportRow(input: ComercialRowInput) {
  if (!(await checkPermissionServer('comercial', 'daily_reports', 'create'))) {
    throw new Error('No tenés permiso para crear líneas de partes diarios.');
  }
  if (!input.date) {
    throw new Error('Debe seleccionar una fecha.');
  }

  try {
    const companyId = await getActiveCompanyId();
    await assertRowReferences(companyId, input);

    const date = moment.utc(input.date, 'YYYY-MM-DD').toDate();

    const report = await prisma.dailyreport.upsert({
      where: { date_company_id: { date, company_id: companyId } },
      create: { date, company_id: companyId },
      update: {},
      select: { id: true },
    });

    const row = await withSessionActor(async (tx) => {
      const created = await tx.dailyreportrows.create({
        data: {
          daily_report_id: report.id,
          customer_id: input.customer_id,
          service_id: input.service_id,
          item_id: input.item_id,
          quantity: resolveRowQuantity(input.quantity),
          working_day: input.working_day,
          start_time: toPgTime(input.start_time),
          end_time: toPgTime(input.end_time),
          status: toRowStatus(input.status),
          description: input.description ?? null,
          sector_service_id: toUuidOrNull(input.sector_service_id),
          areas_service_id: toUuidOrNull(input.areas_service_id),
          type_service: input.type_service ?? null,
          completed_day: input.completed_day ?? null,
          completed_night: input.completed_night ?? null,
        },
        select: { id: true },
      });

      await syncRowRelations(tx, created.id, {
        employees: input.employees ?? [],
        equipment: input.equipment ?? [],
        customer_equipment: input.customer_equipment ?? [],
      });
      await reconcileRowResourceStatus(tx, [created.id]);

      return created;
    });

    return { id: row.id, daily_report_id: report.id };
  } catch (error) {
    logger.error('Error al crear la línea del parte diario', { data: { error } });
    throw error instanceof Error ? error : new Error('Error al crear la línea del parte diario.');
  }
}

export interface ComercialRowUpdate {
  status: string;
  description?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  working_day?: string | null;
  sector_service_id?: string | null;
  areas_service_id?: string | null;
  employees?: string[];
  equipment?: string[];
  customer_equipment?: string[];
}

/**
 * Actualiza una línea de parte diario desde el tablero comercial y sincroniza sus relaciones.
 *
 * Perímetro: la línea tiene que pertenecer a un parte de la empresa activa, y los recursos
 * nuevos también.
 */
export async function updateComercialDailyReportRow(rowId: string, input: ComercialRowUpdate) {
  if (!(await checkPermissionServer('comercial', 'daily_reports', 'update'))) {
    throw new Error('No tenés permiso para editar líneas de partes diarios.');
  }
  try {
    const companyId = await getActiveCompanyId();

    const current = await prisma.dailyreportrows.findFirst({
      where: { id: rowId, dailyreport: { company_id: companyId } },
      select: { id: true, customer_id: true, service_id: true, item_id: true, working_day: true },
    });

    if (!current) {
      throw new Error('La línea no existe o no pertenece a la empresa activa.');
    }

    await assertRowReferences(companyId, {
      customer_id: current.customer_id ?? '',
      service_id: current.service_id ?? '',
      item_id: current.item_id ?? '',
      working_day: input.working_day ?? current.working_day ?? '',
      status: input.status,
      sector_service_id: input.sector_service_id,
      areas_service_id: input.areas_service_id,
      employees: input.employees,
      equipment: input.equipment,
      customer_equipment: input.customer_equipment,
    });

    await withSessionActor(async (tx) => {
      await tx.dailyreportrows.update({
        where: { id: rowId },
        data: {
          status: toRowStatus(input.status),
          description: input.description ?? null,
          start_time: toPgTime(input.start_time),
          end_time: toPgTime(input.end_time),
          working_day: input.working_day ?? null,
          sector_service_id: toUuidOrNull(input.sector_service_id),
          areas_service_id: toUuidOrNull(input.areas_service_id),
          last_comercial_edit_at: new Date(),
          updated_at: new Date(),
        },
      });

      await syncRowRelations(tx, rowId, input);
      await reconcileRowResourceStatus(tx, [rowId]);
    });

    return { id: rowId };
  } catch (error) {
    logger.error('Error al actualizar la línea del parte diario', { data: { error, rowId } });
    throw error instanceof Error ? error : new Error('Error al actualizar la línea del parte diario.');
  }
}
