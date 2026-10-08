import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import type { TireStatus } from '@/generated/prisma/enums';
import type { StockMovementInput, StockMovementLineInput } from '../schemas/stock-movement';
import {
  loanExitOf,
  registerReturn,
  registerStockMovement,
  writeOffLoanedUnit,
  type RegisteredMovement,
} from './stock-engine';
import { StockError } from './stock-errors';
import { tireMaterialFor } from './tire-materials';

/**
 * Stock de las cubiertas (Almacenes etapa 6). Gomeria llama a estas funciones con el `tx` de su
 * propia transaccion; todas pasan por el motor, que sigue siendo el unico escritor de saldos,
 * unidades y costo promedio.
 *
 * Una cubierta sin unidad (`tires.material_unit_id` NULL) es una cubierta "sin stock": anterior a
 * la etapa o sin inventario inicial. Para ella estas funciones no hacen nada y devuelven `null`,
 * asi Gomeria sigue funcionando como antes.
 */

type Tx = Prisma.TransactionClient;

const NO_DESTINATION = {
  destinationType: null,
  employeeId: null,
  vehicleId: null,
  otherEquipmentId: null,
  maintenanceOrderId: null,
  customerId: null,
  customerServiceId: null,
} satisfies Partial<StockMovementInput>;

function unitLine(materialId: string, unitIds: string[]): StockMovementLineInput {
  return {
    materialId,
    quantity: String(unitIds.length),
    unitCost: null,
    adjustmentDirection: null,
    batchId: null,
    batchNumber: null,
    batchExpiresOn: null,
    serialNumbers: [],
    unitIds,
  };
}

async function readTire(tx: Tx, companyId: string, tireId: string) {
  const tire = await tx.tires.findFirst({
    where: { id: tireId, company_id: companyId },
    select: {
      id: true,
      serial_number: true,
      material_unit: {
        select: { id: true, material_id: true, status: true, warehouse_id: true, last_movement_id: true },
      },
    },
  });
  if (!tire) throw new StockError('NOT_FOUND', 'La cubierta no existe en la empresa');
  return tire;
}

/**
 * Deposito al que vuelve una cubierta: el elegido, o el unico deposito activo de la empresa.
 * Con varios depositos y ninguno elegido, se rechaza: no se adivina donde quedo.
 */
export async function resolveReturnWarehouse(
  tx: Tx,
  companyId: string,
  warehouseId: string | null | undefined,
  serialNumber: string
): Promise<string> {
  if (warehouseId) return warehouseId;
  const active = await tx.warehouses.findMany({
    where: { company_id: companyId, is_active: true },
    select: { id: true },
    take: 2,
  });
  if (active.length === 1) return active[0]!.id;
  throw new StockError('INVALID_INPUT', `Elegí el depósito al que vuelve la cubierta ${serialNumber}`);
}

/** Si la cubierta tiene unidad, esta en un deposito: la usan los pickers para avisar. */
export function isTireMountable(unit: { status: string } | null): boolean {
  return unit === null || unit.status === 'IN_STOCK';
}

// ── Montar, desmontar y dar de baja ─────────────────────────────────────────

export interface MountTireInput {
  tireId: string;
  vehicleId: string;
  reference: string;
}

/** Montar: salida de la unidad desde su deposito, imputada al vehiculo. */
export async function mountTire(
  tx: Tx,
  companyId: string,
  createdBy: string,
  input: MountTireInput
): Promise<RegisteredMovement | null> {
  const tire = await readTire(tx, companyId, input.tireId);
  const unit = tire.material_unit;
  if (!unit) return null;
  if (unit.status === 'DISCARDED') {
    throw new StockError('UNIT_NOT_AVAILABLE', `La cubierta ${tire.serial_number} fue dada de baja`);
  }
  if (unit.status !== 'IN_STOCK' || !unit.warehouse_id) {
    throw new StockError(
      'UNIT_NOT_AVAILABLE',
      `La cubierta ${tire.serial_number} no está en un depósito: registrá su devolución antes de montarla`
    );
  }
  return registerStockMovement(tx, companyId, createdBy, {
    ...NO_DESTINATION,
    type: 'EXIT',
    warehouseId: unit.warehouse_id,
    targetWarehouseId: null,
    occurredOn: new Date(),
    reference: input.reference,
    notes: null,
    destinationType: 'VEHICLE',
    vehicleId: input.vehicleId,
    lines: [unitLine(unit.material_id, [unit.id])],
  });
}

