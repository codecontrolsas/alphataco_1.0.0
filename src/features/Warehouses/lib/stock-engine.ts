import 'server-only';

import moment from 'moment';
import { Prisma } from '@/generated/prisma/client';
import { argentinaDate } from '@/features/Jobs/lib/dates';
import { averageCostAfterEntry, averageCostAfterEntryReversal, lineTotal } from './average-cost';
import { classifyBatch, dateColumnToYmd } from './batch-expiry';
import { nextStockMovementNumber } from './movement-numbering';
import { canApplyRequestAction } from './request-state-machine';
import { deliveredByLine, lockRequest, recomputeRequestStatus } from './requests';
import { CLOSED_MAINTENANCE_ORDER_STATUSES } from './stock-engine-constants';
import { StockError } from './stock-errors';
import type {
  DestinationInput,
  MaterialTrackingTypeValue,
  StockMovementInput,
  StockMovementTypeValue,
} from '../schemas/stock-movement';
import type { RequestDeliveryInput } from '../schemas/requests';

/**
 * Motor de stock: el UNICO escritor de `stock_balances`, `material_units`, `material_batches`
 * (alta) y `materials.average_cost` (spec §3). Pantallas, y mas adelante Ropa, Cubiertas,
 * Mantenimiento y Compras, registran movimientos llamando a estas dos funciones con el `tx`
 * de su propia transaccion (`withActor`), asi su operacion y el movimiento se confirman o
 * fallan juntos. Una regla escrita en un solo lugar no puede divergir.
 *
 * ORDEN DE LOCKS, unico en todo el dominio (si dos caminos lo invierten, deadlock):
 *   1. el movimiento original (solo anulaciones)
 *   2. el pedido de materiales (entregas y anulaciones de entregas, etapa 3)
 *   3. `materials` (por id)
 *   4. `stock_balances` (por id)
 *   5. `material_units` (por id)
 *   6. advisory lock de numeracion (`nextStockMovementNumber`)
 * Lockear el material serializa todo lo que toca su stock, incluido el calculo del total de
 * la empresa para el costo promedio (que suma saldos de depositos que no se lockean uno a uno).
 *
 * Errores de negocio: `StockError` con el mensaje para el usuario. Las validaciones van ANTES
 * de escribir; los CHECK de la base son la red, no el mensaje.
 */

type Tx = Prisma.TransactionClient;
type Decimal = Prisma.Decimal;

const dec = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);

export interface RegisteredMovement {
  id: string;
  number: string;
  totalCost: Decimal;
  lineCount: number;
}

// ── Lecturas con lock ───────────────────────────────────────────────────────

interface MaterialRow {
  id: string;
  code: string;
  name: string;
  tracking_type: MaterialTrackingTypeValue;
  is_active: boolean;
  average_cost: Decimal;
  unit: string;
}

async function lockMaterials(tx: Tx, companyId: string, ids: string[]): Promise<Map<string, MaterialRow>> {
  const unique = [...new Set(ids)].sort();
  const rows = await tx.$queryRaw<MaterialRow[]>`
    SELECT m.id, m.code, m.name, m.tracking_type::text AS tracking_type, m.is_active, m.average_cost,
           u.abbreviation AS unit
    FROM materials m
    JOIN measurement_units u ON u.id = m.unit_id
    WHERE m.id = ANY(${unique}::uuid[]) AND m.company_id = ${companyId}::uuid
    ORDER BY m.id
    FOR UPDATE OF m
  `;
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (byId.size !== unique.length) throw new StockError('NOT_FOUND', 'Uno de los materiales no existe en la empresa');
  return byId;
}

interface BalanceRow {
  id: string;
  material_id: string;
  warehouse_id: string;
  batch_id: string | null;
  quantity: Decimal;
}

interface BalanceKey {
  materialId: string;
  warehouseId: string;
  batchId: string | null;
}

const balanceKey = (k: BalanceKey) => `${k.materialId}|${k.warehouseId}|${k.batchId ?? ''}`;

/**
 * Crea las filas de saldo que falten (en 0) y lockea todas las involucradas. Crear antes de
 * lockear evita la carrera "no existe → la creo yo" entre dos transacciones; el unico
 * NULLS NOT DISTINCT de la base hace que la segunda no duplique.
 */
async function lockBalances(tx: Tx, companyId: string, keys: BalanceKey[]): Promise<Map<string, BalanceRow>> {
  const materials = keys.map((k) => k.materialId);
  const warehouses = keys.map((k) => k.warehouseId);
  const batches = keys.map((k) => k.batchId);

  await tx.$executeRaw`
    INSERT INTO stock_balances (company_id, material_id, warehouse_id, batch_id)
    SELECT ${companyId}::uuid, k.material_id, k.warehouse_id, k.batch_id
    FROM unnest(${materials}::uuid[], ${warehouses}::uuid[], ${batches}::uuid[]) AS k(material_id, warehouse_id, batch_id)
    ON CONFLICT DO NOTHING
  `;

  const rows = await tx.$queryRaw<BalanceRow[]>`
    SELECT id, material_id, warehouse_id, batch_id, quantity
    FROM stock_balances
    WHERE company_id = ${companyId}::uuid
      AND material_id = ANY(${[...new Set(materials)]}::uuid[])
      AND warehouse_id = ANY(${[...new Set(warehouses)]}::uuid[])
    ORDER BY id
    FOR UPDATE
  `;

  return new Map(
    rows.map((r) => [balanceKey({ materialId: r.material_id, warehouseId: r.warehouse_id, batchId: r.batch_id }), r])
  );
}

/** Stock total de la empresa por material (todos los depositos y lotes). */
async function companyTotals(tx: Tx, companyId: string, materialIds: string[]): Promise<Map<string, Decimal>> {
  const rows = await tx.$queryRaw<{ material_id: string; total: Decimal }[]>`
    SELECT material_id, COALESCE(SUM(quantity), 0) AS total
    FROM stock_balances
    WHERE company_id = ${companyId}::uuid AND material_id = ANY(${[...new Set(materialIds)]}::uuid[])
    GROUP BY material_id
  `;
  return new Map(rows.map((r) => [r.material_id, dec(r.total)]));
}

interface UnitRow {
  id: string;
  material_id: string;
  serial_number: string;
  status: 'IN_STOCK' | 'OUT' | 'DISCARDED';
  warehouse_id: string | null;
  last_movement_id: string | null;
}

