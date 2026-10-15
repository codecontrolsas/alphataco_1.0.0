'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { remitNumberContainsWhere } from '@/features/Operaciones/PartesDiarios/remitManager/lib/remit-numbers';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';

const logger = new Logger('features/Operaciones/Certificacion/queries');

/** Filtros del tablero comercial. Todos son opcionales y se combinan con AND. */
export interface ReportFilters {
  customer?: string[];
  service?: string[];
  status?: string[];
  employee?: string[];
  equipment?: string[];
  item?: string[];
  customerEquipment?: string[];
  areas?: string[];
  sectors?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  remitNumber?: string | null;
}

/** `time` de Postgres → `HH:mm:ss` (Prisma lo entrega como Date sobre 1970-01-01 UTC). */
function toTimeString(value: Date | null): string | null {
  if (!value) return null;
  return moment.utc(value).format('HH:mm:ss');
}

const ROW_SELECT = {
  id: true,
  daily_report_id: true,
  customer_id: true,
  service_id: true,
  item_id: true,
  start_time: true,
  end_time: true,
  description: true,
  status: true,
  working_day: true,
  document_path: true,
  sector_service_id: true,
  areas_service_id: true,
  cancel_reason: true,
  type_service: true,
  completed_day: true,
  completed_night: true,
  preparte_id: true,
  last_comercial_edit_at: true,
  created_at: true,
  updated_at: true,
  dailyreport: { select: { id: true, date: true, status: true } },
  customers: { select: { id: true, name: true } },
  customer_services: { select: { id: true, service_name: true, customer_id: true } },
  service_items: { select: { id: true, item_name: true, item_description: true } },
  preparte: { select: { id: true, numero_pedido: true, status: true, confirmed_by: true } },
  remitos: {
    select: { id: true, remit_number: true, created_at: true },
    orderBy: { created_at: 'asc' },
  },
  service_sectors: { select: { id: true, sector_id: true, sectors: { select: { id: true, name: true } } } },
  service_areas: {
    select: {
      id: true,
      area_id: true,
      areas_cliente: { select: { id: true, nombre: true, descripcion_corta: true } },
    },
  },
  dailyreport_customer_equipment_relations: {
    select: { id: true, equipos_clientes: { select: { id: true, name: true, type: true } } },
  },
  dailyreportemployeerelations: {
    select: {
      role: true,
      employees: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          file: true,
          document_number: true,
          email: true,
          phone: true,
          company_positions: { select: { name: true } },
        },
      },
    },
  },
  dailyreportequipmentrelations: {
    select: {
      vehicles: {
        select: {
          id: true,
          intern_number: true,
          domain: true,
          year: true,
          // `type` es la FK uuid; la relación al catálogo se llama `type_vehicles_typeTotype`.
          type_vehicles_typeTotype: { select: { id: true, name: true } },
          brand_vehicles: { select: { id: true, name: true } },
          model_vehicles: { select: { id: true, name: true } },
          sub_type: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;

/**
 * Líneas de parte diario del tablero comercial, con todos los filtros aplicados en la
 * base (antes los de relaciones se filtraban en memoria sobre TODAS las filas).
 *
 * Perímetro: siempre acotado por `dailyreport.company_id` = empresa activa.
 */
export async function getFilteredDailyReportRows(filters: ReportFilters = {}) {
  try {
    const companyId = await getActiveCompanyId();

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (filters.dateFrom) dateFilter.gte = moment.utc(filters.dateFrom, 'YYYY-MM-DD').toDate();
    if (filters.dateTo) dateFilter.lte = moment.utc(filters.dateTo, 'YYYY-MM-DD').toDate();

    const rows = await prisma.dailyreportrows.findMany({
      where: {
        dailyreport: {
          company_id: companyId,
          ...(filters.dateFrom || filters.dateTo ? { date: dateFilter } : {}),
        },
        ...(filters.customer?.length ? { customer_id: { in: filters.customer } } : {}),
        ...(filters.service?.length ? { service_id: { in: filters.service } } : {}),
        ...(filters.item?.length ? { item_id: { in: filters.item } } : {}),
        ...(filters.status?.length
          ? {
              status: {
                in: filters.status.map((value) => value.toLowerCase()) as ('pendiente' | 'ejecutado')[],
              },
            }
          : {}),
        ...(filters.employee?.length
          ? { dailyreportemployeerelations: { some: { employee_id: { in: filters.employee } } } }
          : {}),
        ...(filters.equipment?.length
          ? { dailyreportequipmentrelations: { some: { equipment_id: { in: filters.equipment } } } }
          : {}),
        ...(filters.customerEquipment?.length
          ? {
              dailyreport_customer_equipment_relations: {
                some: { customer_equipment_id: { in: filters.customerEquipment } },
              },
            }
          : {}),
        ...(filters.areas?.length ? { service_areas: { area_id: { in: filters.areas } } } : {}),
        ...(filters.sectors?.length ? { service_sectors: { sector_id: { in: filters.sectors } } } : {}),
        ...(filters.remitNumber ? remitNumberContainsWhere(filters.remitNumber) : {}),
      },
      select: ROW_SELECT,
      orderBy: { dailyreport: { date: 'desc' } },
    });

    return rows.map((row) => {
      const employees = row.dailyreportemployeerelations
        .map((rel) => (rel.employees ? `${rel.employees.firstname} ${rel.employees.lastname}`.trim() : ''))
        .filter(Boolean);

      const company_equipment = row.dailyreportequipmentrelations
        .map((rel) => rel.vehicles)
        .filter((vehicle): vehicle is NonNullable<typeof vehicle> => vehicle !== null)
        .map((vehicle) => [vehicle.intern_number, vehicle.domain].filter(Boolean).join(' - '))
        .filter(Boolean);

      const customer_equipment = row.dailyreport_customer_equipment_relations
        .map((rel) => rel.equipos_clientes?.name)
        .filter((name): name is string => Boolean(name));

      const remitos_list = row.remitos.map((remito) => ({
        id: remito.id,
        remit_number: remito.remit_number,
        created_at: remito.created_at?.toISOString() ?? null,
      }));
      const remit_numbers = remitos_list.map((remito) => remito.remit_number).filter(Boolean);

      return {
        ...row,
        start_time: toTimeString(row.start_time),
        end_time: toTimeString(row.end_time),
        date: moment.utc(row.dailyreport?.date).format('DD-MM-YYYY'),
        customer: row.customers?.name ?? '',
        item: row.service_items?.item_name ?? '',
        item_description: row.service_items?.item_description ?? '',
        services: row.customer_services?.service_name ?? '',
        /** Etiqueta a mostrar: el tipo de servicio o, si falta, el nombre del contrato. */
        type_service: row.type_service ?? row.customer_services?.service_name ?? '',
        /** Valor crudo del enum, para clonar la línea sin perder el tipo. */
        raw_type_service: row.type_service,
        employees,
        company_equipment,
        customer_equipment,
        area: row.service_areas?.areas_cliente?.nombre ?? '',
        sector: row.service_sectors?.sectors?.name ?? '',
        /** Todos los remitos de la línea separados por coma (fuente: tabla `remitos`). */
        remit_number: remit_numbers.join(', '),
        remit_numbers,
        remitos: remitos_list,
        employees_references: row.dailyreportemployeerelations.map((rel) => rel.employees),
        equipment_references: row.dailyreportequipmentrelations.map((rel) =>
          rel.vehicles ? { ...rel.vehicles, type: rel.vehicles.type_vehicles_typeTotype } : null
        ),
        customer_equipment_references: row.dailyreport_customer_equipment_relations.map(
          (rel) => rel.equipos_clientes
        ),
      };
    });
  } catch (error) {
    logger.error('Error al obtener las líneas filtradas del parte diario', { data: { error } });
    throw error;
  }
}

export type getFilteredDailyReportRowsType = Awaited<ReturnType<typeof getFilteredDailyReportRows>>;
