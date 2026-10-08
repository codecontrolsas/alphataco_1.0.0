'use server';

import moment from 'moment';
import { revalidatePath } from 'next/cache';
import { checkPermissionServer } from '@/features/Permissions';
import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { toActionError } from '../lib/action-errors';
import { formatMoney } from '../lib/format';
import { dateColumnToYmd } from '../lib/batch-expiry';
import { DESTINATION_SELECT, destinationLabel } from '../lib/labels';
import { registerStockMovement, reverseStockMovement } from '../lib/stock-engine';
import { StockError } from '../lib/stock-errors';
import { hasTireMaterials, linkTiresFromEntry } from '../lib/tire-stock';
import {
  isInboundLine,
  stockMovementSchema,
  toStockMovementInput,
  type StockMovementFormValues,
} from '../schemas/stock-movement';

const logger = new Logger('features/Warehouses/movements');

const WAREHOUSE_PATH = '/dashboard/warehouse';

/** Un id que no es uuid haria fallar la query de Prisma: se responde como "no existe". */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un movimiento con muchas lineas toma varios locks: mas margen que los 5 s por defecto. */
const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 };

export interface MovementResult {
  id: string;
  number: string;
  lineCount: number;
  /** `null` si el usuario no tiene `view_prices`. */
  totalCost: string | null;
}

const REQUEST_HINT = 'hacé un pedido de materiales.';

/**
 * Registra entrada, salida, transferencia o ajuste. Los ajustes piden `adjust`; el resto `create`.
 *
 * Una salida desde "Nuevo movimiento" es una SALIDA DIRECTA y cumple la regla triple (spec etapa 3
 * §3.4); si no, va por pedido de materiales: permiso `direct_exit`, ningun material con
 * `requires_approval`, y el total real del motor dentro del monto de la empresa. El monto se
 * controla despues de registrar, dentro de la transaccion: si se pasa, se lanza y se revierte
 * todo (el total sale del costo promedio que el motor leyo con lock, no de una estimacion).
 */
