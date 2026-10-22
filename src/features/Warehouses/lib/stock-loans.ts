import 'server-only';

import { averageCostAfterEntry, lineTotal } from './average-cost';
import { nextStockMovementNumber } from './movement-numbering';
import { StockError } from './stock-errors';
import {
  balanceKey,
  companyTotals,
  dec,
  lockBalances,
  lockMaterials,
  lockUnits,
  lockWarehouses,
  toDateColumn,
  writeAverages,
  writeBalances,
  type RegisteredMovement,
  type Tx,
} from './stock-locks';

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
  if (lastMovement.type === 'RETURN' && lastMovement.reverses_movement_id)
    return lastMovement.returned_from_movement_id;
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

  // Deposito (FOR SHARE, paso 3 del orden de locks).
  const warehouse = (await lockWarehouses(tx, companyId, [input.warehouseId])).get(input.warehouseId);
  if (!warehouse) throw new StockError('NOT_FOUND', 'El depósito no existe en la empresa');
  if (!warehouse.is_active) throw new StockError('INACTIVE_WAREHOUSE', `El depósito ${warehouse.name} está inactivo`);

  const unitIds = [...new Set(input.unitIds)];
  const exitLineByUnit = new Map(exit.lines.filter((l) => l.unit_id).map((l) => [l.unit_id!, l]));
  for (const unitId of unitIds) {
    if (!exitLineByUnit.has(unitId)) {
      throw new StockError('UNIT_NOT_AVAILABLE', `Una de las unidades no salió en ${exit.number}`);
    }
  }

  // 4-6. Locks en el orden del dominio.
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