export interface ReturnTireInput {
  tireId: string;
  /** Si es null y la empresa tiene un solo deposito activo, vuelve a ese. */
  warehouseId: string | null;
  notes: string | null;
}

/**
 * Desmontar a disponible (o marcarla reparada o encontrada): devolucion de la unidad desde la
 * salida que la dejo afuera. Si la unidad ya esta en un deposito, no hace nada.
 */
export async function returnTire(
  tx: Tx,
  companyId: string,
  createdBy: string,
  input: ReturnTireInput
): Promise<RegisteredMovement | null> {
  const tire = await readTire(tx, companyId, input.tireId);
  const unit = tire.material_unit;
  if (!unit || unit.status === 'IN_STOCK') return null;
  if (unit.status === 'DISCARDED') {
    throw new StockError('UNIT_NOT_AVAILABLE', `La cubierta ${tire.serial_number} fue dada de baja`);
  }
  const last = unit.last_movement_id
    ? await tx.stock_movements.findUnique({
        where: { id: unit.last_movement_id },
        select: { id: true, type: true, reverses_movement_id: true, returned_from_movement_id: true },
      })
    : null;
  const exitMovementId = last ? loanExitOf(last) : null;
  if (!exitMovementId) {
    throw new StockError('NOT_ON_LOAN', `No se encontró la salida de la cubierta ${tire.serial_number}`);
  }
  const warehouseId = await resolveReturnWarehouse(tx, companyId, input.warehouseId, tire.serial_number);
  return registerReturn(tx, companyId, createdBy, {
    exitMovementId,
    unitIds: [unit.id],
    warehouseId,
    occurredOn: new Date(),
    notes: input.notes,
  });
}

export interface WriteOffTireInput {
  tireId: string;
  reason: 'LOST' | 'BROKEN';
  notes: string;
}

/**
 * Descartar la cubierta. Si esta afuera, baja de la unidad prestada (su costo queda imputado a
 * quien la tenia); si esta en un deposito, ajuste negativo con motivo.
 */
export async function writeOffTire(tx: Tx, companyId: string, createdBy: string, input: WriteOffTireInput): Promise<void> {
  const tire = await readTire(tx, companyId, input.tireId);
  const unit = tire.material_unit;
  if (!unit || unit.status === 'DISCARDED') return;
  const notes = input.notes.trim() || (input.reason === 'LOST' ? 'Cubierta extraviada' : 'Cubierta descartada');

  if (unit.status === 'OUT') {
    await writeOffLoanedUnit(tx, companyId, createdBy, { unitId: unit.id, reason: input.reason, notes });
    return;
  }
  await registerStockMovement(tx, companyId, createdBy, {
    ...NO_DESTINATION,
    type: 'ADJUSTMENT',
    warehouseId: unit.warehouse_id!,
    targetWarehouseId: null,
    occurredOn: new Date(),
    reference: 'Descarte de cubierta',
    notes: `Descarte de la cubierta ${tire.serial_number}: ${notes}`,
    lines: [{ ...unitLine(unit.material_id, [unit.id]), adjustmentDirection: 'OUT' }],
  });
}

/**
 * Efecto en el stock de un cambio de estado hecho fuera de una orden (catalogo, diagrama del
 * vehiculo): disponible = vuelve al deposito; descartada = baja (extraviada si estaba perdida).
 */
export async function applyTireStatusChange(
  tx: Tx,
  companyId: string,
  createdBy: string,
  input: { tireId: string; from: TireStatus; to: TireStatus; warehouseId: string | null; notes: string | null }
): Promise<void> {
  if (input.to === 'AVAILABLE') {
    await returnTire(tx, companyId, createdBy, { tireId: input.tireId, warehouseId: input.warehouseId, notes: input.notes });
  } else if (input.to === 'DISCARDED') {
    await writeOffTire(tx, companyId, createdBy, {
      tireId: input.tireId,
      reason: input.from === 'MISSING' ? 'LOST' : 'BROKEN',
      notes: input.notes ?? '',
    });
  }
}

// ── Altas ───────────────────────────────────────────────────────────────────

export interface NewTireRow {
  serial_number: string;
  brand_id: string;
  tire_type_id: string;
  is_new: boolean;
  retread_level: Prisma.tiresCreateManyInput['retread_level'];
  tread_depth: number | null;
}

/**
 * Alta de cubiertas desde el catalogo de Gomeria: una entrada al deposito con sus series, al
 * costo indicado, y cada cubierta vinculada a su unidad. Todas en una transaccion.
 */
