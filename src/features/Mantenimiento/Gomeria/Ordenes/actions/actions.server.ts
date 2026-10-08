'use server';

import { checkVehicleTireReadiness } from '@/features/Mantenimiento/Gomeria/shared/check-vehicle-tire-readiness';
import {
  assertServiceOrderInActiveCompany,
  assertTireInCompany,
  assertVehicleInActiveCompany,
  assertVehicleInCompany,
  getServiceOrderCompanyId,
  getVehicleCompanyId,
} from '@/features/Mantenimiento/Gomeria/shared/perimeter';
import { getResourceCompanyId } from '@/features/Mantenimiento/shared/resource-company';
import { resolveVehicleTireTemplateId } from '@/features/Mantenimiento/Gomeria/shared/resolve-template';
import type { DiagramAxle } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { calculatePositions } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { TIRE_READINESS_MESSAGES } from '@/features/Mantenimiento/Gomeria/shared/tire-readiness-messages';
import type { TireOldDestination, TireServiceOrderStatus, TireStatus } from '@/generated/prisma/enums';
import { tireStatusLabels } from '@/features/Mantenimiento/Gomeria/shared/tire-mappers';
import { Logger } from '@/lib/logger';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { toGomeriaActionError } from '@/features/Mantenimiento/Gomeria/shared/action-error';
import { reverseStockMovement } from '@/features/Warehouses/lib/stock-engine';
import { mountTire, returnTire, writeOffTire } from '@/features/Warehouses/lib/tire-stock';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/** Varias llamadas al motor de stock por operacion: mas margen que los 5 s por defecto. */
const GOMERIA_TX_OPTIONS = { timeout: 30_000, maxWait: 5_000 };

const logger = new Logger('features/Mantenimiento/Gomeria/Ordenes');

// ============================================================================
// CONSTANTS
// ============================================================================

const SERVICE_ORDER_SELECT = {
  id: true,
  vehicle_id: true,
  trailer_vehicle_id: true,
  kilometer: true,
  service_date: true,
  status: true,
  created_by: true,
  created_at: true,
  closed_at: true,
  vehicle: { select: { id: true, domain: true, intern_number: true, sub_type: { select: { name: true } } } },
  trailer: { select: { id: true, domain: true, intern_number: true, sub_type: { select: { name: true } } } },
  creator: { select: { id: true, fullname: true } },
  _count: { select: { items: true } },
} as const;

const VALID_SORT_FIELDS = new Set([
  'service_date',
  'kilometer',
  'status',
  'created_at',
  'closed_at',
  'vehicle_id',
  'trailer_vehicle_id',
  'created_by',
]);

const FK_SORT_MAP: Record<string, (dir: 'asc' | 'desc') => Record<string, unknown>> = {
  vehicle_id: (dir) => ({ vehicle: { domain: dir } }),
  trailer_vehicle_id: (dir) => ({ trailer: { domain: dir } }),
  created_by: (dir) => ({ creator: { fullname: dir } }),
};

const TEXT_FILTER_COLUMNS = ['kilometer'];
const DATE_RANGE_COLUMNS = ['service_date', 'created_at'];

// ============================================================================
// INTERNAL WHERE BUILDER
// ============================================================================

