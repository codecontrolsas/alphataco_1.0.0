/**
 * Almacenes: depositos, catalogo (materiales de los tres tipos de control), y unos dos meses de
 * movimientos — compras, transferencias al pañol y al obrador, entregas a empleados, consumos de
 * equipos y ordenes de mantenimiento, una salida a cliente, un ajuste y una anulacion; y pedidos
 * de materiales en todos sus estados, con las entregas vinculadas a sus lineas (etapa 3), y
 * pedidos de una OT en taller (etapa 4).
 *
 * Por que NO pasa por el motor (`src/features/Warehouses/lib/stock-engine.ts`): la imagen de
 * produccion copia `scripts/demo` sin `src/` (salvo el cliente de Prisma), y el motor depende del
 * alias `@/`, de `server-only` y de `moment`. Aca se reproduce la MISMA regla (costo promedio
 * ponderado a nivel empresa; salidas, transferencias y ajustes al promedio vigente; stock nunca
 * negativo) en un libro en memoria, y al final se verifica en la base que cada saldo sea la suma
 * de sus movimientos: si no cierra, el reset aborta en vez de dejar una demo inconsistente.
 */
import { Prisma } from '../../../src/generated/prisma/client.ts';
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import { sample } from '../lib/random.ts';
import type { DemoEmployee } from './employees.ts';
import type { DemoOtherEquipment, DemoVehicle } from './vehicles.ts';

type Decimal = Prisma.Decimal;
const dec = (v: Prisma.Decimal | string | number) => new Prisma.Decimal(v);
const round4 = (v: Decimal) => v.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

/** Copia de src/features/Warehouses/lib/default-units.ts (el wipe nocturno las borra). */
const UNITS = [
  { key: 'u', name: 'Unidad' },
  { key: 'l', name: 'Litro' },
  { key: 'kg', name: 'Kilogramo' },
  { key: 'm', name: 'Metro' },
  { key: 'par', name: 'Par' },
  { key: 'caja', name: 'Caja' },
];

// La ropa y los EPP (guantes, anteojos, botines...) son materiales del catalogo de Ropa: los crea
// `seedClothing` (Almacenes etapa 5). Aca no se duplican.
const CATEGORIES = ['Lubricantes', 'Filtros', 'Herramientas', 'Consumibles', 'Químicos'];

const WAREHOUSES = [
  { key: 'BASE', name: 'Depósito Base Neuquén', address: 'Parque Industrial Neuquén, Calle 3 N° 450' },
  { key: 'PANOL', name: 'Pañol de Taller', address: 'Base Neuquén, nave de mantenimiento' },
  { key: 'ANELO', name: 'Obrador Añelo', address: 'Ruta Provincial 7 km 42, Añelo' },
] as const;
type WarehouseKey = (typeof WAREHOUSES)[number]['key'];

const MATERIALS = [
  { key: 'ACE-15W40', name: 'Aceite motor 15W40', category: 'Lubricantes', unit: 'l', tracking: 'QUANTITY', min: 200 },
  { key: 'ACE-HID68', name: 'Aceite hidráulico ISO 68', category: 'Lubricantes', unit: 'l', tracking: 'QUANTITY', min: 100 },
  { key: 'FIL-ACE', name: 'Filtro de aceite motor', category: 'Filtros', unit: 'u', tracking: 'QUANTITY', min: 10 },
  { key: 'FIL-AIRE', name: 'Filtro de aire primario', category: 'Filtros', unit: 'u', tracking: 'QUANTITY', min: 8 },
  { key: 'CON-CIN', name: 'Cinta aisladora 20 m', category: 'Consumibles', unit: 'u', tracking: 'QUANTITY', min: 40 },
  { key: 'CON-PAN', name: 'Paño absorbente industrial', category: 'Consumibles', unit: 'u', tracking: 'QUANTITY', min: 20 },
  { key: 'GRA-LIT', name: 'Grasa de litio EP2', category: 'Lubricantes', unit: 'kg', tracking: 'BATCH', min: null },
  { key: 'QUI-DES', name: 'Desengrasante industrial', category: 'Químicos', unit: 'l', tracking: 'BATCH', min: 20 },
  { key: 'HER-TAL', name: 'Taladro percutor 13 mm', category: 'Herramientas', unit: 'u', tracking: 'SERIAL', min: null },
  { key: 'HER-AMO', name: 'Amoladora angular 115 mm', category: 'Herramientas', unit: 'u', tracking: 'SERIAL', min: null },
  // Equipo caro y de seguridad: solo sale con pedido aprobado.
  { key: 'HER-DET', name: 'Detector multigás portátil', category: 'Herramientas', unit: 'u', tracking: 'SERIAL', min: 2, requiresApproval: true },
] as const;
type MaterialKey = (typeof MATERIALS)[number]['key'];