export async function createTiresWithStock(
  tx: Tx,
  companyId: string,
  createdBy: string,
  input: { tires: NewTireRow[]; warehouseId: string; unitCost: string }
): Promise<RegisteredMovement> {
  const byMaterial = new Map<string, string[]>();
  for (const tire of input.tires) {
    const materialId = await tireMaterialFor(tx, companyId, tire.tire_type_id, tire.brand_id);
    byMaterial.set(materialId, [...(byMaterial.get(materialId) ?? []), tire.serial_number]);
  }

  const movement = await registerStockMovement(tx, companyId, createdBy, {
    ...NO_DESTINATION,
    type: 'ENTRY',
    warehouseId: input.warehouseId,
    targetWarehouseId: null,
    occurredOn: new Date(),
    reference: 'Alta de cubiertas',
    notes: null,
    lines: [...byMaterial].map(([materialId, serials]) => ({
      ...unitLine(materialId, []),
      quantity: String(serials.length),
      unitCost: input.unitCost,
      serialNumbers: serials,
    })),
  });

  const units = await tx.stock_movement_lines.findMany({
    where: { movement_id: movement.id },
    select: { unit: { select: { id: true, serial_number: true } } },
  });
  const unitBySerial = new Map(units.flatMap((l) => (l.unit ? [[l.unit.serial_number, l.unit.id] as const] : [])));

  await tx.tires.createMany({
    data: input.tires.map((tire) => ({
      ...tire,
      tread_depth: tire.tread_depth != null ? String(tire.tread_depth) : null,
      company_id: companyId,
      material_unit_id: unitBySerial.get(tire.serial_number)!,
    })),
  });
  return movement;
}

/** Materiales de cubiertas entre los indicados. */
async function tireMaterialIds(tx: Tx, materialIds: string[]): Promise<Set<string>> {
  if (materialIds.length === 0) return new Set();
  const links = await tx.tire_materials.findMany({
    where: { material_id: { in: [...new Set(materialIds)] } },
    select: { material_id: true },
  });
  return new Set(links.map((l) => l.material_id));
}

/** Si alguno de los materiales es de cubiertas (para los bloqueos de Almacenes, spec §3.4). */
export async function hasTireMaterials(tx: Tx, materialIds: string[]): Promise<boolean> {
  return (await tireMaterialIds(tx, materialIds)).size > 0;
}

/**
 * Entrada en Almacenes de un material de cubiertas (o ajuste que suma): cada unidad que entra es
 * una cubierta de Gomeria, disponible. Si ya existe una cubierta disponible con esa serie y sin
 * stock, se vincula en vez de duplicarla.
 */
export async function linkTiresFromEntry(tx: Tx, companyId: string, movementId: string): Promise<number> {
  const lines = await tx.stock_movement_lines.findMany({
    where: { movement_id: movementId, direction: 1, unit_id: { not: null } },
    select: { material_id: true, unit: { select: { id: true, serial_number: true } } },
  });
  const tireMaterials = await tireMaterialIds(
    tx,
    lines.map((l) => l.material_id)
  );
  const tireLines = lines.filter((l) => tireMaterials.has(l.material_id) && l.unit);
  if (tireLines.length === 0) return 0;

  const combos = new Map(
    (
      await tx.tire_materials.findMany({
        where: { material_id: { in: [...tireMaterials] } },
        select: { material_id: true, tire_type_id: true, tire_brand_id: true },
      })
    ).map((c) => [c.material_id, c])
  );
  const existing = new Map(
    (
      await tx.tires.findMany({
        where: { company_id: companyId, serial_number: { in: tireLines.map((l) => l.unit!.serial_number) } },
        select: {
          id: true,
          serial_number: true,
          status: true,
          brand_id: true,
          tire_type_id: true,
          material_unit_id: true,
          is_active: true,
        },
      })
    ).map((t) => [t.serial_number, t])
  );

  for (const line of tireLines) {
    const unit = line.unit!;
    const combo = combos.get(line.material_id)!;
    const tire = existing.get(unit.serial_number);
    if (!tire) {
      await tx.tires.create({
        data: {
          company_id: companyId,
          serial_number: unit.serial_number,
          brand_id: combo.tire_brand_id,
          tire_type_id: combo.tire_type_id,
          is_new: true,
          status: 'AVAILABLE',
          material_unit_id: unit.id,
        },
      });
      continue;
    }
    if (tire.material_unit_id === unit.id) {
      // Serie descartada que vuelve a entrar: la cubierta vuelve a estar disponible.
      await tx.tires.update({ where: { id: tire.id }, data: { status: 'AVAILABLE', is_active: true } });
      continue;
    }
    if (tire.material_unit_id || tire.status !== 'AVAILABLE' || !tire.is_active) {
      throw new StockError(
        'DUPLICATE_SERIAL',
        `La cubierta ${unit.serial_number} ya existe en Gomería: cargala con el inventario inicial de cubiertas`
      );
    }
    if (tire.tire_type_id !== combo.tire_type_id || tire.brand_id !== combo.tire_brand_id) {
      throw new StockError(
        'DUPLICATE_SERIAL',
        `La cubierta ${unit.serial_number} ya existe en Gomería con otra medida o marca`
      );
    }
    await tx.tires.update({ where: { id: tire.id }, data: { material_unit_id: unit.id } });
  }
  return tireLines.length;
}