function buildServiceOrdersWhereClause(state: ReturnType<typeof parseSearchParams>, companyId: string) {
  const searchWhere = buildSearchWhere(state.search, ['kilometer']);

  const filtersWhere = buildFiltersWhere(
    state.filters,
    {},
    {
      exclude: [...TEXT_FILTER_COLUMNS, ...DATE_RANGE_COLUMNS.flatMap((c) => [`${c}_from`, `${c}_to`])],
    }
  );

  const textFiltersWhere = buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS);
  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);

  const filtersWhereAndConditions = (filtersWhere.AND as Record<string, unknown>[] | undefined) ?? [];
  const { AND: _discarded, ...filtersWhereWithoutAnd } = filtersWhere as Record<string, unknown> & { AND?: unknown };

  return {
    company_id: companyId,
    ...searchWhere,
    ...filtersWhereWithoutAnd,
    ...textFiltersWhere,
    ...dateFiltersWhere,
    ...(filtersWhereAndConditions.length > 0 ? { AND: filtersWhereAndConditions } : {}),
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

/**
 * Listado de órdenes del dashboard: la empresa sale de la sesión (`getActiveCompanyId`).
 * Sin ese filtro el listado devolvía las órdenes de todas las empresas.
 */
export async function getServiceOrdersPaginated(searchParams: DataTableSearchParams) {
  logger.debug('Fetching service orders paginated');

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildServiceOrdersWhereClause(state, companyId);

    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        const dir: 'asc' | 'desc' = s.desc ? 'desc' : 'asc';
        const fkMapper = FK_SORT_MAP[s.id];
        resolvedSorts.push(fkMapper ? fkMapper(dir) : { [s.id]: dir });
      }
    }
    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }];

    const [data, total] = await Promise.all([
      prisma.tire_service_orders.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: SERVICE_ORDER_SELECT,
      }),
      prisma.tire_service_orders.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error fetching service orders paginated', { data: { error } });
    throw new Error(
      `Error al obtener las órdenes de gomería: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// EXPORT QUERY
// ============================================================================

export async function getServiceOrdersForExport(searchParams: DataTableSearchParams) {
  logger.debug('Exporting service orders');

  try {
    const companyId = await getActiveCompanyId();
    const state = parseSearchParams(searchParams);
    const where = buildServiceOrdersWhereClause(state, companyId);

    const data = await prisma.tire_service_orders.findMany({
      orderBy: [{ created_at: 'desc' }],
      where,
      select: SERVICE_ORDER_SELECT,
    });

    return data;
  } catch (error) {
    logger.error('Error exporting service orders', { data: { error } });
    throw new Error('Error al exportar las órdenes de gomería');
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, cross-filtering)
// ============================================================================

export async function getServiceOrderSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<{
  counts: Map<string, number>;
  resolvedOptions?: Array<{ id: string; name: string | null }>;
} | null> {
  let companyId: string;
  try {
    companyId = await getActiveCompanyId();
  } catch {
    return null;
  }

  const baseWhere = { company_id: companyId };

  let parsedState: ReturnType<typeof parseSearchParams> | null = null;
  if (searchParams && Object.keys(searchParams).length > 0) {
    parsedState = parseSearchParams(searchParams);
  }

  const hasActiveFilters = parsedState && (Object.keys(parsedState.filters).length > 0 || parsedState.search);

  function crossWhere(excludeColumn: string) {
    if (!parsedState || !hasActiveFilters) return baseWhere;
    const modified = { ...parsedState, filters: { ...parsedState.filters } };
    delete modified.filters[excludeColumn];
    delete modified.filters[`${excludeColumn}_from`];
    delete modified.filters[`${excludeColumn}_to`];
    return buildServiceOrdersWhereClause(modified, companyId);
  }

  function toFacetMap(rows: { key: string | null | undefined; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const { key, count } of rows) {
      if (key == null) {
        map.set(NULL_FILTER_VALUE, (map.get(NULL_FILTER_VALUE) ?? 0) + count);
      } else {
        map.set(String(key), count);
      }
    }
    return map;
  }

  try {
    const where = crossWhere(columnId);

    // ── Enum: status ──────────────────────────────────────────────────────────
    if (columnId === 'status') {
      const rows = await prisma.tire_service_orders.groupBy({
        by: ['status'],
        where,
        _count: true,
      });
      return {
        counts: toFacetMap(rows.map((r) => ({ key: r.status as string, count: r._count }))),
      };
    }

    // ── FK UUID: vehicle_id ───────────────────────────────────────────────────
    if (columnId === 'vehicle_id') {
      const rows = await prisma.tire_service_orders.groupBy({
        by: ['vehicle_id'],
        where,
        _count: true,
      });
      const counts = toFacetMap(rows.map((r) => ({ key: r.vehicle_id, count: r._count })));
      const ids = rows.map((r) => r.vehicle_id).filter(Boolean) as string[];
      const resolvedOptions =
        ids.length > 0
          ? (
              await prisma.vehicles.findMany({
                where: { id: { in: ids } },
                select: { id: true, domain: true },
                orderBy: { domain: 'asc' },
              })
            ).map((v) => ({ id: v.id, name: v.domain }))
          : [];
      return { counts, resolvedOptions };
    }

    // ── FK UUID nullable: trailer_vehicle_id ──────────────────────────────────
    if (columnId === 'trailer_vehicle_id') {
      const rows = await prisma.tire_service_orders.groupBy({
        by: ['trailer_vehicle_id'],
        where,
        _count: true,
      });
      const counts = toFacetMap(rows.map((r) => ({ key: r.trailer_vehicle_id, count: r._count })));
      const ids = rows.map((r) => r.trailer_vehicle_id).filter((id): id is string => id != null);
      const resolvedOptions =
        ids.length > 0
          ? (
              await prisma.vehicles.findMany({
                where: { id: { in: ids } },
                select: { id: true, domain: true },
                orderBy: { domain: 'asc' },
              })
            ).map((v) => ({ id: v.id, name: v.domain }))
          : [];
      return { counts, resolvedOptions };
    }

    // ── FK UUID: created_by ───────────────────────────────────────────────────
    if (columnId === 'created_by') {
      const rows = await prisma.tire_service_orders.groupBy({
        by: ['created_by'],
        where,
        _count: true,
      });
      const counts = toFacetMap(rows.map((r) => ({ key: r.created_by, count: r._count })));
      const ids = rows.map((r) => r.created_by).filter(Boolean) as string[];
      const resolvedOptions =
        ids.length > 0
          ? await prisma.profile.findMany({
              where: { id: { in: ids } },
              select: { id: true, fullname: true },
              orderBy: { fullname: 'asc' },
            })
          : [];
      return {
        counts,
        resolvedOptions: resolvedOptions.map((p) => ({ id: p.id, name: p.fullname })),
      };
    }

    logger.warn('getServiceOrderSingleFacet: unknown columnId', { data: { columnId } });
    return null;
  } catch (error) {
    logger.error('Error getting service order single facet', { data: { error, columnId } });
    return null;
  }
}

// ============================================================================
// DETAIL QUERY
// ============================================================================

/**
 * Detalle de una orden para el dashboard: la empresa sale de la sesión y el id de la ruta
 * sólo resuelve si la orden es de esa empresa (antes cualquier uuid de orden era legible).
 */
export async function getServiceOrderById(id: string) {
  logger.debug('Fetching service order by id', { data: { id } });

  try {
    const companyId = await getActiveCompanyId();
    const order = await prisma.tire_service_orders.findFirst({
      where: { id, company_id: companyId },
      include: {
        vehicle: { select: { id: true, domain: true, intern_number: true, sub_type: { select: { name: true } } } },
        trailer: { select: { id: true, domain: true, intern_number: true, sub_type: { select: { name: true } } } },
        creator: { select: { id: true, fullname: true } },
        items: {
          select: {
            id: true,
            position_number: true,
            action: true,
            old_tire_destination: true,
            tread_depth: true,
            pressure_start: true,
            pressure_end: true,
            observations: true,
            created_at: true,
            tire: {
              select: {
                id: true,
                serial_number: true,
                status: true,
                brand: { select: { id: true, name: true } },
                tire_type: { select: { id: true, size: true, tread_type: true } },
              },
            },
            new_tire: {
              select: {
                id: true,
                serial_number: true,
                brand: { select: { id: true, name: true } },
                tire_type: { select: { id: true, size: true, tread_type: true } },
              },
            },
          },
          orderBy: { position_number: 'asc' },
        },
      },
    });

    return order;
  } catch (error) {
    logger.error('Error fetching service order by id', { data: { error, id } });
    throw error;
  }
}

// ============================================================================
// CREATE SERVICE ORDER
// ============================================================================

/**
 * Abre una orden de gomería para un vehículo.
 *
 * La empresa la deriva el SERVIDOR del vehículo (`getResourceCompanyId`) y no llega más
 * como parámetro: este flujo también corre desde el QR anónimo, donde no hay empresa
 * activa, y un `company_id` de parámetro permitía abrir órdenes en cualquier empresa.
 */
export async function createServiceOrder(data: {
  vehicle_id: string;
  trailer_vehicle_id?: string | null;
  kilometer?: string | null;
}) {
  const profile = await requireServerAuthProfile();
  logger.debug('Creating service order', { data: { vehicle_id: data.vehicle_id } });

  try {
    const companyId = await getResourceCompanyId(prisma, 'vehicle', data.vehicle_id);

    // Validar readiness del vehículo
    const vehicleData = await prisma.vehicles.findUnique({
      where: { id: data.vehicle_id },
      select: { domain: true },
    });
    const vehicleDomain = vehicleData?.domain ?? data.vehicle_id;

    const vehicleReadiness = await checkVehicleTireReadiness(data.vehicle_id);
    if (!vehicleReadiness.ready) {
      throw new Error(TIRE_READINESS_MESSAGES.no_template(vehicleDomain));
    }

    // Validar readiness del trailer si aplica
    if (data.trailer_vehicle_id) {
      // El enganche llega del cliente: tiene que ser de la misma empresa que el vehículo.
      await assertVehicleInCompany(prisma, data.trailer_vehicle_id, companyId);

      const trailerData = await prisma.vehicles.findUnique({
        where: { id: data.trailer_vehicle_id },
        select: { domain: true },
      });
      const trailerDomain = trailerData?.domain ?? data.trailer_vehicle_id;

      const trailerReadiness = await checkVehicleTireReadiness(data.trailer_vehicle_id);
      if (!trailerReadiness.ready) {
        throw new Error(TIRE_READINESS_MESSAGES.no_template(trailerDomain));
      }
    }

    // Snapshot current tire positions for historical diagram reconstruction
    const vehiclePositions = await fetchVehicleTirePositions(data.vehicle_id);
    let trailerPositions: Awaited<ReturnType<typeof fetchVehicleTirePositions>> = [];
    if (data.trailer_vehicle_id) {
      trailerPositions = await fetchVehicleTirePositions(data.trailer_vehicle_id);
    }

    const allPositions = [...vehiclePositions, ...trailerPositions];

    // Build axle snapshot (unique axle geometries)
    const axleMap = new Map<string, object>();
    for (const pos of allPositions) {
      if (!pos.template_axle) continue;
      if (!axleMap.has(pos.template_axle.id)) {
        axleMap.set(pos.template_axle.id, {
          id: pos.template_axle.id,
          axle_number: pos.template_axle.axle_number,
          tires_per_side: pos.template_axle.tires_per_side,
          tire_size: pos.template_axle.tire_size,
          is_drive_axle: pos.template_axle.is_drive_axle,
          is_spare: pos.template_axle.is_spare,
        });
      }
    }

    // Build positions snapshot (all positions with tire details)
    const positionsSnapshot = allPositions.map((pos) => ({
      position_number: pos.position_number,
      axle_number: pos.axle_number,
      side: pos.side,
      vehicle_id: pos.vehicle_id,
      tire_id: pos.tire_id,
      tire_serial: pos.tire?.serial_number ?? null,
      tire_brand: pos.tire?.brand?.name ?? null,
      tire_size: pos.tire?.tire_type?.size ?? null,
      tire_tread_type: pos.tire?.tire_type?.tread_type ?? null,
      tire_status: pos.tire?.status ?? null,
      tire_is_new: pos.tire?.is_new ?? null,
      tire_tread_depth: pos.tire?.tread_depth ? Number(pos.tire.tread_depth) : null,
    }));

    const order = await prisma.tire_service_orders.create({
      data: {
        vehicle_id: data.vehicle_id,
        trailer_vehicle_id: data.trailer_vehicle_id ?? null,
        kilometer: data.kilometer ?? null,
        service_date: new Date(),
        created_by: profile.id,
        company_id: companyId,
        axle_snapshot: Array.from(axleMap.values()),
        positions_snapshot: positionsSnapshot,
      },
    });
    return order;
  } catch (error) {
    logger.error('Error creating service order', { data: { error } });
    throw error;
  }
}

// ============================================================================
// CLOSE SERVICE ORDER
// ============================================================================

/** Cierre de la orden, una vez que el llamador validó el perímetro que le corresponde. */
async function markServiceOrderClosed(id: string) {
  return prisma.tire_service_orders.update({
    where: { id },
    data: {
      status: 'CLOSED' as TireServiceOrderStatus,
      closed_at: new Date(),
    },
  });
}

/**
 * Finaliza una orden desde el dashboard: la orden tiene que ser de la empresa activa.
 *
 * Antes era una sola función para el dashboard y el QR, y el único chequeo era que la
 * orden existiera: cualquier usuario autenticado que conociera el uuid cerraba la orden de
 * otra empresa. El QR no necesitaba ese permiso tan amplio, tiene su propia variante
 * (`closeServiceOrderForVehicle`), igual que `createTire`/`createTireForVehicle`.
 */
export async function closeServiceOrder(id: string) {
  logger.debug('Closing service order', { data: { id } });

  try {
    await assertServiceOrderInActiveCompany(id);
    return await markServiceOrderClosed(id);
  } catch (error) {
    logger.error('Error closing service order', { data: { error, id } });
    throw error;
  }
}

/**
 * Finaliza la orden del asistente de gomería (alcanzable desde el QR anónimo): la empresa
 * sale del vehículo que se está atendiendo y no de la sesión, porque el operario del QR no
 * es miembro de la empresa.
 *
 * El vehículo es el de la ruta escaneada, así que exigir que la orden sea de ese vehículo
 * acota el cierre a la orden que el asistente tiene abierta: un uuid de orden ajeno ya no
 * alcanza.
 */
export async function closeServiceOrderForVehicle(id: string, vehicleId: string) {
  logger.debug('Closing service order for vehicle', { data: { id, vehicleId } });

  try {
    const companyId = await getVehicleCompanyId(prisma, vehicleId);

    const order = await prisma.tire_service_orders.findFirst({
      where: { id, vehicle_id: vehicleId, company_id: companyId },
      select: { id: true },
    });
    if (!order) throw new Error('La orden de gomería no pertenece al equipo que se está atendiendo');

    return await markServiceOrderClosed(id);
  } catch (error) {
    logger.error('Error closing service order for vehicle', { data: { error, id, vehicleId } });
    throw error;
  }
}

// ============================================================================
// CANCEL SERVICE ORDER
// ============================================================================

/**
 * Anular una orden es una acción del dashboard: la orden tiene que ser de la empresa activa.
 * Antes de revertir los estados anula, en orden inverso, los movimientos de stock de cada item
 * (devoluciones y montajes, Almacenes etapa 6).
 */
export async function cancelServiceOrder(id: string): Promise<ActionResult> {
  logger.debug('Cancelling service order', { data: { id } });

  try {
    await assertServiceOrderInActiveCompany(id);
    const profile = await requireServerAuthProfile();

    await withActor(profile.credentialId, async (tx) => {
      // 1. Fetch the order and verify it's OPEN
      const order = await tx.tire_service_orders.findUnique({
        where: { id },
        select: { id: true, status: true, company_id: true },
      });

      if (!order) {
        throw new Error('Orden no encontrada');
      }
      if (order.status !== 'OPEN') {
        throw new Error('Solo se pueden cancelar órdenes en estado Abierta');
      }

      // 2. Fetch all service items
      const items = await tx.tire_service_items.findMany({
        where: { service_order_id: id },
        orderBy: { created_at: 'desc' },
      });

      // 3. Check if any item has old_tire_destination = DISCARD
      const hasDiscardedTires = items.some((item) => item.old_tire_destination === ('DISCARD' as TireOldDestination));
      if (hasDiscardedTires) {
        throw new Error('No se puede cancelar: la orden contiene cubiertas descartadas');
      }

      // 4. Stock: anular devoluciones y montajes, del item mas nuevo al mas viejo. Dentro de un
      //    item, primero la devolucion de la que salio y despues el montaje de la que entro.
      for (const item of items) {
        for (const movementId of [item.return_movement_id, item.mount_movement_id]) {
          if (!movementId) continue;
          await reverseStockMovement(tx, order.company_id, profile.id, movementId, 'Anulación de la orden de gomería');
        }
      }

      // 5. Reverse items in reverse chronological order (already sorted desc by created_at)
      for (const item of items) {
        if (item.action === 'CALIBRATE') {
          // No status to reverse for calibration
          continue;
        }

        // Las cubiertas tienen que seguir como las dejo la orden: si despues se marcaron como
        // reparadas o encontradas (y volvieron al deposito), revertir las dejaria montadas segun
        // Gomeria y en el deposito segun Almacenes.
        await assertTireStatusForCancel(tx, item.tire_id, expectedOldTireStatus(item));
        if (item.new_tire_id) await assertTireStatusForCancel(tx, item.new_tire_id, 'INSTALLED');

        if (item.action === 'REPLACE') {
          // Reverse new tire back to AVAILABLE
          if (item.new_tire_id) {
            await tx.tires.update({
              where: { id: item.new_tire_id },
              data: { status: 'AVAILABLE' },
            });
          }

          // Reverse old tire back to INSTALLED (if it was moved out)
          if (item.tire_id && (item.old_tire_destination === 'AVAILABLE' || item.old_tire_destination === 'REPAIR')) {
            await tx.tires.update({
              where: { id: item.tire_id },
              data: { status: 'INSTALLED' },
            });
            // Restore the position
            await tx.vehicle_tire_positions.updateMany({
              where: {
                vehicle_id: item.vehicle_id,
                position_number: item.position_number,
              },
              data: { tire_id: item.tire_id },
            });
          }
        }

        if (item.action === 'REPAIR') {
          // Reverse new tire back to AVAILABLE
          if (item.new_tire_id) {
            await tx.tires.update({
              where: { id: item.new_tire_id },
              data: { status: 'AVAILABLE' },
            });
          }
          // Reverse old tire back to INSTALLED and restore position
          if (item.tire_id) {
            await tx.tires.update({
              where: { id: item.tire_id },
              data: { status: 'INSTALLED' },
            });
            await tx.vehicle_tire_positions.updateMany({
              where: {
                vehicle_id: item.vehicle_id,
                position_number: item.position_number,
              },
              data: { tire_id: item.tire_id },
            });
          }
        }

        if (item.action === 'MISSING_REPORT' && item.tire_id) {
          // Reverse missing report: restore tire to INSTALLED and restore position
          await tx.tires.update({
            where: { id: item.tire_id },
            data: { status: 'INSTALLED' },
          });
          await tx.vehicle_tire_positions.updateMany({
            where: {
              vehicle_id: item.vehicle_id,
              position_number: item.position_number,
            },
            data: { tire_id: item.tire_id },
          });
        }

        // Initial assign: tire_id is null in item, new_tire was placed for the first time
        if (!item.tire_id && item.new_tire_id) {
          await tx.tires.update({
            where: { id: item.new_tire_id },
            data: { status: 'AVAILABLE' },
          });
          await tx.vehicle_tire_positions.updateMany({
            where: {
              vehicle_id: item.vehicle_id,
              position_number: item.position_number,
            },
            data: { tire_id: null },
          });
        }
      }

      // 6. Delete the order (cascades to items)
      await tx.tire_service_orders.delete({ where: { id } });
    }, prisma, GOMERIA_TX_OPTIONS);

    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'cancelar la orden');
  }
}

/** Estado en que la orden dejo la cubierta que salio de la posicion (null si no hay que verificarla). */
function expectedOldTireStatus(item: {
  action: string;
  tire_id: string | null;
  old_tire_destination: TireOldDestination | null;
}): TireStatus | null {
  if (!item.tire_id) return null;
  if (item.action === 'REPAIR') return 'IN_REPAIR';
  if (item.action === 'MISSING_REPORT') return 'MISSING';
  if (item.action === 'REPLACE') {
    if (item.old_tire_destination === 'REPAIR') return 'IN_REPAIR';
    if (item.old_tire_destination === 'AVAILABLE') return 'AVAILABLE';
  }
  return null;
}

async function assertTireStatusForCancel(
  tx: Pick<typeof prisma, 'tires'>,
  tireId: string | null,
  expected: TireStatus | null
): Promise<void> {
  if (!tireId || !expected) return;
  const tire = await tx.tires.findUnique({ where: { id: tireId }, select: { serial_number: true, status: true } });
  if (tire && tire.status !== expected) {
    throw new Error(
      `No se puede anular la orden: la cubierta ${tire.serial_number} cambió de estado después (hoy está ${tireStatusLabels[tire.status]?.toLowerCase() ?? tire.status})`
    );
  }
}

// ============================================================================
// GET VEHICLE TIRE POSITIONS
// ============================================================================

/**
 * Posiciones de un vehículo sin perímetro propio: helper interno para los flujos que ya
 * resolvieron la empresa del vehículo (el alta de la orden, que corre también desde el QR).
 * NO exportar: quien la llame tiene que haber validado el vehículo antes.
 */
async function fetchVehicleTirePositions(vehicleId: string) {
  const positions = await prisma.vehicle_tire_positions.findMany({
    where: { vehicle_id: vehicleId },
    include: {
      tire: {
        select: {
          id: true,
          serial_number: true,
          is_new: true,
          retread_level: true,
          tread_depth: true,
          status: true,
          brand: { select: { id: true, name: true } },
          tire_type: { select: { id: true, size: true, tread_type: true } },
        },
      },
      template_axle: {
        select: {
          id: true,
          axle_number: true,
          tires_per_side: true,
          tire_size: true,
          is_drive_axle: true,
          is_spare: true,
        },
      },
    },
    orderBy: { position_number: 'asc' },
  });
  return positions;
}

/**
 * Posiciones de un vehículo para el detalle de orden del dashboard: el vehículo tiene que
 * ser de la empresa activa.
 */
export async function getVehicleTirePositions(vehicleId: string) {
  logger.debug('Fetching vehicle tire positions', { data: { vehicleId } });

  try {
    await assertVehicleInActiveCompany(vehicleId);

    const positions = await prisma.vehicle_tire_positions.findMany({
      where: { vehicle_id: vehicleId },
      include: {
        tire: {
          select: {
            id: true,
            serial_number: true,
            is_new: true,
            retread_level: true,
            tread_depth: true,
            status: true,
            brand: { select: { id: true, name: true } },
            tire_type: { select: { id: true, size: true, tread_type: true } },
          },
        },
        template_axle: {
          select: {
            id: true,
            axle_number: true,
            tires_per_side: true,
            tire_size: true,
            is_drive_axle: true,
            is_spare: true,
          },
        },
      },
      orderBy: { position_number: 'asc' },
    });
    return positions;
  } catch (error) {
    logger.error('Error fetching vehicle tire positions', { data: { error, vehicleId } });
    throw error;
  }
}

// ============================================================================
// GET AVAILABLE TIRES
// ============================================================================

/**
 * Stock de cubiertas disponibles (y extraviadas) de la empresa del vehículo que se está
 * atendiendo.
 *
 * La empresa sale del vehículo y no de la sesión: el picker se usa tanto desde el
 * dashboard como desde el QR anónimo. Antes no filtraba por empresa y listaba el stock de
 * todas.
 *
 * Ya NO se filtra por la medida del eje: el operario elige la cubierta que
 * corresponde (su medida es visible en cada fila). Ordenadas por medida y luego por serie
 * para facilitar la búsqueda.
 *
 * Una cubierta con stock solo se monta si está en un depósito (Almacenes etapa 6): las
 * extraviadas con stock no se ofrecen hasta que se marcan como encontradas.
 */
export async function getAvailableTiresForVehicle(vehicleId: string) {
  logger.debug('Fetching available tires', { data: { vehicleId } });

  try {
    const companyId = await getVehicleCompanyId(prisma, vehicleId);

    const tires = await prisma.tires.findMany({
      where: {
        company_id: companyId,
        is_active: true,
        OR: [
          { status: 'AVAILABLE', OR: [{ material_unit_id: null }, { material_unit: { status: 'IN_STOCK' } }] },
          { status: 'MISSING', material_unit_id: null },
        ],
      },
      select: {
        id: true,
        serial_number: true,
        status: true,
        is_new: true,
        retread_level: true,
        tread_depth: true,
        brand: { select: { id: true, name: true } },
        tire_type: { select: { id: true, size: true, tread_type: true } },
        material_unit: { select: { warehouse: { select: { name: true } } } },
      },
      orderBy: [{ tire_type: { size: 'asc' } }, { status: 'asc' }, { serial_number: 'asc' }],
    });
    return tires;
  } catch (error) {
    logger.error('Error fetching available tires', { data: { error } });
    throw error;
  }
}

/**
 * Depósitos activos de la empresa del vehículo atendido, para elegir adónde vuelve la
 * cubierta que se desmonta a "Disponible". La empresa sale del vehículo (flujo del QR).
 */
export async function getTireReturnWarehousesForVehicle(vehicleId: string) {
  const companyId = await getVehicleCompanyId(prisma, vehicleId);
  return prisma.warehouses.findMany({
    where: { company_id: companyId, is_active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

// ============================================================================
// CALIBRATE
// ============================================================================

/**
 * Calibración de una posición. La empresa sale de la orden (el flujo corre desde el QR) y
 * el vehículo y la cubierta que llegan del cliente tienen que ser de esa misma empresa.
 */
export async function performCalibration(data: {
  serviceOrderId: string;
  positionNumber: number;
  vehicleId: string;
  tireId: string;
  treadDepth?: number;
  pressureStart?: number;
  pressureEnd?: number;
  observations?: string;
}) {
  logger.debug('Performing calibration', {
    data: { serviceOrderId: data.serviceOrderId, positionNumber: data.positionNumber },
  });

  try {
    const companyId = await getServiceOrderCompanyId(prisma, data.serviceOrderId);
    await assertVehicleInCompany(prisma, data.vehicleId, companyId);
    await assertTireInCompany(prisma, data.tireId, companyId);

    // Assert: tire exists at this position and matches tireId
    const position = await prisma.vehicle_tire_positions.findFirst({
      where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
    });
    if (!position) {
      throw new Error(`Posición ${data.positionNumber} no encontrada para el vehículo`);
    }
    if (position.tire_id !== data.tireId) {
      throw new Error(`La cubierta en la posición ${data.positionNumber} no coincide con la cubierta esperada`);
    }

    // Create service item
    await prisma.tire_service_items.create({
      data: {
        service_order_id: data.serviceOrderId,
        position_number: data.positionNumber,
        vehicle_id: data.vehicleId,
        action: 'CALIBRATE',
        tire_id: data.tireId,
        tread_depth: data.treadDepth != null ? String(data.treadDepth) : null,
        pressure_start: data.pressureStart != null ? String(data.pressureStart) : null,
        pressure_end: data.pressureEnd != null ? String(data.pressureEnd) : null,
        observations: data.observations ?? null,
      },
    });

    // Update tread_depth on the tire if provided
    if (data.treadDepth != null) {
      await prisma.tires.update({
        where: { id: data.tireId },
        data: { tread_depth: String(data.treadDepth) },
      });
    }

    return { success: true };
  } catch (error) {
    logger.error('Error performing calibration', { data: { error } });
    throw error;
  }
}

// ============================================================================
// REPAIR (atomic: old → IN_REPAIR, new → INSTALLED)
// ============================================================================

/**
 * Reparación: sale la cubierta actual y entra otra del stock. La empresa sale de la orden
 * (flujo del QR) y las dos cubiertas y el vehículo tienen que pertenecerle.
 */
export async function performRepair(data: {
  serviceOrderId: string;
  positionNumber: number;
  vehicleId: string;
  tireId: string;
  newTireId: string;
  observations?: string;
}): Promise<ActionResult> {
  logger.debug('Performing repair', {
    data: { serviceOrderId: data.serviceOrderId, positionNumber: data.positionNumber },
  });

  try {
    const profile = await requireServerAuthProfile();
    await withActor(profile.credentialId, async (tx) => {
      const companyId = await getServiceOrderCompanyId(tx, data.serviceOrderId);
      await assertVehicleInCompany(tx, data.vehicleId, companyId);
      await assertTireInCompany(tx, data.tireId, companyId);
      await assertTireInCompany(tx, data.newTireId, companyId);

      // 1. Assert old tire matches the position
      const position = await tx.vehicle_tire_positions.findFirst({
        where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
      });
      if (!position) {
        throw new Error(`Posición ${data.positionNumber} no encontrada`);
      }
      if (position.tire_id !== data.tireId) {
        throw new Error(`La cubierta en la posición ${data.positionNumber} no coincide con la cubierta esperada`);
      }

      // 2. Assert new tire is AVAILABLE or MISSING
      const newTire = await tx.tires.findUnique({ where: { id: data.newTireId } });
      if (!newTire) throw new Error('Cubierta de reemplazo no encontrada');
      if (newTire.status !== 'AVAILABLE' && newTire.status !== 'MISSING') {
        throw new Error(
          `La cubierta de reemplazo (${newTire.serial_number}) no está disponible — estado actual: ${newTire.status}`
        );
      }

      // 3. Old tire → IN_REPAIR (sin movimiento: sigue imputada al vehiculo hasta que vuelve)
      await tx.tires.update({
        where: { id: data.tireId },
        data: { status: 'IN_REPAIR' },
      });

      // 3b. Stock: la que entra sale de su deposito al vehiculo (Almacenes etapa 6).
      const mount = await mountTire(tx, companyId, profile.id, {
        tireId: data.newTireId,
        vehicleId: data.vehicleId,
        reference: await tireServiceReference(tx, data.vehicleId, data.positionNumber),
      });

      // 4. New tire → INSTALLED
      await tx.tires.update({
        where: { id: data.newTireId },
        data: { status: 'INSTALLED' },
      });

      // 5. Update position → new tire
      await tx.vehicle_tire_positions.updateMany({
        where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
        data: { tire_id: data.newTireId },
      });

      // 6. Create service item
      await tx.tire_service_items.create({
        data: {
          service_order_id: data.serviceOrderId,
          position_number: data.positionNumber,
          vehicle_id: data.vehicleId,
          action: 'REPAIR',
          tire_id: data.tireId,
          new_tire_id: data.newTireId,
          observations: data.observations ?? null,
          mount_movement_id: mount?.id ?? null,
        },
      });
    }, prisma, GOMERIA_TX_OPTIONS);

    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'registrar la reparación');
  }
}

/** Referencia de los movimientos de stock de una orden de gomeria: "Gomería AB123CD, posición 3". */
async function tireServiceReference(
  tx: Pick<typeof prisma, 'vehicles'>,
  vehicleId: string,
  positionNumber: number
): Promise<string> {
  const vehicle = await tx.vehicles.findUnique({ where: { id: vehicleId }, select: { domain: true, intern_number: true } });
  const name = vehicle?.domain || vehicle?.intern_number || 'equipo';
  return `Gomería ${name}, posición ${positionNumber}`;
}

// ============================================================================
// REPLACE (atomic: handle old tire destination, new tire → INSTALLED)
// ============================================================================

/**
 * Reemplazo (o primera asignación si `tireId` es null). La empresa sale de la orden y el
 * vehículo y las cubiertas que llegan del cliente tienen que ser de esa empresa.
 */
export async function performReplace(data: {
  serviceOrderId: string;
  positionNumber: number;
  vehicleId: string;
  tireId: string | null; // null for initial assign (empty position)
  newTireId: string;
  oldDestination?: 'AVAILABLE' | 'DISCARD' | 'REPAIR';
  /** Deposito al que vuelve la cubierta que sale a disponible (si tiene stock). */
  oldTireWarehouseId?: string | null;
  discardPhotoUrl?: string;
  discardComment?: string;
  treadDepth?: number;
  pressureStart?: number;
  pressureEnd?: number;
  observations?: string;
}): Promise<ActionResult> {
  logger.debug('Performing replace', {
    data: { serviceOrderId: data.serviceOrderId, positionNumber: data.positionNumber },
  });

  try {
    const profile = await requireServerAuthProfile();
    await withActor(profile.credentialId, async (tx) => {
      let returnMovementId: string | null = null;
      const companyId = await getServiceOrderCompanyId(tx, data.serviceOrderId);
      await assertVehicleInCompany(tx, data.vehicleId, companyId);
      if (data.tireId !== null) await assertTireInCompany(tx, data.tireId, companyId);
      await assertTireInCompany(tx, data.newTireId, companyId);

      if (data.tireId !== null) {
        // 1. Assert old tire matches the position
        const position = await tx.vehicle_tire_positions.findFirst({
          where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
        });
        if (!position) {
          throw new Error(`Posición ${data.positionNumber} no encontrada`);
        }
        if (position.tire_id !== data.tireId) {
          throw new Error(`La cubierta en la posición ${data.positionNumber} no coincide con la cubierta esperada`);
        }

        // 2. Handle old tire destination (y su stock: vuelve al deposito o se da de baja)
        if (data.oldDestination === 'AVAILABLE') {
          const returned = await returnTire(tx, companyId, profile.id, {
            tireId: data.tireId,
            warehouseId: data.oldTireWarehouseId ?? null,
            notes: 'Desmontada en la orden de gomería',
          });
          returnMovementId = returned?.id ?? null;
          await tx.tires.update({
            where: { id: data.tireId },
            data: { status: 'AVAILABLE' },
          });
        } else if (data.oldDestination === 'DISCARD') {
          await writeOffTire(tx, companyId, profile.id, {
            tireId: data.tireId,
            reason: 'BROKEN',
            notes: data.discardComment ?? '',
          });
          await tx.tires.update({
            where: { id: data.tireId },
            data: {
              status: 'DISCARDED',
              discard_photo: data.discardPhotoUrl ?? null,
              discard_comment: data.discardComment ?? null,
              discarded_at: new Date(),
            },
          });
        } else if (data.oldDestination === 'REPAIR') {
          await tx.tires.update({
            where: { id: data.tireId },
            data: { status: 'IN_REPAIR' },
          });
        }
      }

      // 3. Assert new tire is AVAILABLE or MISSING
      const newTire = await tx.tires.findUnique({ where: { id: data.newTireId } });
      if (!newTire) throw new Error('Cubierta de reemplazo no encontrada');
      if (newTire.status !== 'AVAILABLE' && newTire.status !== 'MISSING') {
        throw new Error(
          `La cubierta de reemplazo (${newTire.serial_number}) no está disponible — estado actual: ${newTire.status}`
        );
      }

      // 3b. Stock: la que entra sale de su deposito al vehiculo (Almacenes etapa 6).
      const mount = await mountTire(tx, companyId, profile.id, {
        tireId: data.newTireId,
        vehicleId: data.vehicleId,
        reference: await tireServiceReference(tx, data.vehicleId, data.positionNumber),
      });

      // 4. New tire → INSTALLED
      await tx.tires.update({
        where: { id: data.newTireId },
        data: {
          status: 'INSTALLED',
          ...(data.treadDepth != null ? { tread_depth: String(data.treadDepth) } : {}),
        },
      });

      // 5. Update position → new tire
      await tx.vehicle_tire_positions.updateMany({
        where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
        data: { tire_id: data.newTireId },
      });

      // 6. Create service item
      const oldDestPrisma = data.oldDestination as TireOldDestination | undefined;
      await tx.tire_service_items.create({
        data: {
          service_order_id: data.serviceOrderId,
          position_number: data.positionNumber,
          vehicle_id: data.vehicleId,
          action: 'REPLACE',
          tire_id: data.tireId,
          new_tire_id: data.newTireId,
          old_tire_destination: oldDestPrisma ?? null,
          tread_depth: data.treadDepth != null ? String(data.treadDepth) : null,
          pressure_start: data.pressureStart != null ? String(data.pressureStart) : null,
          pressure_end: data.pressureEnd != null ? String(data.pressureEnd) : null,
          observations: data.observations ?? null,
          mount_movement_id: mount?.id ?? null,
          return_movement_id: returnMovementId,
        },
      });
    }, prisma, GOMERIA_TX_OPTIONS);

    return ok(null);
  } catch (error) {
    return toGomeriaActionError(error, logger, 'registrar el reemplazo');
  }
}

// ============================================================================
// MISSING REPORT (mark tire as missing, clear position)
// ============================================================================

/**
 * Reporte de extravío. La empresa sale de la orden (flujo del QR) y el vehículo y la
 * cubierta tienen que pertenecerle.
 */
export async function performMissingReport(data: {
  serviceOrderId: string;
  positionNumber: number;
  vehicleId: string;
  tireId: string;
  observations?: string;
}) {
  logger.debug('Performing missing report', {
    data: { serviceOrderId: data.serviceOrderId, positionNumber: data.positionNumber, tireId: data.tireId },
  });

  try {
    await prisma.$transaction(async (tx) => {
      const companyId = await getServiceOrderCompanyId(tx, data.serviceOrderId);
      await assertVehicleInCompany(tx, data.vehicleId, companyId);
      await assertTireInCompany(tx, data.tireId, companyId);

      // 1. Assert tire matches the position
      const position = await tx.vehicle_tire_positions.findFirst({
        where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
      });
      if (!position) {
        throw new Error(`Posición ${data.positionNumber} no encontrada`);
      }
      if (position.tire_id !== data.tireId) {
        throw new Error(`La cubierta en la posición ${data.positionNumber} no coincide con la cubierta esperada`);
      }

      // 2. Mark tire as MISSING
      await tx.tires.update({
        where: { id: data.tireId },
        data: { status: 'MISSING' },
      });

      // 3. Clear the position (tire_id = null)
      await tx.vehicle_tire_positions.updateMany({
        where: { vehicle_id: data.vehicleId, position_number: data.positionNumber },
        data: { tire_id: null },
      });

      // 4. Create service item record
      await tx.tire_service_items.create({
        data: {
          service_order_id: data.serviceOrderId,
          position_number: data.positionNumber,
          vehicle_id: data.vehicleId,
          action: 'MISSING_REPORT',
          tire_id: data.tireId,
          new_tire_id: null,
          observations: data.observations ?? null,
        },
      });
    });

    return { success: true };
  } catch (error) {
    logger.error('Error performing missing report', { data: { error } });
    throw error;
  }
}

// ============================================================================
// SEARCH VEHICLE BY DOMAIN
// ============================================================================

/**
 * Buscador de vehículos del asistente en modo dashboard (desde el QR el vehículo ya viene
 * fijado por la ruta y este paso no se muestra), así que la empresa sale de la sesión.
 */
export async function searchVehicleByDomain(domain: string) {
  logger.debug('Searching vehicle by domain', { data: { domain } });

  try {
    const companyId = await getActiveCompanyId();

    const vehicles = await prisma.vehicles.findMany({
      where: {
        company_id: companyId,
        is_active: true,
        domain: { contains: domain, mode: 'insensitive' },
      },
      select: {
        id: true,
        domain: true,
        intern_number: true,
        type: true,
        tire_template_id: true,
        sub_type: {
          select: {
            id: true,
            name: true,
            tire_template_id: true,
          },
        },
      },
      take: 10,
    });

    return vehicles.map((v) => {
      return {
        id: v.id,
        domain: v.domain,
        intern_number: v.intern_number,
        tire_template_id: resolveVehicleTireTemplateId(v),
        sub_type_id: v.sub_type?.id ?? null,
        sub_type_name: v.sub_type?.name ?? null,
        type_id: v.type ?? null,
      };
    });
  } catch (error) {
    logger.error('Error searching vehicle by domain', { data: { error, domain } });
    throw error;
  }
}

/**
 * Get vehicle type info (is_tractor_unit, has_hitch) for hitch UI visibility.
 *
 * Perímetro por recurso: sólo devuelve el tipo del propio vehículo de la ruta y también se
 * usa desde el QR, así que no hay empresa de sesión contra la cual validar.
 */
export async function getVehicleTypeInfo(vehicleId: string) {
  logger.debug('Getting vehicle type info', { data: { vehicleId } });

  try {
    const vehicle = await prisma.vehicles.findUnique({
      where: { id: vehicleId },
      select: {
        type_vehicles_typeTotype: {
          select: {
            id: true,
            name: true,
            is_tractor_unit: true,
            has_hitch: true,
          },
        },
      },
    });

    if (!vehicle?.type_vehicles_typeTotype) return null;

    const vType = vehicle.type_vehicles_typeTotype;
    return {
      id: vType.id,
      name: vType.name,
      is_tractor_unit: vType.is_tractor_unit ?? false,
      has_hitch: vType.has_hitch ?? false,
    };
  } catch (error) {
    logger.error('Error getting vehicle type info', { data: { error, vehicleId } });
    return null;
  }
}

/**
 * Search compatible hitch vehicles for a given tractor unit.
 * Uses type_hitch_types junction table to filter by compatible types.
 */
export async function searchCompatibleHitchVehicles(tractorId: string, domain: string) {
  logger.debug('Searching compatible hitch vehicles', { data: { tractorId, domain } });

  try {
    // 1. Get the tractor's type — la empresa sale del propio tractor, no del cliente:
    //    este buscador también corre desde el QR anónimo, sin empresa activa.
    const tractor = await prisma.vehicles.findUnique({
      where: { id: tractorId },
      select: {
        company_id: true,
        type_vehicles_typeTotype: {
          select: { id: true, is_tractor_unit: true, has_hitch: true },
        },
      },
    });

    if (!tractor?.company_id) return [];
    if (!tractor.type_vehicles_typeTotype?.is_tractor_unit || !tractor.type_vehicles_typeTotype.has_hitch) {
      return [];
    }

    const companyId = tractor.company_id;

    // 2. Get compatible type IDs from type_hitch_types
    const hitchTypes = await prisma.type_hitch_types.findMany({
      where: { type_id: tractor.type_vehicles_typeTotype.id },
      select: { compatible_type_id: true },
    });

    if (hitchTypes.length === 0) return [];

    const compatibleTypeIds = hitchTypes.map((ht) => ht.compatible_type_id);

    // 3. Search vehicles of compatible types, filtered by domain
    const vehicles = await prisma.vehicles.findMany({
      where: {
        company_id: companyId,
        is_active: true,
        type: { in: compatibleTypeIds },
        id: { not: tractorId },
        ...(domain.trim().length > 0 ? { domain: { contains: domain, mode: 'insensitive' as const } } : {}),
      },
      select: {
        id: true,
        domain: true,
        intern_number: true,
        type: true,
        tire_template_id: true,
        sub_type: {
          select: {
            id: true,
            name: true,
            tire_template_id: true,
          },
        },
      },
      take: 10,
      orderBy: { domain: 'asc' },
    });

    return vehicles.map((v) => {
      return {
        id: v.id,
        domain: v.domain,
        intern_number: v.intern_number,
        tire_template_id: resolveVehicleTireTemplateId(v),
        sub_type_id: v.sub_type?.id ?? null,
        sub_type_name: v.sub_type?.name ?? null,
        type_id: v.type ?? null,
      };
    });
  } catch (error) {
    logger.error('Error searching compatible hitch vehicles', { data: { error, tractorId, domain } });
    return [];
  }
}

// ============================================================================
// ENSURE VEHICLE TIRE POSITIONS (lazy generation)
// ============================================================================

/**
 * Ensures a vehicle has tire positions generated from its sub_type's template.
 * Idempotent: if positions already exist, returns them immediately.
 * If positions are missing, generates them from the sub_type's tire_template.
 *
 * Perímetro por recurso: opera sobre las posiciones del propio vehículo de la ruta y la
 * plantilla que ya tiene asignada, y corre también desde el QR, donde la sesión del
 * operario no sirve para validar la empresa.
 */
export async function ensureVehicleTirePositions(vehicleId: string) {
  logger.debug('Ensuring vehicle tire positions', { data: { vehicleId } });

  try {
    const readiness = await checkVehicleTireReadiness(vehicleId);
    if (!readiness.ready) {
      const vehicleData = await prisma.vehicles.findUnique({
        where: { id: vehicleId },
        select: { domain: true },
      });
      const domain = vehicleData?.domain ?? vehicleId;
      throw new Error(TIRE_READINESS_MESSAGES.no_template(domain));
    }

    // Load vehicle-level axle size overrides once for enrichment of returned positions.
    const sizeOverrides = await prisma.vehicle_axle_tire_sizes.findMany({
      where: { vehicle_id: vehicleId },
      select: { axle_number: true, tire_size: true },
    });
    const overrideMap = new Map(sizeOverrides.map((o) => [o.axle_number, o.tire_size]));

    function enrich<T extends { axle_number: number; template_axle: { tire_size: string | null } | null }>(
      positions: T[]
    ): Array<T & { effective_tire_size: string | null }> {
      return positions.map((pos) => ({
        ...pos,
        effective_tire_size:
          overrideMap.get(pos.axle_number) ?? pos.template_axle?.tire_size ?? null,
      }));
    }

    // 1. Check if vehicle already has positions
    const existingPositions = await prisma.vehicle_tire_positions.findMany({
      where: { vehicle_id: vehicleId },
      include: {
        tire: {
          select: {
            id: true,
            serial_number: true,
            is_new: true,
            retread_level: true,
            tread_depth: true,
            status: true,
            material_unit_id: true,
            brand: { select: { id: true, name: true } },
            tire_type: { select: { id: true, size: true, tread_type: true } },
          },
        },
        template_axle: {
          select: {
            id: true,
            axle_number: true,
            tires_per_side: true,
            tire_size: true,
            is_drive_axle: true,
            is_spare: true,
          },
        },
      },
      orderBy: { position_number: 'asc' },
    });

    if (existingPositions.length > 0) {
      return enrich(existingPositions);
    }

    // 2. No positions — need to generate from vehicle's effective template
    const vehicle = await prisma.vehicles.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        tire_template_id: true,
        sub_type: {
          select: {
            id: true,
            tire_template_id: true,
          },
        },
      },
    });

    const templateId = vehicle ? resolveVehicleTireTemplateId(vehicle) : null;
    if (!templateId) {
      throw new Error('Este equipo no tiene configuración de cubiertas asignada');
    }

    // 3. Load template axles
    const templateAxles = await prisma.tire_template_axles.findMany({
      where: { template_id: templateId },
      orderBy: { axle_number: 'asc' },
    });

    if (templateAxles.length === 0) {
      throw new Error('La plantilla del subtipo no tiene ejes configurados');
    }

    // 4. Calculate positions using TireDiagramRenderer logic
    const diagramAxles: DiagramAxle[] = templateAxles.map((axle) => ({
      id: axle.id,
      axle_number: axle.axle_number,
      tires_per_side: axle.tires_per_side,
      tire_size: axle.tire_size,
      is_drive_axle: axle.is_drive_axle,
      is_spare: axle.is_spare,
    }));

    const computedPositions = calculatePositions(diagramAxles);

    // 5. Create vehicle_tire_positions (all tire_id = null)
    if (computedPositions.length > 0) {
      const axleIdByNumber = new Map(templateAxles.map((a) => [a.axle_number, a.id]));

      await prisma.vehicle_tire_positions.createMany({
        data: computedPositions.map((pos) => ({
          vehicle_id: vehicleId,
          template_axle_id: axleIdByNumber.get(pos.axle_number)!,
          position_number: pos.position_number,
          axle_number: pos.axle_number,
          side: pos.side,
          tire_id: null,
        })),
      });
    }

    // 6. Re-fetch with full includes and return
    const newPositions = await prisma.vehicle_tire_positions.findMany({
      where: { vehicle_id: vehicleId },
      include: {
        tire: {
          select: {
            id: true,
            serial_number: true,
            is_new: true,
            retread_level: true,
            tread_depth: true,
            status: true,
            material_unit_id: true,
            brand: { select: { id: true, name: true } },
            tire_type: { select: { id: true, size: true, tread_type: true } },
          },
        },
        template_axle: {
          select: {
            id: true,
            axle_number: true,
            tires_per_side: true,
            tire_size: true,
            is_drive_axle: true,
            is_spare: true,
          },
        },
      },
      orderBy: { position_number: 'asc' },
    });

    logger.info('Generated tire positions for vehicle', {
      data: { vehicleId, count: newPositions.length, templateId },
    });

    return enrich(newPositions);
  } catch (error) {
    logger.error('Error ensuring vehicle tire positions', { data: { error, vehicleId } });
    throw error;
  }
}

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type ServiceOrderListItem = Awaited<ReturnType<typeof getServiceOrdersPaginated>>['data'][number];

export type ServiceOrderDetail = Awaited<ReturnType<typeof getServiceOrderById>>;

export type VehicleTirePosition = Awaited<ReturnType<typeof getVehicleTirePositions>>[number];

export type AvailableTire = Awaited<ReturnType<typeof getAvailableTiresForVehicle>>[number];

export type VehicleSearchResult = Awaited<ReturnType<typeof searchVehicleByDomain>>[number];

export type EnsuredTirePosition = Awaited<ReturnType<typeof ensureVehicleTirePositions>>[number];
