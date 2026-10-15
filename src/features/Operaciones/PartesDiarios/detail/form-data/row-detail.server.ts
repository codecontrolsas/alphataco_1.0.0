'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { REMIT_NUMBERS_SELECT } from '../../remitManager/lib/remit-numbers';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/form-data/row-detail');

/**
 * Fetches full detail data for a single row, including enriched employee/equipment info.
 * Used by ServiceDetailDialog to show CUIL, email, phone, position, brand, model, etc.
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
        description: true,
        status: true,
        working_day: true,
        shift_12h: true,
        start_time: true,
        end_time: true,
        remitos: REMIT_NUMBERS_SELECT,
        type_service: true,
        completed_day: true,
        completed_night: true,
        customers: {
          select: { name: true },
        },
        customer_services: {
          select: { service_name: true },
        },
        service_items: {
          select: { item_name: true, item_description: true },
        },
        service_sectors: {
          select: {
            sectors: { select: { name: true } },
          },
        },
        service_areas: {
          select: {
            areas_cliente: { select: { descripcion_corta: true } },
          },
        },
        preparte: {
          select: { numero_pedido: true },
        },
        dailyreportemployeerelations: {
          select: {
            id: true,
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
                intern_number: true,
                serial_number: true,
              },
            },
          },
        },
        dailyreport_customer_equipment_relations: {
          select: {
            id: true,
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