// ── Inventario inicial ──────────────────────────────────────────────────────

/** Cubiertas sin stock (activas, no descartadas), agrupadas por tipo + marca, con su cantidad por estado. */
/**
 * Recibe solo el delegado de `tires`: la llama la action con el cliente completo y comparar ese tipo
 * contra `TransactionClient` hace que el chequeo de `next build` se corte ("excessively deep").
 */
export async function getTiresWithoutStock(tx: Pick<Tx, 'tires'>, companyId: string) {
  const tires = await tx.tires.findMany({
    where: { company_id: companyId, is_active: true, material_unit_id: null, status: { not: 'DISCARDED' } },
    select: {
      status: true,
      tire_type: { select: { id: true, size: true, tread_type: true } },
      brand: { select: { id: true, name: true } },
    },
  });
  const groups = new Map<
    string,
    {
      tireTypeId: string;
      brandId: string;
      size: string;
      treadType: string;
      brandName: string;
      total: number;
      byStatus: Partial<Record<TireStatus, number>>;
    }
  >();
  for (const tire of tires) {
    const key = `${tire.tire_type.id}|${tire.brand.id}`;
    const group = groups.get(key) ?? {
      tireTypeId: tire.tire_type.id,
      brandId: tire.brand.id,
      size: tire.tire_type.size,
      treadType: tire.tire_type.tread_type,
      brandName: tire.brand.name,
      total: 0,
      byStatus: {},
    };
    group.total += 1;
    group.byStatus[tire.status] = (group.byStatus[tire.status] ?? 0) + 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => a.size.localeCompare(b.size) || a.treadType.localeCompare(b.treadType) || a.brandName.localeCompare(b.brandName)
  );
}

export interface InitialInventoryInput {
  warehouseId: string;
  costs: { tireTypeId: string; brandId: string; unitCost: string }[];
}

export interface InitialInventoryResult {
  entryNumber: string;
  tires: number;
  exits: string[];
  /** Montadas, en reparacion o faltantes cuyo vehiculo no se conoce (o esta de baja): quedan en el deposito. */
  keptInWarehouse: number;
}

/**
 * Inventario inicial (spec §3.5): una entrada al deposito con todas las cubiertas sin stock, al
 * costo de su grupo, y una salida por vehiculo para las que estan montadas, en reparacion o
 * faltantes (al vehiculo del ultimo item de gomeria que las desmonto).
 */