type Destination =
  | { type: 'EMPLOYEE'; id: string }
  | { type: 'VEHICLE'; id: string }
  | { type: 'OTHER_EQUIPMENT'; id: string }
  | { type: 'MAINTENANCE_ORDER'; id: string }
  | { type: 'CUSTOMER'; id: string; serviceId: string | null };

interface LineDef {
  material: MaterialKey;
  qty?: number;
  cost?: number;
  batch?: string;
  expires?: number;
  serials?: string[];
  direction?: 1 | -1;
  /** Linea del pedido que entrega (solo entregas de pedidos). */
  requestLine?: string;
}

interface MovementDef {
  type: 'ENTRY' | 'EXIT' | 'TRANSFER' | 'ADJUSTMENT';
  day: number;
  warehouse: WarehouseKey;
  target?: WarehouseKey;
  destination?: Destination;
  reference?: string;
  notes?: string;
  /** Pedido que entrega esta salida. */
  requestId?: string;
  lines: LineDef[];
}

/** Libro en memoria con la regla del motor. */
class Ledger {
  readonly movements: Prisma.stock_movementsCreateManyInput[] = [];
  readonly lines: Prisma.stock_movement_linesCreateManyInput[] = [];
  readonly balances = new Map<string, { material: string; warehouse: string; batch: string | null; qty: Decimal }>();
  readonly totals = new Map<string, Decimal>();
  readonly averages = new Map<string, Decimal>();
  readonly batches = new Map<string, { id: string; material: string; number: string; expires: Date | null }>();
  readonly units = new Map<string, { id: string; material: string; serial: string; status: 'IN_STOCK' | 'OUT' | 'DISCARDED'; warehouse: string | null; last: string }>();
  private seq = 0;
  private readonly ctx: Ctx;

  // Sin parameter properties: `node` corre este archivo en modo strip-only y no las admite.
  constructor(ctx: Ctx) {
    this.ctx = ctx;
  }

  private balance(material: string, warehouse: string, batch: string | null, delta: Decimal, label: string) {
    const key = `${material}|${warehouse}|${batch ?? ''}`;
    const row = this.balances.get(key) ?? { material, warehouse, batch, qty: dec(0) };
    row.qty = row.qty.plus(delta);
    if (row.qty.isNegative()) throw new Error(`demo almacenes: stock negativo de ${label}`);
    this.balances.set(key, row);
  }

