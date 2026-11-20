'use server';

import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { parseSearchParams } from '@/shared/components/common/DataTable/helpers';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { buildOrdersWhere } from '../../MaintenanceOrders/table/lib/order-where';
import { resolveOrdersScope } from '../../MaintenanceOrders/table/lib/order-scope';
import { assembleOrdersWhere, resolveOrderListScope, scopeConditions } from '../../PedidosMantenimiento/lib/order-list-shared';
import { getResourceInternNumber, getResourceKind, getResourceLabel, visibleEquipmentTypeCondition } from '../../shared/maintenance-resource';
import { BOARD_COLUMNS, RETURNED_STATUSES, type BoardColumnDef } from '../lib/columns';
import { BOARD_COLUMN_LIMIT, type BoardCardData, type BoardColumnData, type BoardData } from '../lib/types';

const logger = new Logger('WorkOrdersBoard/board');

/** Perímetro y filtro de estado de una columna: el MISMO `where` que el contador del paso equivalente de Taller. */
async function resolveColumnWhere(column: BoardColumnDef, companyId: string) {
  switch (column.id) {
    case 'scheduling':
    case 'confirmed': {
      // Empresa, tipos de equipo ocultos (ticket 690) y filtro de supervisor, como Programación pendiente y Para ingreso.
      const scope = await resolveOrderListScope(companyId);
      return assembleOrdersWhere({ scope: scopeConditions(scope), extra: [{ status: { in: [...column.statuses] } }] });
    }
    case 'in_workshop': {
      // El `where` de la tabla «En mantenimiento» sin filtros (empresa, tipos ocultos y estados activos del paso).
      const scope = await resolveOrdersScope();
      if (!scope) throw new Error('No tenés permiso para ver esta columna');
      return buildOrdersWhere(parseSearchParams({}), scope);
    }
    case 'validation': {
      const scope = await resolveOrdersScope();
      if (!scope) throw new Error('No tenés permiso para ver esta columna');
      // Empresa, tipos ocultos y estados de la columna (incluye `pending_operations_validation`). No es el mismo conjunto
      // que «Validar cierre» de Mi bandeja, que cuenta solo `pending_workshop_validation`. Sin filtro de supervisor.
      const equipmentCondition = visibleEquipmentTypeCondition(scope.hiddenTypeIds);
      return {
        AND: [
          { company_id: companyId },
          { status: { in: [...column.statuses] } },
          ...(equipmentCondition ? [equipmentCondition] : []),
        ],
      };
    }
  }
}

/** Fecha que ordena la columna y cómo se llama. */
const DATE_FIELD: Record<BoardColumnDef['id'], { field: 'created_at' | 'scheduled_date' | 'workshop_entry_date' | 'updated_at'; label: string; kind: 'day' | 'instant' }> = {
  scheduling: { field: 'created_at', label: 'Aprobado', kind: 'instant' },
  confirmed: { field: 'scheduled_date', label: 'Recepción', kind: 'day' },
  in_workshop: { field: 'workshop_entry_date', label: 'Ingreso', kind: 'instant' },
  validation: { field: 'updated_at', label: 'Actualizado', kind: 'instant' },
};

/** Días enteros entre una fecha y hoy (hora argentina). */
function ageInDays(value: Date, kind: 'day' | 'instant'): number {
  const from = kind === 'day' ? value.toISOString().slice(0, 10) : argentinaDate(value);
  const diff = Date.parse(`${argentinaDate()}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(0, Math.round(diff / 86_400_000));
}

async function loadColumn(column: BoardColumnDef, companyId: string): Promise<BoardColumnData> {
  const base = {
    id: column.id,
    label: column.label,
    description: column.description,
    emptyTitle: column.emptyTitle,
    emptyDescription: column.emptyDescription,
  };

  try {
    const where = await resolveColumnWhere(column, companyId);
    const date = DATE_FIELD[column.id];

    // Lista acotada y totales por estado en paralelo: la columna muestra N tarjetas y el total real.
    const [rows, totals] = await Promise.all([
      prisma.maintenance_orders.findMany({
        where,
        orderBy: [{ [date.field]: 'asc' }, { id: 'asc' }],
        take: BOARD_COLUMN_LIMIT,
        select: {
          id: true,
          order_number: true,
          status: true,
          created_at: true,
          scheduled_date: true,
          workshop_entry_date: true,
          updated_at: true,
          vehicles: { select: { domain: true, serie: true, intern_number: true } },
          other_equipment: { select: { serial_number: true, intern_number: true } },
          maintenance_order_items: {
            where: { assigned_sector_id: { not: null } },
            take: 8,
            select: { workshop_sectors: { select: { name: true } } },
          },
        },
      }),
      prisma.maintenance_orders.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);

    const total = totals.reduce((sum, row) => sum + row._count._all, 0);

    const items: BoardCardData[] = rows.map((row) => {
      const value = row[date.field];
      const resourceRow = { vehicles: row.vehicles, other_equipment: row.other_equipment };
      const sectors = [...new Set(row.maintenance_order_items.map((item) => item.workshop_sectors?.name).filter((name): name is string => !!name))];
      return {
        id: row.id,
        orderNumber: row.order_number,
        status: row.status ?? '',
        resource: {
          kind: getResourceKind(resourceRow) === 'other_equipment' ? 'equipment' : 'vehicle',
          identifier: getResourceLabel(resourceRow),
          internNumber: getResourceInternNumber(resourceRow),
        },
        date: value ? value.toISOString() : null,
        dateLabel: date.label,
        dateKind: date.kind,
        ageDays: value ? ageInDays(value, date.kind) : null,
        sectors: sectors.slice(0, 3),
        returned: RETURNED_STATUSES.includes(row.status ?? ''),
      };
    });

    return { ...base, total, items };
  } catch (error) {
    logger.error('Error al cargar una columna del tablero de órdenes', { data: { error, column: column.id } });
    return { ...base, total: null, items: [], error: 'No se pudo cargar esta columna' };
  }
}

/**
 * Tablero de órdenes de Taller (solo lectura): una columna por etapa, con las 50 más antiguas y el total real.
 *
 * El permiso se verifica acá, en el servidor: cada columna exige el `view` de la pestaña de su paso equivalente
 * (Programación → `pedidos_pendientes`, Para ingreso → `pedidos_confirmados`, En taller y Esperan validación →
 * `ordenes_mantenimiento`). Gomería es un circuito aparte y no entra. Cada columna carga aislada: una que falla
 * queda con su error y las demás siguen.
 */
export async function getBoardColumns(): Promise<BoardData> {
  const [permissions, companyId] = await Promise.all([getUserPermissionsMapServer(), getActiveCompanyId()]);
  const visible = BOARD_COLUMNS.filter((column) => permissions[`mantenimiento:${column.tab}:view`] === true);
  if (visible.length === 0) return { columns: [] };

  const columns = await Promise.all(visible.map((column) => loadColumn(column, companyId)));
  return { columns };
}