export async function registerInitialTireInventory(
  tx: Tx,
  companyId: string,
  createdBy: string,
  input: InitialInventoryInput
): Promise<InitialInventoryResult> {
  const tires = await tx.$queryRaw<
    { id: string; serial_number: string; status: TireStatus; tire_type_id: string; brand_id: string }[]
  >`
    SELECT id, serial_number, status::text AS status, tire_type_id, brand_id
    FROM tires
    WHERE company_id = ${companyId}::uuid AND is_active AND material_unit_id IS NULL AND status <> 'DISCARDED'
    ORDER BY id
    FOR UPDATE
  `;
  if (tires.length === 0) throw new StockError('INVALID_STATE', 'No hay cubiertas sin stock');

  const costByCombo = new Map(input.costs.map((c) => [`${c.tireTypeId}|${c.brandId}`, c.unitCost]));
  const lines = new Map<string, { materialId: string; unitCost: string; serials: string[] }>();
  const materialOf = new Map<string, string>();
  for (const tire of tires) {
    const key = `${tire.tire_type_id}|${tire.brand_id}`;
    const unitCost = costByCombo.get(key);
    if (unitCost === undefined) {
      throw new StockError('INVALID_INPUT', 'Falta el costo de uno de los grupos de cubiertas');
    }
    let line = lines.get(key);
    if (!line) {
      line = { materialId: await tireMaterialFor(tx, companyId, tire.tire_type_id, tire.brand_id), unitCost, serials: [] };
      lines.set(key, line);
    }
    line.serials.push(tire.serial_number);
    materialOf.set(tire.id, line.materialId);
  }

  const entry = await registerStockMovement(tx, companyId, createdBy, {
    ...NO_DESTINATION,
    type: 'ENTRY',
    warehouseId: input.warehouseId,
    targetWarehouseId: null,
    occurredOn: new Date(),
    reference: 'Inventario inicial de cubiertas',
    notes: null,
    lines: [...lines.values()].map((l) => ({
      ...unitLine(l.materialId, []),
      quantity: String(l.serials.length),
      unitCost: l.unitCost,
      serialNumbers: l.serials,
    })),
  });

  const created = await tx.stock_movement_lines.findMany({
    where: { movement_id: entry.id },
    select: { unit: { select: { id: true, serial_number: true } } },
  });
  const unitBySerial = new Map(created.flatMap((l) => (l.unit ? [[l.unit.serial_number, l.unit.id] as const] : [])));
  for (const tire of tires) {
    await tx.tires.update({ where: { id: tire.id }, data: { material_unit_id: unitBySerial.get(tire.serial_number)! } });
  }

  // Donde esta cada cubierta que no esta disponible.
  const outside = tires.filter((t) => t.status !== 'AVAILABLE');
  const outsideIds = outside.map((t) => t.id);
  const [positions, items] = await Promise.all([
    tx.vehicle_tire_positions.findMany({
      where: { tire_id: { in: outsideIds } },
      select: { tire_id: true, vehicle_id: true },
    }),
    tx.tire_service_items.findMany({
      where: { tire_id: { in: outsideIds }, action: { in: ['REPLACE', 'REPAIR', 'MISSING_REPORT'] } },
      select: { tire_id: true, vehicle_id: true },
      orderBy: { created_at: 'desc' },
    }),
  ]);
  const mountedOn = new Map(positions.map((p) => [p.tire_id!, p.vehicle_id]));
  const lastRemovedFrom = new Map<string, string>();
  for (const item of items) if (!lastRemovedFrom.has(item.tire_id!)) lastRemovedFrom.set(item.tire_id!, item.vehicle_id);

  const vehicleOf = (tire: (typeof outside)[number]) =>
    tire.status === 'INSTALLED' ? mountedOn.get(tire.id) : lastRemovedFrom.get(tire.id);
  const candidateVehicles = [...new Set(outside.map(vehicleOf).filter((v): v is string => !!v))];
  const activeVehicles = new Set(
    (
      await tx.vehicles.findMany({
        where: { id: { in: candidateVehicles }, company_id: companyId, is_active: true },
        select: { id: true },
      })
    ).map((v) => v.id)
  );

  const byVehicle = new Map<string, Map<string, string[]>>();
  let keptInWarehouse = 0;
  for (const tire of outside) {
    const vehicleId = vehicleOf(tire);
    if (!vehicleId || !activeVehicles.has(vehicleId)) {
      keptInWarehouse += 1;
      continue;
    }
    const perMaterial = byVehicle.get(vehicleId) ?? new Map<string, string[]>();
    const materialId = materialOf.get(tire.id)!;
    perMaterial.set(materialId, [...(perMaterial.get(materialId) ?? []), unitBySerial.get(tire.serial_number)!]);
    byVehicle.set(vehicleId, perMaterial);
  }

  const exits: string[] = [];
  for (const [vehicleId, perMaterial] of byVehicle) {
    const exit = await registerStockMovement(tx, companyId, createdBy, {
      ...NO_DESTINATION,
      type: 'EXIT',
      warehouseId: input.warehouseId,
      targetWarehouseId: null,
      occurredOn: new Date(),
      reference: 'Inventario inicial de cubiertas',
      notes: 'Cubiertas montadas, en reparación o extraviadas al cargar el inventario inicial',
      destinationType: 'VEHICLE',
      vehicleId,
      lines: [...perMaterial].map(([materialId, unitIds]) => unitLine(materialId, unitIds)),
    });
    exits.push(exit.number);
  }

  return { entryNumber: entry.number, tires: tires.length, exits, keptInWarehouse };
}