export async function registerStockMovementAction(values: StockMovementFormValues): Promise<ActionResult<MovementResult>> {
  const parsed = stockMovementSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');

  const action = parsed.data.type === 'ADJUSTMENT' ? 'adjust' : 'create';
  const isExit = parsed.data.type === 'EXIT';
  const [allowed, canViewPrices, canDirectExit] = await Promise.all([
    checkPermissionServer('almacenes', 'movimientos', action),
    checkPermissionServer('almacenes', 'movimientos', 'view_prices'),
    isExit ? checkPermissionServer('almacenes', 'movimientos', 'direct_exit') : Promise.resolve(true),
  ]);
  if (!allowed) {
    return fail(action === 'adjust' ? 'No tenés permiso para ajustar stock' : 'No tenés permiso para registrar movimientos');
  }
  if (!canDirectExit) return fail(`No tenés permiso de salida directa: ${REQUEST_HINT}`);

  const profile = await getServerAuthProfile();
  if (!profile) return fail('Tu sesión expiró. Volvé a ingresar.');
  const companyId = await getActiveCompanyId();

  try {
    const registered = await withActor(
      profile.credentialId,
      async (tx) => {
        if (isExit) {
          const needsApproval = await tx.materials.findFirst({
            where: { id: { in: parsed.data.lines.map((l) => l.materialId) }, company_id: companyId, requires_approval: true },
            select: { name: true },
            orderBy: { name: 'asc' },
          });
          if (needsApproval) {
            throw new StockError('DIRECT_EXIT_LIMIT', `${needsApproval.name} requiere aprobación: ${REQUEST_HINT}`);
          }
        }
        // Las cubiertas se montan y se dan de baja desde Gomeria (etapa 6): aca solo entran o se transfieren.
        const outboundMaterials = parsed.data.lines
          .filter((l) => parsed.data.type !== 'TRANSFER' && !isInboundLine(parsed.data.type, l.adjustmentDirection))
          .map((l) => l.materialId);
        if (await hasTireMaterials(tx, outboundMaterials)) {
          throw new StockError('MANAGED_ELSEWHERE', 'Las cubiertas se montan y se dan de baja desde Gomería');
        }
        const registered = await registerStockMovement(tx, companyId, profile.id, toStockMovementInput(parsed.data));
        // Cada unidad de cubierta que entra es una cubierta de Gomeria.
        if (parsed.data.type === 'ENTRY' || parsed.data.type === 'ADJUSTMENT') {
          await linkTiresFromEntry(tx, companyId, registered.id);
        }
        if (isExit) {
          const settings = await tx.warehouse_settings.findUnique({
            where: { company_id: companyId },
            select: { direct_exit_max_amount: true },
          });
          const limit = settings?.direct_exit_max_amount;
          if (limit && registered.totalCost.gt(limit)) {
            // Sin `view_prices` el mensaje no revela importes.
            throw new StockError(
              'DIRECT_EXIT_LIMIT',
              canViewPrices
                ? `La salida suma ${formatMoney(registered.totalCost.toFixed(2))} y el máximo de salida directa es ${formatMoney(limit.toFixed(2))}: ${REQUEST_HINT}`
                : `La salida supera el monto máximo de salida directa: ${REQUEST_HINT}`
            );
          }
        }
        return registered;
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    logger.info('Movimiento registrado', { data: { id: registered.id, number: registered.number } });
    revalidatePath(WAREHOUSE_PATH);
    return ok({
      id: registered.id,
      number: registered.number,
      lineCount: registered.lineCount,
      totalCost: canViewPrices ? registered.totalCost.toFixed(2) : null,
    });
  } catch (error) {
    return toActionError(error, logger, 'registrar el movimiento');
  }
}

/** Anula un movimiento con otro de efecto inverso. */
export async function reverseStockMovementAction(movementId: string, reason: string): Promise<ActionResult<MovementResult>> {
  const [allowed, canViewPrices] = await Promise.all([
    checkPermissionServer('almacenes', 'movimientos', 'reverse'),
    checkPermissionServer('almacenes', 'movimientos', 'view_prices'),
  ]);
  if (!allowed) return fail('No tenés permiso para anular movimientos');

  const profile = await getServerAuthProfile();
  if (!profile) return fail('Tu sesión expiró. Volvé a ingresar.');
  const companyId = await getActiveCompanyId();

  try {
    const reversal = await withActor(
      profile.credentialId,
      async (tx) => {
        const lines = await tx.stock_movement_lines.findMany({
          where: { movement_id: movementId, movement: { company_id: companyId } },
          select: { material_id: true },
        });
        if (await hasTireMaterials(tx, lines.map((l) => l.material_id))) {
          throw new StockError(
            'MANAGED_ELSEWHERE',
            'Los movimientos de cubiertas no se anulan desde Almacenes: se corrigen desde Gomería'
          );
        }
        return reverseStockMovement(tx, companyId, profile.id, movementId, reason);
      },
      prisma,
      TRANSACTION_OPTIONS
    );
    logger.info('Movimiento anulado', { data: { original: movementId, reversal: reversal.number } });
    revalidatePath(WAREHOUSE_PATH);
    return ok({
      id: reversal.id,
      number: reversal.number,
      lineCount: reversal.lineCount,
      totalCost: canViewPrices ? reversal.totalCost.toFixed(2) : null,
    });
  } catch (error) {
    return toActionError(error, logger, 'anular el movimiento');
  }
}

const TIRE_ITEM_SELECT = {
  position_number: true,
  vehicle: { select: { domain: true, intern_number: true } },
  service_order: { select: { service_date: true, status: true } },
} as const;

/** "Orden de gomería del 07/10/2026 · AB123CD, posición 3 (abierta)". */
function tireServiceItemInfo(
  item: {
    position_number: number;
    vehicle: { domain: string | null; intern_number: string | null };
    service_order: { service_date: Date; status: string };
  } | null
) {
  if (!item) return null;
  return {
    date: moment(item.service_order.service_date).format('DD/MM/YYYY'),
    vehicle: item.vehicle.domain || item.vehicle.intern_number || 'equipo',
    position: item.position_number,
    open: item.service_order.status === 'OPEN',
  };
}

/**
 * Detalle de un movimiento. Sin `view_prices` los costos NO salen del servidor (no alcanza con
 * ocultarlos en pantalla).
 */
export async function getStockMovementDetail(id: string) {
  const [canView, canViewPrices, canReverse] = await Promise.all([
    checkPermissionServer('almacenes', 'movimientos', 'view'),
    checkPermissionServer('almacenes', 'movimientos', 'view_prices'),
    checkPermissionServer('almacenes', 'movimientos', 'reverse'),
  ]);
  if (!canView || !UUID_RE.test(id)) return null;
  const companyId = await getActiveCompanyId();

  const movement = await prisma.stock_movements.findFirst({
    where: { id, company_id: companyId },
    select: {
      id: true,
      number: true,
      type: true,
      occurred_on: true,
      created_at: true,
      reference: true,
      notes: true,
      total_cost: true,
      warehouse: { select: { id: true, code: true, name: true } },
      target_warehouse: { select: { id: true, code: true, name: true } },
      creator: { select: { fullname: true, email: true } },
      reverses: { select: { id: true, number: true } },
      reversed_by: { select: { id: true, number: true } },
      returned_from: { select: { id: true, number: true } },
      material_request: { select: { id: true, number: true } },
      // Salida de una entrega de ropa (etapa 5).
      clothing_delivery: { select: { id: true, cancelled_at: true } },
      // Montaje o devolucion de una orden de gomeria (etapa 6).
      tire_item_mounts: { select: TIRE_ITEM_SELECT, take: 1 },
      tire_item_returns: { select: TIRE_ITEM_SELECT, take: 1 },
      ...DESTINATION_SELECT,
      lines: {
        select: {
          id: true,
          quantity: true,
          direction: true,
          unit_cost: true,
          total_cost: true,
          material: { select: { id: true, code: true, name: true, unit: { select: { abbreviation: true } } } },
          batch: { select: { batch_number: true, expires_at: true } },
          unit: { select: { serial_number: true } },
        },
        orderBy: [{ material: { name: 'asc' } }, { id: 'asc' }],
      },
    },
  });
  if (!movement) return null;

  return {
    id: movement.id,
    number: movement.number,
    type: movement.type,
    occurredOn: dateColumnToYmd(movement.occurred_on),
    createdAt: movement.created_at.toISOString(),
    reference: movement.reference,
    notes: movement.notes,
    warehouse: movement.warehouse,
    targetWarehouse: movement.target_warehouse,
    createdBy: movement.creator.fullname ?? movement.creator.email ?? 'Usuario',
    reverses: movement.reverses,
    reversedBy: movement.reversed_by,
    returnedFrom: movement.returned_from,
    materialRequest: movement.material_request,
    tireServiceItem: tireServiceItemInfo(movement.tire_item_mounts[0] ?? movement.tire_item_returns[0] ?? null),
    clothingDelivery: movement.clothing_delivery
      ? { id: movement.clothing_delivery.id, cancelled: movement.clothing_delivery.cancelled_at !== null }
      : null,
    destinationType: movement.destination_type,
    destination: destinationLabel(movement),
    totalCost: canViewPrices ? movement.total_cost.toFixed(2) : null,
    canReverse: canReverse && !movement.reverses && !movement.reversed_by,
    lines: movement.lines.map((l) => ({
      id: l.id,
      material: { id: l.material.id, code: l.material.code, name: l.material.name, unit: l.material.unit.abbreviation },
      quantity: l.quantity.toString(),
      direction: l.direction,
      batch: l.batch
        ? { number: l.batch.batch_number, expiresAt: l.batch.expires_at ? dateColumnToYmd(l.batch.expires_at) : null }
        : null,
      serialNumber: l.unit?.serial_number ?? null,
      unitCost: canViewPrices ? l.unit_cost.toFixed(4) : null,
      totalCost: canViewPrices ? l.total_cost.toFixed(2) : null,
    })),
  };
}

export type StockMovementDetail = NonNullable<Awaited<ReturnType<typeof getStockMovementDetail>>>;
