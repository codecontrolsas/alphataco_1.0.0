'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

const logger = new Logger('features/Operaciones/PartesDiarios/detail/form-data/row-form');

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
        remit_number: true,
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
