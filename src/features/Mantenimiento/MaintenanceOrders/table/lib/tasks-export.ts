import 'server-only';

import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { getResourceInternNumber, getResourceLabel } from '../../../shared/maintenance-resource';
import { buildOrdersWhere } from './order-where';

const logger = new Logger('MaintenanceOrders/table/tasks-export');

const MAX_EXPORT_ROWS = 10_000;

/** Datos de la orden (OM) que se repiten en cada fila de tarea del export. */
const TASK_EXPORT_ORDER_SELECT = {
  order_number: true,
  description: true,
  status: true,
  workshop_entry_date: true,
  created_at: true,
  vehicles: { select: { id: true, domain: true, serie: true, intern_number: true } },
  other_equipment: { select: { id: true, serial_number: true, intern_number: true } },
  maintenance_requests: { select: { description: true } },
} as const;

export interface MaintenanceOrderTaskExportRow {
  om_order_number: string | null;
  ot_order_number: string | null;
  vehicle_label: string;
  task_name: string;
  type_of_maintenance: string | null;
  task_status: string;
  task_sector: string | null;
  is_diagnostico: boolean;
  om_status: string;
  workshop_entry_date: Date | null;
  created_at: Date | null;
  description: string;
}

/**
 * Excel a nivel de tarea (ticket 682): una fila por `work_order_item_repairs`.
 * Recorre work_order_item_repairs → work_order_items → (work_orders [OT] + maintenance_order_items →
 * maintenance_orders [OM]) y reutiliza `buildOrdersWhere` (misma empresa y filtros que la grilla).
 */
export async function loadTasksForExport(
  companyId: string,
  hiddenTypeIds: readonly string[],
  searchParams: DataTableSearchParams
): Promise<ExportResult<MaintenanceOrderTaskExportRow[]>> {
  try {
    const state = parseSearchParams(searchParams);
    const where = await buildOrdersWhere(state, { companyId, hiddenTypeIds });

    const repairs = await prisma.work_order_item_repairs.findMany({
      where: { work_order_items: { maintenance_order_items: { maintenance_orders: where } } },
      take: MAX_EXPORT_ROWS + 1,
      select: {
        status: true,
        is_diagnostico: true,
        types_of_repairs: { select: { name: true, type_of_maintenance: true } },
        work_order_items: {
          select: {
            work_orders: { select: { order_number: true, workshop_sectors: { select: { name: true } } } },
            maintenance_order_items: { select: { maintenance_orders: { select: TASK_EXPORT_ORDER_SELECT } } },
          },
        },
      },
    });

    if (repairs.length > MAX_EXPORT_ROWS) {
      return {
        ok: false,
        message: `La exportación supera las ${MAX_EXPORT_ROWS.toLocaleString('es-AR')} tareas. Acotala con filtros.`,
      };
    }

    const rows = repairs.map((repair): MaintenanceOrderTaskExportRow => {
      const workOrder = repair.work_order_items.work_orders;
      const order = repair.work_order_items.maintenance_order_items.maintenance_orders;
      const intern = getResourceInternNumber(order);

      return {
        om_order_number: order.order_number,
        ot_order_number: workOrder.order_number,
        vehicle_label: getResourceLabel(order) + (intern ? ` (#${intern})` : ''),
        task_name: repair.types_of_repairs.name,
        type_of_maintenance: repair.types_of_repairs.type_of_maintenance,
        task_status: repair.status,
        task_sector: workOrder.workshop_sectors?.name ?? null,
        is_diagnostico: repair.is_diagnostico,
        om_status: order.status,
        workshop_entry_date: order.workshop_entry_date,
        created_at: order.created_at,
        description: order.description ?? order.maintenance_requests?.description ?? '',
      };
    });

    // Orden: N° OM, luego N° OT, luego nombre de tarea
    rows.sort(
      (a, b) =>
        (a.om_order_number ?? '').localeCompare(b.om_order_number ?? '') ||
        (a.ot_order_number ?? '').localeCompare(b.ot_order_number ?? '') ||
        a.task_name.localeCompare(b.task_name)
    );

    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar tareas de órdenes de mantenimiento', { data: { error } });
    return { ok: false, message: 'No se pudo generar la exportación' };
  }
}