  register(def: MovementDef): string {
    const { ctx } = this;
    this.seq += 1;
    const id = demoId('stock_movement', this.seq);
    const warehouse = demoId('warehouse', def.warehouse);
    const target = def.target ? demoId('warehouse', def.target) : null;
    let total = dec(0);

    for (const l of def.lines) {
      const material = demoId('material', l.material);
      const direction = def.type === 'ENTRY' ? 1 : def.type === 'ADJUSTMENT' ? (l.direction ?? -1) : -1;
      const average = this.averages.get(material) ?? dec(0);
      const stock = this.totals.get(material) ?? dec(0);
      const unitCost = def.type === 'ENTRY' ? dec(l.cost ?? 0) : average;

      let batchId: string | null = null;
      if (l.batch) {
        batchId = demoId('material_batch', `${l.material}:${l.batch}`);
        if (!this.batches.has(batchId)) {
          this.batches.set(batchId, {
            id: batchId,
            material,
            number: l.batch,
            expires: l.expires !== undefined ? ctx.cal.day(l.expires) : null,
          });
        }
      }

      const unitIds: string[] = [];
      if (l.serials) {
        for (const serial of l.serials) {
          const unitId = demoId('material_unit', `${l.material}:${serial}`);
          if (direction === 1) {
            this.units.set(unitId, { id: unitId, material, serial, status: 'IN_STOCK', warehouse, last: id });
          } else {
            const unit = this.units.get(unitId);
            if (!unit || unit.status !== 'IN_STOCK' || unit.warehouse !== warehouse) {
              throw new Error(`demo almacenes: unidad ${serial} no disponible`);
            }
            if (def.type === 'TRANSFER') unit.warehouse = target;
            else {
              unit.status = def.type === 'EXIT' ? 'OUT' : 'DISCARDED';
              unit.warehouse = null;
            }
            unit.last = id;
          }
          unitIds.push(unitId);
        }
      }

      const qty = dec(l.serials ? l.serials.length : (l.qty ?? 0));
      if (def.type === 'ENTRY') {
        this.averages.set(material, stock.lte(0) ? round4(unitCost) : round4(stock.times(average).plus(qty.times(unitCost)).dividedBy(stock.plus(qty))));
      }
      this.balance(material, warehouse, batchId, qty.times(direction), l.material);
      if (target) this.balance(material, target, batchId, qty, l.material);
      else this.totals.set(material, stock.plus(qty.times(direction)));

      const lineTotal = round4(qty.times(unitCost));
      total = total.plus(lineTotal);
      const base = { movement_id: id, material_id: material, direction, unit_cost: unitCost, batch_id: batchId, request_line_id: l.requestLine ?? null };
      if (unitIds.length) {
        unitIds.forEach((unitId, i) =>
          this.lines.push({ ...base, id: demoId('stock_line', `${this.seq}:${l.material}:${i}`), quantity: dec(1), total_cost: round4(unitCost), unit_id: unitId })
        );
      } else {
        this.lines.push({ ...base, id: demoId('stock_line', `${this.seq}:${l.material}`), quantity: qty, total_cost: lineTotal, unit_id: null });
      }
    }

    const d = def.destination;
    this.movements.push({
      id,
      company_id: ctx.company.id,
      number: `MOV-${String(this.seq).padStart(6, '0')}`,
      type: def.type,
      warehouse_id: warehouse,
      target_warehouse_id: target,
      occurred_on: ctx.cal.day(def.day),
      reference: def.reference ?? null,
      notes: def.notes ?? null,
      destination_type: d?.type ?? null,
      employee_id: d?.type === 'EMPLOYEE' ? d.id : null,
      vehicle_id: d?.type === 'VEHICLE' ? d.id : null,
      other_equipment_id: d?.type === 'OTHER_EQUIPMENT' ? d.id : null,
      maintenance_order_id: d?.type === 'MAINTENANCE_ORDER' ? d.id : null,
      customer_id: d?.type === 'CUSTOMER' ? d.id : null,
      customer_service_id: d?.type === 'CUSTOMER' ? d.serviceId : null,
      material_request_id: def.requestId ?? null,
      total_cost: total,
      created_by: ctx.actorId,
      // Una hora por movimiento: el kardex ordena por registro y no puede haber empates.
      created_at: ctx.cal.at(def.day, 8 + (this.seq % 10), this.seq % 60),
    });
    return id;
  }

  readonly writeOffs: Prisma.material_unit_write_offsCreateManyInput[] = [];

  /**
   * Devolucion de unidades prestadas (misma regla que `registerReturn` del motor): reingresan
   * al costo con que salieron, recalculando el promedio como una entrada, y el movimiento copia
   * el destino de la salida.
   */
  returnLoan(exitId: string, serials: string[], warehouseKey: WarehouseKey, day: number, notes: string): void {
    const exit = this.movements.find((m) => m.id === exitId)!;
    const warehouse = demoId('warehouse', warehouseKey);
    this.seq += 1;
    const id = demoId('stock_movement', this.seq);
    let total = dec(0);
    serials.forEach((serial, i) => {
      const unit = [...this.units.values()].find((u) => u.serial === serial)!;
      if (unit.status !== 'OUT' || unit.last !== exitId) throw new Error(`demo almacenes: ${serial} no esta prestada por esa salida`);
      const exitLine = this.lines.find((l) => l.movement_id === exitId && l.unit_id === unit.id)!;
      const cost = dec(exitLine.unit_cost as Decimal);
      const stock = this.totals.get(unit.material) ?? dec(0);
      const average = this.averages.get(unit.material) ?? dec(0);
      this.averages.set(unit.material, stock.lte(0) ? round4(cost) : round4(stock.times(average).plus(cost).dividedBy(stock.plus(1))));
      this.totals.set(unit.material, stock.plus(1));
      this.balance(unit.material, warehouse, null, dec(1), serial);
      unit.status = 'IN_STOCK';
      unit.warehouse = warehouse;
      unit.last = id;
      total = total.plus(round4(cost));
      this.lines.push({ id: demoId('stock_line', `${this.seq}:${i}`), movement_id: id, material_id: unit.material, quantity: dec(1), direction: 1, unit_cost: cost, total_cost: round4(cost), batch_id: null, unit_id: unit.id });
    });
    this.movements.push({
      ...exit,
      id,
      number: `MOV-${String(this.seq).padStart(6, '0')}`,
      type: 'RETURN',
      warehouse_id: warehouse,
      occurred_on: this.ctx.cal.day(day),
      reference: null,
      notes,
      returned_from_movement_id: exitId,
      total_cost: total,
      created_at: this.ctx.cal.at(day, 16, this.seq % 60),
    });
  }