async function lockUnits(tx: Tx, companyId: string, ids: string[]): Promise<Map<string, UnitRow>> {
  if (ids.length === 0) return new Map();
  const unique = [...new Set(ids)].sort();
  const rows = await tx.$queryRaw<UnitRow[]>`
    SELECT id, material_id, serial_number, status::text AS status, warehouse_id, last_movement_id
    FROM material_units
    WHERE id = ANY(${unique}::uuid[]) AND company_id = ${companyId}::uuid
    ORDER BY id
    FOR UPDATE
  `;
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (byId.size !== unique.length) throw new StockError('NOT_FOUND', 'Una de las unidades no existe en la empresa');
  return byId;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Cantidad legible para mensajes: sin ceros de mas y con coma decimal. */
export function formatQuantity(value: Decimal): string {
  return value.toDecimalPlaces(4).toString().replace('.', ',');
}

/** Fecha sin hora → `Date` a medianoche UTC, que es como Prisma escribe una columna `@db.Date`. */
function toDateColumn(value: Date): Date {
  return new Date(`${moment(value).format('YYYY-MM-DD')}T00:00:00.000Z`);
}

function sameDate(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return a === b;
  return moment.utc(a).format('YYYY-MM-DD') === moment.utc(b).format('YYYY-MM-DD');
}

function directionFor(type: StockMovementTypeValue, adjustmentDirection: 'IN' | 'OUT' | null): 1 | -1 {
  if (type === 'ENTRY') return 1;
  if (type === 'ADJUSTMENT') return adjustmentDirection === 'IN' ? 1 : -1;
  return -1; // EXIT y TRANSFER restan del deposito origen
}

async function loadWarehouses(tx: Tx, companyId: string, input: StockMovementInput) {
  const ids = [input.warehouseId, ...(input.targetWarehouseId ? [input.targetWarehouseId] : [])];
  const rows = await tx.warehouses.findMany({
    where: { id: { in: ids }, company_id: companyId },
    select: { id: true, name: true, is_active: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const origin = byId.get(input.warehouseId);
  if (!origin) throw new StockError('NOT_FOUND', 'El depósito no existe en la empresa');
  if (!origin.is_active) throw new StockError('INACTIVE_WAREHOUSE', `El depósito ${origin.name} está inactivo`);

  if (input.type !== 'TRANSFER') return { origin, target: null };

  if (!input.targetWarehouseId) throw new StockError('NOT_FOUND', 'Falta el depósito destino');
  const target = byId.get(input.targetWarehouseId);
  if (!target) throw new StockError('NOT_FOUND', 'El depósito destino no existe en la empresa');
  if (target.id === origin.id) throw new StockError('INVALID_INPUT', 'El destino tiene que ser otro depósito');
  if (!target.is_active) throw new StockError('INACTIVE_WAREHOUSE', `El depósito ${target.name} está inactivo`);
  return { origin, target };
}

/**
 * El destino de una salida (o de un pedido) tiene que ser de la empresa y estar vigente:
 * empleados, equipos y clientes activos; ordenes de mantenimiento abiertas (no completadas ni
 * rechazadas). La usan el motor y el alta de pedidos.
 */
export async function validateExitDestination(tx: Tx, companyId: string, input: DestinationInput): Promise<void> {
  const invalid = (message: string) => new StockError('INVALID_DESTINATION', message);

  switch (input.destinationType) {
    case 'EMPLOYEE': {
      const found = input.employeeId
        ? await tx.employees.findFirst({
            where: { id: input.employeeId, company_id: companyId, is_active: true },
            select: { id: true },
          })
        : null;
      if (!found) throw invalid('El empleado no existe o está dado de baja');
      return;
    }
    case 'VEHICLE': {
      const found = input.vehicleId
        ? await tx.vehicles.findFirst({
            where: { id: input.vehicleId, company_id: companyId, is_active: true },
            select: { id: true },
          })
        : null;
      if (!found) throw invalid('El vehículo no existe o está dado de baja');
      return;
    }
    case 'OTHER_EQUIPMENT': {
      const found = input.otherEquipmentId
        ? await tx.other_equipment.findFirst({
            where: { id: input.otherEquipmentId, company_id: companyId, is_active: true },
            select: { id: true },
          })
        : null;
      if (!found) throw invalid('El equipo no existe o está dado de baja');
      return;
    }
    case 'MAINTENANCE_ORDER': {
      const found = input.maintenanceOrderId
        ? await tx.maintenance_orders.findFirst({
            where: {
              id: input.maintenanceOrderId,
              company_id: companyId,
              status: { notIn: [...CLOSED_MAINTENANCE_ORDER_STATUSES] },
            },
            select: { id: true },
          })
        : null;
      if (!found) throw invalid('La orden de mantenimiento no existe o ya está cerrada');
      return;
    }
    case 'CUSTOMER': {
      const found = input.customerId
        ? await tx.customers.findFirst({
            where: { id: input.customerId, company_id: companyId, is_active: true },
            select: { id: true },
          })
        : null;
      if (!found) throw invalid('El cliente no existe o está inactivo');
      if (input.customerServiceId) {
        const contract = await tx.customer_services.findFirst({
          where: { id: input.customerServiceId, customer_id: input.customerId },
          select: { id: true },
        });
        if (!contract) throw invalid('El contrato no pertenece al cliente');
      }
      return;
    }
    default:
      throw invalid('Elegí a quién se imputa la salida');
  }
}

// ── Registro ────────────────────────────────────────────────────────────────

interface PlannedLine {
  material: MaterialRow;
  quantity: Decimal;
  direction: 1 | -1;
  batchId: string | null;
  batchLabel: string | null;
  /** Series que entran (se crean). */
  serialNumbers: string[];
  /** Unidades que salen, se transfieren o se descartan. */
  unitIds: string[];
  inputUnitCost: Decimal | null;
}

/**
 * Registra un movimiento (entrada, salida, transferencia o ajuste) y actualiza saldos, lotes,
 * unidades serializadas y costo promedio. `createdBy` es el `profile.id` del usuario.
 */
export function registerStockMovement(
  tx: Tx,
  companyId: string,
  createdBy: string,
  input: StockMovementInput
): Promise<RegisteredMovement> {
  return registerMovement(tx, companyId, createdBy, input, null);
}

/** Vinculo de una salida con el pedido que entrega: el pedido y la linea de cada linea de entrada. */
interface RequestLink {
  requestId: string;
  requestLineIds: string[];
}

async function registerMovement(
  tx: Tx,
  companyId: string,
  createdBy: string,
  input: StockMovementInput,
  requestLink: RequestLink | null
): Promise<RegisteredMovement> {
  if (input.lines.length === 0) throw new StockError('INVALID_INPUT', 'El movimiento no tiene líneas');
  if (input.type === 'ADJUSTMENT' && !input.notes?.trim()) {
    throw new StockError('INVALID_INPUT', 'El motivo del ajuste es obligatorio');
  }

  const { origin, target } = await loadWarehouses(tx, companyId, input);
  if (input.type === 'EXIT') await validateExitDestination(tx, companyId, input);

  // 2. Materiales (lock) y validacion por tipo de control, con el tracking de la BASE.
  const materials = await lockMaterials(
    tx,
    companyId,
    input.lines.map((l) => l.materialId)
  );

  const planned: PlannedLine[] = input.lines.map((line) => {
    const material = materials.get(line.materialId)!;
    const direction = directionFor(input.type, line.adjustmentDirection);
    const inbound = direction === 1 && input.type !== 'TRANSFER';
    const quantity = dec(line.quantity);
    const label = `${material.name} (${material.code})`;

    if (!quantity.isFinite() || quantity.lte(0)) {
      throw new StockError('INVALID_INPUT', `La cantidad de ${label} tiene que ser mayor a 0`);
    }
    if (inbound && !material.is_active) {
      throw new StockError('INACTIVE_MATERIAL', `${label} está inactivo: no admite ingresos`);
    }

    let inputUnitCost: Decimal | null = null;
    if (input.type === 'ENTRY') {
      if (line.unitCost === null || dec(line.unitCost).isNegative()) {
        throw new StockError('INVALID_INPUT', `Falta el costo unitario de ${label}`);
      }
      inputUnitCost = dec(line.unitCost);
    }

    const tracking = material.tracking_type;
    if (tracking === 'QUANTITY' && (line.batchId || line.batchNumber || line.serialNumbers.length || line.unitIds.length)) {
      throw new StockError('INVALID_TRACKING', `${label} se controla por cantidad: no lleva lote ni números de serie`);
    }
    if (tracking === 'BATCH') {
      if (inbound && !line.batchNumber) throw new StockError('INVALID_TRACKING', `Indicá el lote de ${label}`);
      if (!inbound && !line.batchId) throw new StockError('INVALID_TRACKING', `Elegí el lote de ${label}`);
    }
    if (tracking === 'SERIAL') {
      const count = inbound ? line.serialNumbers.length : line.unitIds.length;
      if (count === 0) {
        throw new StockError(
          'INVALID_TRACKING',
          inbound ? `Cargá los números de serie de ${label}` : `Elegí las unidades de ${label}`
        );
      }
      if (!quantity.equals(count)) {
        throw new StockError('INVALID_TRACKING', `La cantidad de ${label} tiene que coincidir con las unidades indicadas`);
      }
    }

    return {
      material,
      quantity,
      direction,
      batchId: tracking === 'BATCH' && !inbound ? line.batchId : null,
      batchLabel: null,
      serialNumbers: tracking === 'SERIAL' && inbound ? line.serialNumbers : [],
      unitIds: tracking === 'SERIAL' && !inbound ? line.unitIds : [],
      inputUnitCost,
    };
  });

  // Lotes: los que salen tienen que ser del material; los que entran se reutilizan o se crean.
  const outboundBatchIds = planned.filter((p) => p.batchId).map((p) => p.batchId!);
  if (outboundBatchIds.length > 0) {
    const batches = await tx.material_batches.findMany({
      where: { id: { in: outboundBatchIds }, company_id: companyId },
      select: { id: true, material_id: true, batch_number: true, expires_at: true },
    });
    const byId = new Map(batches.map((b) => [b.id, b]));
    // Un lote vencido no se despacha (spec etapa 2 §3.3). El ajuste negativo si lo admite: es
    // la forma de darlo de baja. "Hoy" es el de Argentina, el mismo que usan el aviso y el mail.
    const today = argentinaDate();
    const blocksExpired = input.type === 'EXIT' || input.type === 'TRANSFER';
    for (const p of planned) {
      if (!p.batchId) continue;
      const batch = byId.get(p.batchId);
      if (!batch || batch.material_id !== p.material.id) {
        throw new StockError('INVALID_TRACKING', `El lote elegido no corresponde a ${p.material.name}`);
      }
      p.batchLabel = batch.batch_number;
      if (blocksExpired && batch.expires_at && classifyBatch(dateColumnToYmd(batch.expires_at), today) === 'EXPIRED') {
        throw new StockError(
          'EXPIRED_BATCH',
          `El lote ${batch.batch_number} de ${p.material.name} venció el ${moment.utc(batch.expires_at).format('DD/MM/YYYY')}: no puede salir ni transferirse. Para darlo de baja usá un ajuste.`
        );
      }
    }
  }

  for (const [i, line] of input.lines.entries()) {
    const p = planned[i]!;
    if (p.material.tracking_type !== 'BATCH' || p.batchId || !line.batchNumber) continue;
    const expiresOn = line.batchExpiresOn ? toDateColumn(line.batchExpiresOn) : null;
    const existing = await tx.material_batches.findUnique({
      where: { material_id_batch_number: { material_id: p.material.id, batch_number: line.batchNumber } },
      select: { id: true, expires_at: true },
    });
    if (existing) {
      if (!sameDate(existing.expires_at, expiresOn)) {
        const current = existing.expires_at ? moment.utc(existing.expires_at).format('DD/MM/YYYY') : 'sin vencimiento';
        throw new StockError(
          'BATCH_EXPIRY_MISMATCH',
          `El lote ${line.batchNumber} de ${p.material.name} ya existe con vencimiento ${current}`
        );
      }
      p.batchId = existing.id;
    } else {
      const created = await tx.material_batches.create({
        data: { company_id: companyId, material_id: p.material.id, batch_number: line.batchNumber, expires_at: expiresOn },
        select: { id: true },
      });
      p.batchId = created.id;
    }
    p.batchLabel = line.batchNumber;
  }

  // Series que entran: no pueden repetirse ni existir en uso. Una serie DESCARTADA (por un ajuste
  // o por anular la entrada que la creo) se reutiliza: la fila de la unidad no se puede borrar
  // porque el historial la referencia, y sin esto "anular y volver a cargar bien" no tendria
  // salida para un serializado.
  const inboundSerials = planned.flatMap((p) => p.serialNumbers.map((s) => ({ materialId: p.material.id, serial: s })));
  const reusedUnitIds = new Map<string, string>();
  if (inboundSerials.length > 0) {
    const seen = new Set<string>();
    for (const s of inboundSerials) {
      const key = `${s.materialId}|${s.serial}`;
      if (seen.has(key)) throw new StockError('DUPLICATE_SERIAL', `El número de serie ${s.serial} está repetido`);
      seen.add(key);
    }
    const existing = await tx.material_units.findMany({
      where: { OR: inboundSerials.map((s) => ({ material_id: s.materialId, serial_number: s.serial })) },
      select: { id: true, material_id: true, serial_number: true, status: true },
    });
    const inUse = existing.filter((u) => u.status !== 'DISCARDED');
    if (inUse.length > 0) {
      throw new StockError(
        'DUPLICATE_SERIAL',
        `Ya existen los números de serie: ${inUse.map((u) => u.serial_number).join(', ')}`
      );
    }
    for (const u of existing) reusedUnitIds.set(`${u.material_id}|${u.serial_number}`, u.id);
  }

  // 3. Saldos (lock).
  const keys: BalanceKey[] = planned.flatMap((p) => [
    { materialId: p.material.id, warehouseId: origin.id, batchId: p.batchId },
    ...(target ? [{ materialId: p.material.id, warehouseId: target.id, batchId: p.batchId }] : []),
  ]);
  const balances = await lockBalances(tx, companyId, keys);
  const totals = await companyTotals(tx, companyId, [...materials.keys()]);

  // 4. Unidades que salen y descartadas que vuelven a entrar (lock, todas juntas y en orden).
  const units = await lockUnits(tx, companyId, [...planned.flatMap((p) => p.unitIds), ...reusedUnitIds.values()]);
  for (const unitId of reusedUnitIds.values()) {
    const unit = units.get(unitId)!;
    // Releida con lock: otra transaccion pudo reingresarla entre la consulta y el lock.
    if (unit.status !== 'DISCARDED') {
      throw new StockError('DUPLICATE_SERIAL', `Ya existe el número de serie ${unit.serial_number}`);
    }
  }
  const usedUnits = new Set<string>();
  for (const p of planned) {
    for (const unitId of p.unitIds) {
      const unit = units.get(unitId)!;
      if (usedUnits.has(unitId)) throw new StockError('UNIT_NOT_AVAILABLE', `La unidad ${unit.serial_number} está repetida`);
      usedUnits.add(unitId);
      if (unit.material_id !== p.material.id) {
        throw new StockError('UNIT_NOT_AVAILABLE', `La unidad ${unit.serial_number} no es de ${p.material.name}`);
      }
      if (unit.status !== 'IN_STOCK' || unit.warehouse_id !== origin.id) {
        throw new StockError('UNIT_NOT_AVAILABLE', `La unidad ${unit.serial_number} no está disponible en ${origin.name}`);
      }
    }
  }

  // Aplicacion en memoria, linea por linea: saldos, total de la empresa y promedio.
  const quantities = new Map([...balances].map(([k, b]) => [k, dec(b.quantity)]));
  const averages = new Map([...materials].map(([id, m]) => [id, dec(m.average_cost)]));
  const changedAverages = new Set<string>();
  const lineCosts: Decimal[] = [];

  for (const p of planned) {
    const originKey = balanceKey({ materialId: p.material.id, warehouseId: origin.id, batchId: p.batchId });
    const available = quantities.get(originKey) ?? dec(0);
    const total = totals.get(p.material.id) ?? dec(0);
    const average = averages.get(p.material.id)!;

    if (p.direction === -1 && available.lt(p.quantity)) {
      const batch = p.batchLabel ? ` (lote ${p.batchLabel})` : '';
      throw new StockError(
        'INSUFFICIENT_STOCK',
        `Stock insuficiente de ${p.material.name}${batch} en ${origin.name}: hay ${formatQuantity(available)} ${p.material.unit}, se pidieron ${formatQuantity(p.quantity)} ${p.material.unit}`
      );
    }

    const unitCost = p.inputUnitCost ?? average;
    lineCosts.push(unitCost);

    if (input.type === 'ENTRY') {
      averages.set(p.material.id, averageCostAfterEntry(total, average, p.quantity, unitCost));
      changedAverages.add(p.material.id);
    }

    quantities.set(originKey, available.plus(p.quantity.times(p.direction)));
    if (target) {
      const targetKey = balanceKey({ materialId: p.material.id, warehouseId: target.id, batchId: p.batchId });
      quantities.set(targetKey, (quantities.get(targetKey) ?? dec(0)).plus(p.quantity));
    } else {
      totals.set(p.material.id, total.plus(p.quantity.times(p.direction)));
    }
  }

  const totalCost = planned.reduce((acc, p, i) => acc.plus(lineTotal(p.quantity, lineCosts[i]!)), dec(0));

  // 5. Numeracion (ultimo lock) y escritura.
  const number = await nextStockMovementNumber(tx, companyId);
  const movement = await tx.stock_movements.create({
    data: {
      company_id: companyId,
      number,
      type: input.type,
      warehouse_id: origin.id,
      target_warehouse_id: target?.id ?? null,
      occurred_on: toDateColumn(input.occurredOn),
      reference: input.reference,
      notes: input.notes,
      destination_type: input.type === 'EXIT' ? input.destinationType : null,
      employee_id: input.type === 'EXIT' ? input.employeeId : null,
      vehicle_id: input.type === 'EXIT' ? input.vehicleId : null,
      other_equipment_id: input.type === 'EXIT' ? input.otherEquipmentId : null,
      maintenance_order_id: input.type === 'EXIT' ? input.maintenanceOrderId : null,
      customer_id: input.type === 'EXIT' ? input.customerId : null,
      customer_service_id: input.type === 'EXIT' ? input.customerServiceId : null,
      material_request_id: requestLink?.requestId ?? null,
      total_cost: totalCost,
      created_by: createdBy,
    },
    select: { id: true, number: true },
  });

  const newSerials = inboundSerials.filter((s) => !reusedUnitIds.has(`${s.materialId}|${s.serial}`));
  const createdUnits = newSerials.length
    ? await tx.material_units.createManyAndReturn({
        data: newSerials.map((s) => ({
          company_id: companyId,
          material_id: s.materialId,
          serial_number: s.serial,
          status: 'IN_STOCK' as const,
          warehouse_id: origin.id,
          last_movement_id: movement.id,
        })),
        select: { id: true, material_id: true, serial_number: true },
      })
    : [];
  if (reusedUnitIds.size > 0) {
    await tx.material_units.updateMany({
      where: { id: { in: [...reusedUnitIds.values()] } },
      data: { status: 'IN_STOCK', warehouse_id: origin.id, last_movement_id: movement.id },
    });
  }
  const createdUnitId = new Map([
    ...reusedUnitIds,
    ...createdUnits.map((u): [string, string] => [`${u.material_id}|${u.serial_number}`, u.id]),
  ]);

  const lineRows = planned.flatMap((p, i): Prisma.stock_movement_linesCreateManyInput[] => {
    const unitCost = lineCosts[i]!;
    const base = {
      movement_id: movement.id,
      material_id: p.material.id,
      direction: p.direction,
      unit_cost: unitCost,
      batch_id: p.batchId,
      request_line_id: requestLink?.requestLineIds[i] ?? null,
    };
    if (p.material.tracking_type === 'SERIAL') {
      const unitIds = p.unitIds.length ? p.unitIds : p.serialNumbers.map((s) => createdUnitId.get(`${p.material.id}|${s}`)!);
      return unitIds.map((unitId) => ({ ...base, quantity: dec(1), total_cost: lineTotal(1, unitCost), unit_id: unitId }));
    }
    return [{ ...base, quantity: p.quantity, total_cost: lineTotal(p.quantity, unitCost), unit_id: null }];
  });
  await tx.stock_movement_lines.createMany({ data: lineRows });

  await writeBalances(tx, balances, quantities);

  // Unidades que dejaron el deposito origen.
  const movedUnitIds = planned.flatMap((p) => p.unitIds);
  if (movedUnitIds.length > 0) {
    const data =
      input.type === 'TRANSFER'
        ? { warehouse_id: target!.id, last_movement_id: movement.id }
        : input.type === 'EXIT'
          ? { status: 'OUT' as const, warehouse_id: null, last_movement_id: movement.id }
          : { status: 'DISCARDED' as const, warehouse_id: null, last_movement_id: movement.id };
    await tx.material_units.updateMany({ where: { id: { in: movedUnitIds } }, data });
  }

  await writeAverages(tx, averages, changedAverages);

  return { id: movement.id, number: movement.number, totalCost, lineCount: lineRows.length };
}

async function writeBalances(tx: Tx, balances: Map<string, BalanceRow>, quantities: Map<string, Decimal>) {
  for (const [key, row] of balances) {
    const next = quantities.get(key)!;
    if (next.equals(row.quantity)) continue;
    await tx.stock_balances.update({ where: { id: row.id }, data: { quantity: next } });
  }
}

async function writeAverages(tx: Tx, averages: Map<string, Decimal>, changed: Set<string>) {
  for (const materialId of changed) {
    await tx.materials.update({ where: { id: materialId }, data: { average_cost: averages.get(materialId)! } });
  }
}

// ── Anulacion ───────────────────────────────────────────────────────────────

/**
 * Anula un movimiento con otro de efecto inverso, al costo original de cada linea (spec §3.5).
 * Conserva tipo, depositos y destino del original: la anulacion de una salida a un empleado
 * compensa lo imputado a ese empleado.
 */
export async function reverseStockMovement(
  tx: Tx,
  companyId: string,
  createdBy: string,
  movementId: string,
  reason: string
): Promise<RegisteredMovement> {
  const motive = reason.trim();
  if (!motive) throw new StockError('INVALID_INPUT', 'El motivo de la anulación es obligatorio');

  // 1. El original, lockeado: dos anulaciones simultaneas del mismo movimiento se ordenan.
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM stock_movements
    WHERE id = ${movementId}::uuid AND company_id = ${companyId}::uuid
    FOR UPDATE
  `;
  if (locked.length === 0) throw new StockError('NOT_FOUND', 'El movimiento no existe');

  const original = await tx.stock_movements.findUniqueOrThrow({
    where: { id: movementId },
    include: {
      lines: { include: { batch: { select: { batch_number: true } } } },
      warehouse: { select: { id: true, name: true } },
      target_warehouse: { select: { id: true, name: true } },
      reversed_by: { select: { number: true } },
    },
  });
  if (original.reverses_movement_id) {
    throw new StockError('CANNOT_REVERSE_REVERSAL', 'Una anulación no se puede anular');
  }
  if (original.reversed_by) {
    throw new StockError('ALREADY_REVERSED', `${original.number} ya fue anulado por ${original.reversed_by.number}`);
  }

  const origin = original.warehouse;
  const target = original.target_warehouse;

  // Entrega de un pedido: el pedido se lockea despues del original y antes de los materiales.
  const request = original.material_request_id ? await lockRequest(tx, companyId, original.material_request_id) : null;

  // Locks de stock en el orden del dominio.
  const materials = await lockMaterials(
    tx,
    companyId,
    original.lines.map((l) => l.material_id)
  );
  const keys: BalanceKey[] = original.lines.flatMap((l) => [
    { materialId: l.material_id, warehouseId: origin.id, batchId: l.batch_id },
    ...(target ? [{ materialId: l.material_id, warehouseId: target.id, batchId: l.batch_id }] : []),
  ]);
  const balances = await lockBalances(tx, companyId, keys);
  const totals = await companyTotals(tx, companyId, [...materials.keys()]);
  const units = await lockUnits(
    tx,
    companyId,
    original.lines.flatMap((l) => (l.unit_id ? [l.unit_id] : []))
  );

  // Ultimo movimiento de cada unidad: una salida sigue anulable si la unidad esta afuera por ESE
  // prestamo, aunque en el medio se haya devuelto y anulado la devolucion (cubiertas, etapa 6).
  const lastMovementIds = [...new Set([...units.values()].map((u) => u.last_movement_id).filter((id): id is string => !!id))];
  const lastMovements = new Map(
    (
      await tx.stock_movements.findMany({
        where: { id: { in: lastMovementIds } },
        select: { id: true, type: true, reverses_movement_id: true, returned_from_movement_id: true },
      })
    ).map((m) => [m.id, m])
  );

  const quantities = new Map([...balances].map(([k, b]) => [k, dec(b.quantity)]));
  const averages = new Map([...materials].map(([id, m]) => [id, dec(m.average_cost)]));
  const changedAverages = new Set<string>();

  const insufficient = (materialName: string, warehouseName: string, available: Decimal, needed: Decimal, unit: string) =>
    new StockError(
      'INSUFFICIENT_STOCK',
      `No se puede anular ${original.number}: de ${materialName} en ${warehouseName} hay ${formatQuantity(available)} ${unit} y la anulación necesita ${formatQuantity(needed)} ${unit}`
    );

  for (const line of original.lines) {
    const material = materials.get(line.material_id)!;
    const reverseDirection = line.direction === 1 ? -1 : 1;
    const quantity = dec(line.quantity);
    const originKey = balanceKey({ materialId: line.material_id, warehouseId: origin.id, batchId: line.batch_id });
    const available = quantities.get(originKey) ?? dec(0);
    const total = totals.get(line.material_id) ?? dec(0);
    const average = averages.get(line.material_id)!;

    if (reverseDirection === -1 && available.lt(quantity)) {
      throw insufficient(material.name, origin.name, available, quantity, material.unit);
    }

    // Solo entradas, devoluciones y salidas mueven el promedio; transferencias y ajustes se
    // valuaron a el. Anular una devolucion es, para el promedio, anular una entrada.
    if (original.type === 'ENTRY' || original.type === 'RETURN') {
      averages.set(line.material_id, averageCostAfterEntryReversal(total, average, quantity, line.unit_cost));
      changedAverages.add(line.material_id);
    } else if (original.type === 'EXIT') {
      averages.set(line.material_id, averageCostAfterEntry(total, average, quantity, line.unit_cost));
      changedAverages.add(line.material_id);
    }

    quantities.set(originKey, available.plus(quantity.times(reverseDirection)));
    if (target) {
      const targetKey = balanceKey({ materialId: line.material_id, warehouseId: target.id, batchId: line.batch_id });
      const atTarget = quantities.get(targetKey) ?? dec(0);
      if (atTarget.lt(quantity)) throw insufficient(material.name, target.name, atTarget, quantity, material.unit);
      quantities.set(targetKey, atTarget.minus(quantity));
    } else {
      totals.set(line.material_id, total.plus(quantity.times(reverseDirection)));
    }

    // Unidades serializadas: tienen que seguir donde el original las dejo.
    if (line.unit_id) {
      const unit = units.get(line.unit_id)!;
      const moved = new StockError(
        'UNIT_NOT_AVAILABLE',
        `No se puede anular ${original.number}: la unidad ${unit.serial_number} se movió después`
      );
      if (original.type === 'TRANSFER') {
        if (unit.status !== 'IN_STOCK' || unit.warehouse_id !== target?.id) throw moved;
      } else if (line.direction === 1) {
        if (unit.status !== 'IN_STOCK' || unit.warehouse_id !== origin.id) throw moved;
      } else if (original.type === 'EXIT') {
        const last = unit.last_movement_id ? lastMovements.get(unit.last_movement_id) : undefined;
        if (!last || loanExitOf(last) !== original.id) throw moved;
        if (unit.status !== 'OUT') {
          // Prestada y dada de baja: la baja cierra el prestamo y no se anula (spec etapa 2 §3.4).
          throw new StockError(
            'UNIT_NOT_AVAILABLE',
            `No se puede anular ${original.number}: la unidad ${unit.serial_number} fue dada de baja`
          );
        }
      } else if (unit.last_movement_id !== original.id) {
        throw moved;
      }
    }
  }

  const number = await nextStockMovementNumber(tx, companyId);
  const reversal = await tx.stock_movements.create({
    data: {
      company_id: companyId,
      number,
      type: original.type,
      warehouse_id: original.warehouse_id,
      target_warehouse_id: original.target_warehouse_id,
      occurred_on: toDateColumn(new Date()),
      reference: original.reference,
      notes: motive,
      destination_type: original.destination_type,
      employee_id: original.employee_id,
      vehicle_id: original.vehicle_id,
      other_equipment_id: original.other_equipment_id,
      maintenance_order_id: original.maintenance_order_id,
      customer_id: original.customer_id,
      customer_service_id: original.customer_service_id,
      reverses_movement_id: original.id,
      // La anulacion de una devolucion tambien es RETURN: apunta a la misma salida.
      returned_from_movement_id: original.returned_from_movement_id,
      material_request_id: original.material_request_id,
      total_cost: original.total_cost,
      created_by: createdBy,
    },
    select: { id: true, number: true },
  });

  await tx.stock_movement_lines.createMany({
    data: original.lines.map((l) => ({
      movement_id: reversal.id,
      material_id: l.material_id,
      quantity: l.quantity,
      direction: l.direction === 1 ? -1 : 1,
      unit_cost: l.unit_cost,
      total_cost: l.total_cost,
      batch_id: l.batch_id,
      unit_id: l.unit_id,
      request_line_id: l.request_line_id,
    })),
  });

  await writeBalances(tx, balances, quantities);

  const unitLines = original.lines.filter((l) => l.unit_id);
  for (const line of unitLines) {
    const data =
      original.type === 'TRANSFER'
        ? { warehouse_id: origin.id, last_movement_id: reversal.id }
        : original.type === 'RETURN'
          ? // Anular una devolucion reabre el prestamo: la unidad vuelve a estar en poder del tenedor.
            { status: 'OUT' as const, warehouse_id: null, last_movement_id: reversal.id }
          : line.direction === 1
            ? { status: 'DISCARDED' as const, warehouse_id: null, last_movement_id: reversal.id }
            : { status: 'IN_STOCK' as const, warehouse_id: origin.id, last_movement_id: reversal.id };
    await tx.material_units.update({ where: { id: line.unit_id! }, data });
  }

  await writeAverages(tx, averages, changedAverages);

  // Lo entregado vuelve a estar pendiente; un pedido cerrado sigue cerrado (spec etapa 3 §3.1).
  if (request) await recomputeRequestStatus(tx, request);

  return { id: reversal.id, number: reversal.number, totalCost: dec(original.total_cost), lineCount: original.lines.length };
}

// ── Prestamos de serializados (etapa 2) ─────────────────────────────────────

export interface ReturnInput {
  /** La salida cuyo prestamo se cierra. */
  exitMovementId: string;
  unitIds: string[];
  /** Deposito al que vuelven (puede ser otro que el de la salida). */
  warehouseId: string;
  occurredOn: Date;
  notes: string | null;
}

/**
 * Salida a la que pertenece el prestamo abierto de una unidad: su ultimo movimiento, o — si
 * el ultimo es la anulacion de una devolucion — la salida a la que apunta esa devolucion.
 */
export function loanExitOf(lastMovement: {
  id: string;
  type: string;
  reverses_movement_id: string | null;
  returned_from_movement_id: string | null;
}): string | null {
  if (lastMovement.type === 'EXIT' && !lastMovement.reverses_movement_id) return lastMovement.id;
  if (lastMovement.type === 'RETURN' && lastMovement.reverses_movement_id) return lastMovement.returned_from_movement_id;
  return null;
}

/**
 * Devolucion de unidades prestadas (spec etapa 2 §3.1). Reingresa cada unidad al costo con que
 * salio, recalcula el promedio como una entrada y copia el destino de la salida, asi lo
 * imputado al tenedor queda compensado. La salida original sigue vigente: el prestamo existio.
 */
export async function registerReturn(
  tx: Tx,
  companyId: string,
  createdBy: string,
  input: ReturnInput
): Promise<RegisteredMovement> {
  if (input.unitIds.length === 0) throw new StockError('INVALID_INPUT', 'Elegí al menos una unidad para devolver');

  // 1. La salida, lockeada (primer lock del dominio, como el original en una anulacion).
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM stock_movements
    WHERE id = ${input.exitMovementId}::uuid AND company_id = ${companyId}::uuid
    FOR UPDATE
  `;
  if (locked.length === 0) throw new StockError('NOT_FOUND', 'La salida no existe');
  const exit = await tx.stock_movements.findUniqueOrThrow({
    where: { id: input.exitMovementId },
    include: { lines: { select: { unit_id: true, material_id: true, unit_cost: true } } },
  });
  if (exit.type !== 'EXIT' || exit.reverses_movement_id) {
    throw new StockError('NOT_ON_LOAN', `${exit.number} no es una salida: no hay préstamo que devolver`);
  }

  const warehouse = await tx.warehouses.findFirst({
    where: { id: input.warehouseId, company_id: companyId },
    select: { id: true, name: true, is_active: true },
  });
  if (!warehouse) throw new StockError('NOT_FOUND', 'El depósito no existe en la empresa');
  if (!warehouse.is_active) throw new StockError('INACTIVE_WAREHOUSE', `El depósito ${warehouse.name} está inactivo`);

  const unitIds = [...new Set(input.unitIds)];
  const exitLineByUnit = new Map(exit.lines.filter((l) => l.unit_id).map((l) => [l.unit_id!, l]));
  for (const unitId of unitIds) {
    if (!exitLineByUnit.has(unitId)) {
      throw new StockError('UNIT_NOT_AVAILABLE', `Una de las unidades no salió en ${exit.number}`);
    }
  }

  // 2-4. Locks en el orden del dominio.
  const materials = await lockMaterials(
    tx,
    companyId,
    unitIds.map((u) => exitLineByUnit.get(u)!.material_id)
  );
  const balances = await lockBalances(
    tx,
    companyId,
    unitIds.map((u) => ({ materialId: exitLineByUnit.get(u)!.material_id, warehouseId: warehouse.id, batchId: null }))
  );
  const totals = await companyTotals(tx, companyId, [...materials.keys()]);
  const units = await lockUnits(tx, companyId, unitIds);

  // Cada unidad tiene que seguir prestada por ESTA salida.
  const lastIds = [...new Set([...units.values()].map((u) => u.last_movement_id).filter((id): id is string => !!id))];
  const lastMovements = new Map(
    (
      await tx.stock_movements.findMany({
        where: { id: { in: lastIds } },
        select: { id: true, type: true, reverses_movement_id: true, returned_from_movement_id: true },
      })
    ).map((m) => [m.id, m])
  );
  for (const unit of units.values()) {
    const last = unit.last_movement_id ? lastMovements.get(unit.last_movement_id) : undefined;
    if (unit.status !== 'OUT' || !last || loanExitOf(last) !== exit.id) {
      throw new StockError('NOT_ON_LOAN', `La unidad ${unit.serial_number} no está prestada por ${exit.number}`);
    }
  }

  const quantities = new Map([...balances].map(([k, b]) => [k, dec(b.quantity)]));
  const averages = new Map([...materials].map(([id, m]) => [id, dec(m.average_cost)]));
  const changedAverages = new Set<string>();
  let totalCost = dec(0);

  for (const unitId of unitIds) {
    const line = exitLineByUnit.get(unitId)!;
    const total = totals.get(line.material_id) ?? dec(0);
    averages.set(line.material_id, averageCostAfterEntry(total, averages.get(line.material_id)!, 1, line.unit_cost));
    changedAverages.add(line.material_id);
    totals.set(line.material_id, total.plus(1));
    const key = balanceKey({ materialId: line.material_id, warehouseId: warehouse.id, batchId: null });
    quantities.set(key, (quantities.get(key) ?? dec(0)).plus(1));
    totalCost = totalCost.plus(lineTotal(1, line.unit_cost));
  }

  const number = await nextStockMovementNumber(tx, companyId);
  const movement = await tx.stock_movements.create({
    data: {
      company_id: companyId,
      number,
      type: 'RETURN',
      warehouse_id: warehouse.id,
      occurred_on: toDateColumn(input.occurredOn),
      notes: input.notes?.trim() || null,
      destination_type: exit.destination_type,
      employee_id: exit.employee_id,
      vehicle_id: exit.vehicle_id,
      other_equipment_id: exit.other_equipment_id,
      maintenance_order_id: exit.maintenance_order_id,
      customer_id: exit.customer_id,
      customer_service_id: exit.customer_service_id,
      returned_from_movement_id: exit.id,
      total_cost: totalCost,
      created_by: createdBy,
    },
    select: { id: true, number: true },
  });

  await tx.stock_movement_lines.createMany({
    data: unitIds.map((unitId) => {
      const line = exitLineByUnit.get(unitId)!;
      return {
        movement_id: movement.id,
        material_id: line.material_id,
        quantity: dec(1),
        direction: 1,
        unit_cost: line.unit_cost,
        total_cost: lineTotal(1, line.unit_cost),
        unit_id: unitId,
      };
    }),
  });
  await writeBalances(tx, balances, quantities);
  await tx.material_units.updateMany({
    where: { id: { in: unitIds } },
    data: { status: 'IN_STOCK', warehouse_id: warehouse.id, last_movement_id: movement.id },
  });
  await writeAverages(tx, averages, changedAverages);

  return { id: movement.id, number: movement.number, totalCost, lineCount: unitIds.length };
}

export interface WriteOffInput {
  unitId: string;
  reason: 'LOST' | 'BROKEN';
  notes: string;
}

/**
 * Baja de una unidad prestada que no vuelve (spec etapa 2 §3.2). No es un movimiento de stock:
 * la unidad ya habia salido, no hay saldo que tocar, y su costo queda imputado a quien la tenia.
 */
export async function writeOffLoanedUnit(
  tx: Tx,
  companyId: string,
  createdBy: string,
  input: WriteOffInput
): Promise<{ unitId: string; serialNumber: string; loanMovementId: string }> {
  const notes = input.notes.trim();
  if (!notes) throw new StockError('INVALID_INPUT', 'Contá qué pasó con la herramienta');

  // Orden de locks del dominio: primero el movimiento del prestamo, despues la unidad (como
  // `registerReturn` y la anulacion). Si se lockeara la unidad primero, una devolucion
  // simultanea de la misma herramienta se esperaria en cruz con esta baja (deadlock).
  const peek = await tx.material_units.findFirst({
    where: { id: input.unitId, company_id: companyId },
    select: { last_movement_id: true },
  });
  if (!peek) throw new StockError('NOT_FOUND', 'La unidad no existe en la empresa');
  if (peek.last_movement_id) {
    await tx.$executeRaw`SELECT id FROM stock_movements WHERE id = ${peek.last_movement_id}::uuid FOR UPDATE`;
  }

  const unit = (await lockUnits(tx, companyId, [input.unitId])).get(input.unitId)!;
  // Releida con lock: si otra transaccion la devolvio entre la lectura y el lock, el prestamo
  // ya no es el mismo.
  if (unit.status !== 'OUT' || !unit.last_movement_id || unit.last_movement_id !== peek.last_movement_id) {
    throw new StockError('NOT_ON_LOAN', `La unidad ${unit.serial_number} no está prestada`);
  }

  await tx.material_unit_write_offs.create({
    data: {
      company_id: companyId,
      unit_id: unit.id,
      loan_movement_id: unit.last_movement_id,
      reason: input.reason,
      notes,
      created_by: createdBy,
    },
  });
  await tx.material_units.update({ where: { id: unit.id }, data: { status: 'DISCARDED', warehouse_id: null } });

  return { unitId: unit.id, serialNumber: unit.serial_number, loanMovementId: unit.last_movement_id };
}

// ── Entregas de pedidos (etapa 3) ───────────────────────────────────────────

/**
 * Entrega (total o parcial) de un pedido aprobado: una salida con el destino del pedido,
 * registrada por el mismo camino que cualquier salida (lotes, unidades, stock, vencidos) y
 * vinculada al pedido y a sus lineas. No pasa por la regla de salida directa: el pedido ya fue
 * aprobado. Lockea el pedido antes que los materiales (orden del dominio), asi dos entregas
 * simultaneas de lo ultimo pendiente se ordenan y la segunda falla con `OVER_DELIVERY`.
 */
export async function registerRequestDelivery(
  tx: Tx,
  companyId: string,
  createdBy: string,
  input: RequestDeliveryInput
): Promise<RegisteredMovement> {
  if (input.lines.length === 0) throw new StockError('INVALID_INPUT', 'Indicá al menos una cantidad a entregar');

  const locked = await lockRequest(tx, companyId, input.requestId);
  if (!canApplyRequestAction(locked.status, 'deliver')) {
    throw new StockError(
      'INVALID_STATE',
      locked.status === 'DELIVERED'
        ? `${locked.number} ya fue entregado por completo`
        : `${locked.number} no admite entregas: tiene que estar aprobado`
    );
  }

  const request = await tx.material_requests.findUniqueOrThrow({
    where: { id: locked.id },
    include: {
      lines: { include: { material: { select: { name: true, tracking_type: true, unit: { select: { abbreviation: true } } } } } },
    },
  });
  const linesById = new Map(request.lines.map((l) => [l.id, l]));
  const delivered = await deliveredByLine(tx, request.id);

  // Lo pendiente se descuenta a medida que se recorren las lineas de la entrega: la misma linea
  // del pedido puede venir dos veces (por ejemplo, de dos lotes distintos).
  const pending = new Map(request.lines.map((l) => [l.id, dec(l.quantity).minus(delivered.get(l.id) ?? 0)]));
  for (const line of input.lines) {
    const requestLine = linesById.get(line.requestLineId);
    if (!requestLine) throw new StockError('INVALID_INPUT', `Una de las líneas no es de ${request.number}`);
    const quantity = dec(line.quantity);
    const left = pending.get(requestLine.id)!;
    if (quantity.gt(left)) {
      const unit = requestLine.material.unit.abbreviation;
      throw new StockError(
        'OVER_DELIVERY',
        `De ${requestLine.material.name} quedan ${formatQuantity(left.isNegative() ? dec(0) : left)} ${unit} por entregar: no se pueden entregar ${formatQuantity(quantity)} ${unit}`
      );
    }
    pending.set(requestLine.id, left.minus(quantity));
  }

  const movement = await registerMovement(
    tx,
    companyId,
    createdBy,
    {
      type: 'EXIT',
      warehouseId: input.warehouseId,
      targetWarehouseId: null,
      occurredOn: input.occurredOn,
      reference: request.number,
      notes: input.notes,
      destinationType: request.destination_type,
      employeeId: request.employee_id,
      vehicleId: request.vehicle_id,
      otherEquipmentId: request.other_equipment_id,
      maintenanceOrderId: request.maintenance_order_id,
      customerId: request.customer_id,
      customerServiceId: request.customer_service_id,
      lines: input.lines.map((line) => {
        const tracking = linesById.get(line.requestLineId)!.material.tracking_type;
        return {
          materialId: linesById.get(line.requestLineId)!.material_id,
          quantity: line.quantity,
          unitCost: null,
          adjustmentDirection: null,
          batchId: tracking === 'BATCH' ? line.batchId : null,
          batchNumber: null,
          batchExpiresOn: null,
          serialNumbers: [],
          unitIds: tracking === 'SERIAL' ? line.unitIds : [],
        };
      }),
    },
    { requestId: request.id, requestLineIds: input.lines.map((l) => l.requestLineId) }
  );

  await recomputeRequestStatus(tx, locked);
  return movement;
}
