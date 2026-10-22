import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import moment from 'moment';
import type { MaterialTrackingTypeValue, StockMovementInput } from '../schemas/stock-movement';
import { StockError } from './stock-errors';

/**
 * Lecturas con lock y escrituras de saldos del motor de stock (`stock-engine.ts`). El orden de locks
 * del dominio está documentado ahí: estas funciones solo lockean lo que se les pide, en orden de id.
 */

export type Tx = Prisma.TransactionClient;
export type Decimal = Prisma.Decimal;

export const dec = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);

export interface RegisteredMovement {
  id: string;
  number: string;
  totalCost: Decimal;
  lineCount: number;
}

// ── Lecturas con lock ───────────────────────────────────────────────────────

export interface MaterialRow {
  id: string;
  code: string;
  name: string;
  tracking_type: MaterialTrackingTypeValue;
  is_active: boolean;
  average_cost: Decimal;
  unit: string;
}

export async function lockMaterials(tx: Tx, companyId: string, ids: string[]): Promise<Map<string, MaterialRow>> {
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

export interface BalanceRow {
  id: string;
  material_id: string;
  warehouse_id: string;
  batch_id: string | null;
  quantity: Decimal;
}

export interface BalanceKey {
  materialId: string;
  warehouseId: string;
  batchId: string | null;
}

export const balanceKey = (k: BalanceKey) => `${k.materialId}|${k.warehouseId}|${k.batchId ?? ''}`;

/**
 * Crea las filas de saldo que falten (en 0) y lockea todas las involucradas. Crear antes de
 * lockear evita la carrera "no existe → la creo yo" entre dos transacciones; el unico
 * NULLS NOT DISTINCT de la base hace que la segunda no duplique.
 */
export async function lockBalances(tx: Tx, companyId: string, keys: BalanceKey[]): Promise<Map<string, BalanceRow>> {
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
export async function companyTotals(tx: Tx, companyId: string, materialIds: string[]): Promise<Map<string, Decimal>> {
  const rows = await tx.$queryRaw<{ material_id: string; total: Decimal }[]>`
    SELECT material_id, COALESCE(SUM(quantity), 0) AS total
    FROM stock_balances
    WHERE company_id = ${companyId}::uuid AND material_id = ANY(${[...new Set(materialIds)]}::uuid[])
    GROUP BY material_id
  `;
  return new Map(rows.map((r) => [r.material_id, dec(r.total)]));
}

export interface UnitRow {
  id: string;
  material_id: string;
  serial_number: string;
  status: 'IN_STOCK' | 'OUT' | 'DISCARDED';
  warehouse_id: string | null;
  last_movement_id: string | null;
}

export async function lockUnits(tx: Tx, companyId: string, ids: string[]): Promise<Map<string, UnitRow>> {
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

/** Fecha sin hora → `Date` a medianoche UTC, que es como Prisma escribe una columna `@db.Date`. */
export function toDateColumn(value: Date): Date {
  return new Date(`${moment(value).format('YYYY-MM-DD')}T00:00:00.000Z`);
}

export interface WarehouseRow {
  id: string;
  name: string;
  is_active: boolean;
}

/**
 * Lee los depositos con FOR SHARE (paso 3 del orden de locks), en orden de id. El estado que se
 * valida es el que devuelve esta misma sentencia, despues de esperar una baja en curso. No falla
 * si falta alguno: cada caller decide el mensaje.
 */
export async function lockWarehouses(tx: Tx, companyId: string, ids: string[]): Promise<Map<string, WarehouseRow>> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return new Map();
  const rows = await tx.$queryRaw<WarehouseRow[]>`
    SELECT id, name, is_active
    FROM warehouses
    WHERE id = ANY(${unique}::uuid[]) AND company_id = ${companyId}::uuid
    ORDER BY id
    FOR SHARE
  `;
  return new Map(rows.map((r) => [r.id, r]));
}

export async function loadWarehouses(tx: Tx, companyId: string, input: StockMovementInput) {
  const ids = [input.warehouseId, ...(input.targetWarehouseId ? [input.targetWarehouseId] : [])];
  const byId = await lockWarehouses(tx, companyId, ids);

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

export async function writeBalances(tx: Tx, balances: Map<string, BalanceRow>, quantities: Map<string, Decimal>) {
  for (const [key, row] of balances) {
    const next = quantities.get(key)!;
    if (next.equals(row.quantity)) continue;
    await tx.stock_balances.update({ where: { id: row.id }, data: { quantity: next } });
  }
}

export async function writeAverages(tx: Tx, averages: Map<string, Decimal>, changed: Set<string>) {
  for (const materialId of changed) {
    await tx.materials.update({ where: { id: materialId }, data: { average_cost: averages.get(materialId)! } });
  }
}