  /** Baja de una unidad prestada que no vuelve: no mueve stock (misma regla que el motor). */
  writeOff(serial: string, reason: 'LOST' | 'BROKEN', notes: string, day: number): void {
    const unit = [...this.units.values()].find((u) => u.serial === serial)!;
    if (unit.status !== 'OUT') throw new Error(`demo almacenes: ${serial} no esta prestada`);
    this.writeOffs.push({
      id: demoId('material_write_off', serial),
      company_id: this.ctx.company.id,
      unit_id: unit.id,
      loan_movement_id: unit.last,
      reason,
      notes,
      created_by: this.ctx.actorId,
      created_at: this.ctx.cal.at(day, 11),
    });
    unit.status = 'DISCARDED';
  }

  /** Anulacion de una salida: reingresa al costo original y recalcula el promedio como entrada. */
  reverseExit(originalId: string, day: number, reason: string): void {
    const original = this.movements.find((m) => m.id === originalId)!;
    const originalLines = this.lines.filter((l) => l.movement_id === originalId);
    this.seq += 1;
    const id = demoId('stock_movement', this.seq);
    for (const [i, l] of originalLines.entries()) {
      const material = l.material_id;
      const qty = dec(l.quantity as Decimal);
      const cost = dec(l.unit_cost as Decimal);
      const stock = this.totals.get(material) ?? dec(0);
      const average = this.averages.get(material) ?? dec(0);
      this.averages.set(material, stock.lte(0) ? round4(cost) : round4(stock.times(average).plus(qty.times(cost)).dividedBy(stock.plus(qty))));
      this.totals.set(material, stock.plus(qty));
      this.balance(material, original.warehouse_id, l.batch_id ?? null, qty, material);
      this.lines.push({ ...l, id: demoId('stock_line', `${this.seq}:${i}`), movement_id: id, direction: 1 });
    }
    this.movements.push({
      ...original,
      id,
      number: `MOV-${String(this.seq).padStart(6, '0')}`,
      occurred_on: this.ctx.cal.day(day),
      notes: reason,
      reverses_movement_id: originalId,
      created_at: this.ctx.cal.at(day, 17, this.seq % 60),
    });
  }
}

export async function seedWarehouses(
  ctx: Ctx,
  employees: DemoEmployee[],
  vehicles: DemoVehicle[],
  others: DemoOtherEquipment[]
): Promise<void> {
  const { tx, faker, company } = ctx;

  await tx.measurement_units.createMany({
    data: UNITS.map((u) => ({ id: demoId('measurement_unit', u.key), company_id: company.id, name: u.name, abbreviation: u.key })),
  });
  await tx.material_categories.createMany({
    data: CATEGORIES.map((c) => ({ id: demoId('material_category', c), company_id: company.id, name: c })),
  });

  const pañolero = employees.find((e) => e.active && e.position === 'jefe_taller') ?? employees.find((e) => e.active);
  await tx.warehouses.createMany({
    data: WAREHOUSES.map((w) => ({
      id: demoId('warehouse', w.key),
      company_id: company.id,
      code: w.key,
      name: w.name,
      address: w.address,
      manager_employee_id: w.key === 'PANOL' ? (pañolero?.id ?? null) : null,
    })),
  });

  // Destinos reales de la demo.
  const active = employees.filter((e) => e.active);
  const crew = sample(faker, active, Math.min(6, active.length));
  const units = sample(faker, vehicles, Math.min(4, vehicles.length));
  const openOrders = await tx.maintenance_orders.findMany({
    where: { company_id: company.id, status: { notIn: ['completed', 'rejected'] } },
    select: { id: true },
    take: 3,
    orderBy: { created_at: 'asc' },
  });
  // Una orden en taller con una OT abierta: ahi van los pedidos hechos desde la OT (etapa 4).
  const workshopItem = await tx.maintenance_order_items.findFirst({
    where: {
      company_id: company.id,
      maintenance_orders: { status: 'in_workshop' },
      work_orders: { status: { notIn: ['completed', 'completed_partial', 'cancelled'] } },
    },
    select: { maintenance_order_id: true, work_order_id: true },
    orderBy: { created_at: 'asc' },
  });
  const customer = await tx.customers.findFirst({
    where: { company_id: company.id, is_active: true },
    select: { id: true, customer_services: { select: { id: true }, take: 1 } },
  });

  const ledger = new Ledger(ctx);
  const emp = (i: number): Destination | undefined => (crew[i % crew.length] ? { type: 'EMPLOYEE', id: crew[i % crew.length]!.id } : undefined);
  const veh = (i: number): Destination | undefined => (units[i % units.length] ? { type: 'VEHICLE', id: units[i % units.length]!.id } : undefined);
  const exit = (day: number, warehouse: WarehouseKey, destination: Destination | undefined, lines: LineDef[], notes?: string) =>
    destination ? ledger.register({ type: 'EXIT', day, warehouse, destination, lines, notes }) : null;

  // ── Compras iniciales ──
  ledger.register({ type: 'ENTRY', day: -70, warehouse: 'BASE', reference: 'Remito 0003-00012874', lines: [
    { material: 'ACE-15W40', qty: 1000, cost: 4850 },
    { material: 'ACE-HID68', qty: 400, cost: 5200 },
    { material: 'FIL-ACE', qty: 40, cost: 18500 },
    { material: 'FIL-AIRE', qty: 24, cost: 42300 },
  ] });
  ledger.register({ type: 'ENTRY', day: -68, warehouse: 'BASE', reference: 'Remito 0001-00004521', lines: [
    { material: 'CON-CIN', qty: 200, cost: 2900 },
    { material: 'CON-PAN', qty: 80, cost: 1800 },
    { material: 'GRA-LIT', qty: 60, cost: 9800, batch: 'L2407-118', expires: 300 },
    { material: 'QUI-DES', qty: 100, cost: 3100, batch: 'D-5531', expires: 25 },
  ] });
  ledger.register({ type: 'ENTRY', day: -66, warehouse: 'BASE', reference: 'Factura A 0002-00087766', lines: [
    { material: 'HER-TAL', cost: 245000, serials: ['TP-23A1187', 'TP-23A1190', 'TP-23A1203'] },
    { material: 'HER-AMO', cost: 168000, serials: ['AM-90551', 'AM-90557', 'AM-90562', 'AM-90570'] },
    { material: 'HER-DET', cost: 1890000, serials: ['MX4-0018833', 'MX4-0018840'] },
  ] });

  // Un lote que ya venció con saldo: el aviso de Stock y el mail lo muestran, y no puede salir.
  ledger.register({ type: 'ENTRY', day: -90, warehouse: 'BASE', reference: 'Remito 0001-00003990', lines: [
    { material: 'QUI-DES', qty: 12, cost: 2950, batch: 'D-4410', expires: -10 },
  ] });

  // ── Abastecimiento del pañol y del obrador ──
  ledger.register({ type: 'TRANSFER', day: -62, warehouse: 'BASE', target: 'PANOL', notes: 'Reposición del pañol', lines: [
    { material: 'ACE-15W40', qty: 300 },
    { material: 'FIL-ACE', qty: 15 },
    { material: 'GRA-LIT', qty: 20, batch: 'L2407-118' },
    { material: 'HER-TAL', serials: ['TP-23A1187', 'TP-23A1190'] },
    { material: 'HER-AMO', serials: ['AM-90551', 'AM-90557'] },
  ] });
  ledger.register({ type: 'TRANSFER', day: -60, warehouse: 'BASE', target: 'ANELO', notes: 'Envío al obrador', lines: [
    { material: 'CON-CIN', qty: 80 },
    { material: 'CON-PAN', qty: 30 },
    { material: 'QUI-DES', qty: 40, batch: 'D-5531' },
    { material: 'HER-DET', serials: ['MX4-0018833'] },
  ] });

  // ── Segunda compra a otro precio: mueve el promedio ──
  ledger.register({ type: 'ENTRY', day: -40, warehouse: 'BASE', reference: 'Remito 0003-00013502', lines: [
    { material: 'ACE-15W40', qty: 600, cost: 5320 },
    { material: 'FIL-ACE', qty: 20, cost: 19900 },
    { material: 'GRA-LIT', qty: 40, cost: 10450, batch: 'L2409-033', expires: 420 },
  ] });

  // ── Consumos ──
  let i = 0;
  for (const day of [-58, -51, -44, -37, -30, -23, -16, -9]) {
    exit(day, 'PANOL', veh(i), [{ material: 'ACE-15W40', qty: 32 }, { material: 'FIL-ACE', qty: 1 }], 'Service de motor');
    exit(day + 1, 'ANELO', emp(i), [{ material: 'CON-CIN', qty: 2 }, { material: 'CON-PAN', qty: 1 }]);
    i += 1;
  }
  exit(-45, 'BASE', veh(1), [{ material: 'ACE-HID68', qty: 120 }, { material: 'FIL-AIRE', qty: 2 }], 'Cambio de aceite hidráulico');
  if (openOrders[0]) exit(-12, 'PANOL', { type: 'MAINTENANCE_ORDER', id: openOrders[0].id }, [{ material: 'GRA-LIT', qty: 4, batch: 'L2407-118' }, { material: 'FIL-ACE', qty: 2 }]);
  if (openOrders[1]) exit(-6, 'BASE', { type: 'MAINTENANCE_ORDER', id: openOrders[1].id }, [{ material: 'FIL-AIRE', qty: 1 }, { material: 'ACE-HID68', qty: 40 }]);
  const drillLoan = exit(-20, 'PANOL', emp(2), [{ material: 'HER-TAL', serials: ['TP-23A1187'] }], 'Asignación de herramienta');
  if (drillLoan) ledger.returnLoan(drillLoan, ['TP-23A1187'], 'PANOL', -5, 'Vuelve en buen estado');
  const grinderLoan = exit(-15, 'PANOL', emp(4), [{ material: 'HER-AMO', serials: ['AM-90551'] }], 'Asignación de herramienta');
  if (grinderLoan) ledger.writeOff('AM-90551', 'LOST', 'Extraviada en la locación del pozo 12', -6);
  exit(-18, 'ANELO', emp(3), [{ material: 'HER-DET', serials: ['MX4-0018833'] }], 'Detector para trabajos en locación');
  if (others[0]) exit(-14, 'ANELO', { type: 'OTHER_EQUIPMENT', id: others[0].id }, [{ material: 'QUI-DES', qty: 15, batch: 'D-5531' }]);
  if (customer) {
    exit(-8, 'ANELO', { type: 'CUSTOMER', id: customer.id, serviceId: customer.customer_services[0]?.id ?? null }, [{ material: 'QUI-DES', qty: 10, batch: 'D-5531' }], 'Limpieza de locación a pedido del cliente');
  }

  // ── Una salida cargada al vehículo equivocado, anulada ──
  const mistaken = exit(-4, 'BASE', veh(3), [{ material: 'ACE-HID68', qty: 60 }]);
  if (mistaken) ledger.reverseExit(mistaken, -3, 'Se imputó al equipo equivocado');

  // ── Ajuste por conteo físico ──
  ledger.register({ type: 'ADJUSTMENT', day: -2, warehouse: 'PANOL', notes: 'Conteo físico mensual: 2 filtros dañados por humedad', lines: [
    { material: 'FIL-ACE', qty: 2, direction: -1 },
  ] });

  // ── Pedidos de materiales (etapa 3): uno por estado ──
  // Las entregas son salidas del libro con el destino del pedido y el vinculo a cada linea; el
  // estado sale de lo entregado, con la misma regla que `statusAfterDeliveries`.
  const requests: Prisma.material_requestsCreateManyInput[] = [];
  const requestLines: Prisma.material_request_linesCreateManyInput[] = [];
  const request = (
    n: number,
    day: number,
    destination: Destination | undefined,
    lines: { material: MaterialKey; qty: number }[],
    decision: { status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'; notes?: string },
    notes?: string,
    workOrderId: string | null = null
  ) => {
    if (!destination) return null;
    const id = demoId('material_request', n);
    const lineIds = lines.map((l, j) => {
      const lineId = demoId('material_request_line', `${n}:${j}`);
      requestLines.push({ id: lineId, request_id: id, material_id: demoId('material', l.material), quantity: l.qty });
      return lineId;
    });
    requests.push({
      id,
      company_id: company.id,
      number: `PED-${String(n).padStart(6, '0')}`,
      status: decision.status,
      requested_by: ctx.actorId,
      destination_type: destination.type,
      employee_id: destination.type === 'EMPLOYEE' ? destination.id : null,
      vehicle_id: destination.type === 'VEHICLE' ? destination.id : null,
      other_equipment_id: destination.type === 'OTHER_EQUIPMENT' ? destination.id : null,
      maintenance_order_id: destination.type === 'MAINTENANCE_ORDER' ? destination.id : null,
      customer_id: destination.type === 'CUSTOMER' ? destination.id : null,
      customer_service_id: destination.type === 'CUSTOMER' ? destination.serviceId : null,
      work_order_id: workOrderId,
      notes: notes ?? null,
      decided_by: decision.status === 'PENDING_APPROVAL' ? null : ctx.actorId,
      decided_at: decision.status === 'PENDING_APPROVAL' ? null : ctx.cal.at(day + 1, 9),
      decision_notes: decision.notes ?? null,
      created_at: ctx.cal.at(day, 8),
    });
    return { id, number: `PED-${String(n).padStart(6, '0')}`, destination, lineIds, lines };
  };
  const deliver = (
    req: NonNullable<ReturnType<typeof request>>,
    day: number,
    warehouse: WarehouseKey,
    quantities: (number | { qty?: number; batch?: string; serials?: string[] })[]
  ) =>
    ledger.register({
      type: 'EXIT',
      day,
      warehouse,
      destination: req.destination,
      reference: req.number,
      requestId: req.id,
      lines: quantities.flatMap((q, j) => {
        const spec = typeof q === 'number' ? { qty: q } : q;
        if (!spec.serials && !spec.qty) return [];
        return [{ material: req.lines[j]!.material, ...spec, requestLine: req.lineIds[j] }];
      }),
    });
  const setStatus = (req: ReturnType<typeof request>, data: Partial<Prisma.material_requestsCreateManyInput>) => {
    if (req) Object.assign(requests.find((r) => r.id === req.id)!, data);
  };

  const delivered = request(1, -27, emp(0), [{ material: 'CON-CIN', qty: 4 }, { material: 'CON-PAN', qty: 2 }], { status: 'APPROVED' }, 'Kit de consumibles para el equipo nuevo');
  if (delivered) {
    deliver(delivered, -25, 'ANELO', [4, 2]);
    setStatus(delivered, { status: 'DELIVERED' });
  }
  const partial = request(2, -12, veh(0), [{ material: 'ACE-15W40', qty: 100 }, { material: 'FIL-ACE', qty: 4 }], { status: 'APPROVED' }, 'Service de 250 horas');
  if (partial) {
    deliver(partial, -10, 'BASE', [60, 4]);
    setStatus(partial, { status: 'PARTIALLY_DELIVERED' });
  }
  request(3, -3, emp(1), [{ material: 'GRA-LIT', qty: 5 }], { status: 'APPROVED' }, 'Engrase de crucetas');
  request(4, -1, emp(3), [{ material: 'HER-DET', qty: 1 }], { status: 'PENDING_APPROVAL' }, 'Trabajo en espacio confinado la semana próxima');
  request(5, -8, veh(2), [{ material: 'ACE-HID68', qty: 200 }], { status: 'REJECTED', notes: 'El cambio de aceite hidráulico se hizo hace un mes' });
  const closed = request(6, -33, emp(5), [{ material: 'CON-CIN', qty: 10 }], { status: 'APPROVED' });
  if (closed) {
    deliver(closed, -30, 'ANELO', [6]);
    setStatus(closed, { status: 'CLOSED', closed_by: ctx.actorId, closed_at: ctx.cal.at(-20, 10), close_notes: 'El resto se compró en Añelo' });
  }

  // Pedidos desde la OT de una orden en taller: uno entregado y otro esperando aprobacion.
  if (workshopItem?.work_order_id) {
    const order: Destination = { type: 'MAINTENANCE_ORDER', id: workshopItem.maintenance_order_id };
    const fromWorkOrder = request(7, -2, order, [{ material: 'ACE-HID68', qty: 20 }, { material: 'FIL-AIRE', qty: 1 }], { status: 'APPROVED' }, 'Cambio de aceite hidráulico', workshopItem.work_order_id);
    if (fromWorkOrder) {
      deliver(fromWorkOrder, -1, 'BASE', [20, 1]);
      setStatus(fromWorkOrder, { status: 'DELIVERED' });
    }
    request(8, 0, order, [{ material: 'GRA-LIT', qty: 2 }], { status: 'PENDING_APPROVAL' }, 'Engrase de crucetas al terminar', workshopItem.work_order_id);
  }

  // ── Escritura ──
  await tx.materials.createMany({
    data: MATERIALS.map((m) => {
      const id = demoId('material', m.key);
      return {
        id,
        company_id: company.id,
        code: m.key,
        name: m.name,
        category_id: demoId('material_category', m.category),
        unit_id: demoId('measurement_unit', m.unit),
        tracking_type: m.tracking,
        min_stock: m.min,
        requires_approval: 'requiresApproval' in m ? m.requiresApproval : false,
        average_cost: ledger.averages.get(id) ?? 0,
      };
    }),
  });
  await tx.material_batches.createMany({
    data: [...ledger.batches.values()].map((b) => ({ id: b.id, company_id: company.id, material_id: b.material, batch_number: b.number, expires_at: b.expires })),
  });
  await tx.material_requests.createMany({ data: requests });
  await tx.material_request_lines.createMany({ data: requestLines });
  await tx.warehouse_settings.create({ data: { company_id: company.id, direct_exit_max_amount: 500000, updated_by: ctx.actorId } });
  await tx.stock_movements.createMany({ data: ledger.movements });
  await tx.material_units.createMany({
    data: [...ledger.units.values()].map((u) => ({
      id: u.id,
      company_id: company.id,
      material_id: u.material,
      serial_number: u.serial,
      status: u.status,
      warehouse_id: u.warehouse,
      last_movement_id: u.last,
    })),
  });
  await tx.stock_movement_lines.createMany({ data: ledger.lines });
  if (ledger.writeOffs.length) await tx.material_unit_write_offs.createMany({ data: ledger.writeOffs });
  await tx.stock_balances.createMany({
    data: [...ledger.balances.values()].map((b) => ({
      company_id: company.id,
      material_id: b.material,
      warehouse_id: b.warehouse,
      batch_id: b.batch,
      quantity: b.qty,
    })),
  });

  // Saldo = suma de movimientos (incluidas las transferencias, que suman en el destino).
  const mismatches = await tx.$queryRaw<{ n: bigint }[]>`
    WITH ledger AS (
      SELECT l.material_id, m.warehouse_id, l.batch_id, SUM(l.direction * l.quantity) AS qty
      FROM stock_movement_lines l JOIN stock_movements m ON m.id = l.movement_id
      WHERE m.company_id = ${company.id}::uuid GROUP BY 1, 2, 3
      UNION ALL
      SELECT l.material_id, m.target_warehouse_id, l.batch_id, SUM(-l.direction * l.quantity)
      FROM stock_movement_lines l JOIN stock_movements m ON m.id = l.movement_id
      WHERE m.company_id = ${company.id}::uuid AND m.target_warehouse_id IS NOT NULL GROUP BY 1, 2, 3
    ), expected AS (SELECT material_id, warehouse_id, batch_id, SUM(qty) AS qty FROM ledger GROUP BY 1, 2, 3)
    SELECT count(*) AS n FROM stock_balances b
    LEFT JOIN expected e ON e.material_id = b.material_id AND e.warehouse_id = b.warehouse_id
      AND e.batch_id IS NOT DISTINCT FROM b.batch_id
    WHERE b.company_id = ${company.id}::uuid AND b.quantity <> COALESCE(e.qty, 0)
  `;
  if (Number(mismatches[0]?.n ?? 0) > 0) throw new Error('demo almacenes: los saldos no coinciden con los movimientos');

  ctx.log(
    `almacenes: ${ledger.movements.length} movimientos, ${requests.length} pedidos, ${MATERIALS.length} materiales, ${WAREHOUSES.length} depósitos`
  );
}
