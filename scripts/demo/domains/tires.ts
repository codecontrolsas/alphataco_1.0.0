/**
 * Neumaticos: marcas, medidas, plantillas de ejes por subtipo (tractor 6x4 y camioneta 4x4),
 * cubiertas montadas en esas unidades, stock disponible, descartes y ordenes de gomeria.
 *
 * Almacenes etapa 6: cada combinacion tipo + marca es un material SERIAL (misma regla de codigo
 * que el sistema) y las cubiertas son sus unidades. Una compra al deposito base trae las montadas
 * y las disponibles; las montadas salen a su equipo. Las que estan en reparacion quedan SIN stock,
 * para que la seccion "Inventario inicial de cubiertas" de Almacenes tenga que mostrar.
 */
import { Prisma } from '../../../src/generated/prisma/client.ts';
import { tireMaterialCode, tireMaterialName } from '../../../src/features/Warehouses/lib/tire-material-code.ts';
import type { Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import { pick, weighted } from '../lib/random.ts';
import type { DemoVehicle } from './vehicles.ts';

const BRANDS = ['Bridgestone', 'Firestone', 'Pirelli', 'Fate'];
const TYPES = [
  { key: 'pesado_traccion', name: 'Pesado tracción', size: '295/80R22.5', tread: 'BLOCK' as const },
  { key: 'pesado_direccional', name: 'Pesado direccional', size: '295/80R22.5', tread: 'SMOOTH' as const },
  { key: 'camioneta', name: 'Camioneta AT', size: '265/65R17', tread: 'MIXED' as const },
];
const TEMPLATES = [
  {
    key: 'tractor_6x4',
    subType: 'tractor_6x4',
    name: 'Tractor 6x4',
    axles: [
      { n: 1, perSide: 1, size: '295/80R22.5', drive: false, type: 'pesado_direccional' },
      { n: 2, perSide: 2, size: '295/80R22.5', drive: true, type: 'pesado_traccion' },
      { n: 3, perSide: 2, size: '295/80R22.5', drive: true, type: 'pesado_traccion' },
    ],
    vehicleType: 'tractor',
  },
  {
    key: 'camioneta_4x4',
    subType: 'camioneta_4x4',
    name: 'Camioneta 4x4',
    axles: [
      { n: 1, perSide: 1, size: '265/65R17', drive: true, type: 'camioneta' },
      { n: 2, perSide: 1, size: '265/65R17', drive: true, type: 'camioneta' },
    ],
    vehicleType: 'camioneta',
  },
];

export async function seedTires(ctx: Ctx, vehicles: DemoVehicle[]): Promise<void> {
  const { tx, cal, faker, company, actorId } = ctx;
  await tx.tire_brands.createMany({ data: BRANDS.map((b) => ({ id: demoId('tire_brand', b), name: b, company_id: company.id })) });
  await tx.tire_types.createMany({
    data: TYPES.map((t) => ({ id: demoId('tire_type', t.key), name: t.name, size: t.size, tread_type: t.tread, company_id: company.id, updated_at: cal.at(-300) })),
  });
  for (const t of TEMPLATES) {
    await tx.tire_templates.create({ data: { id: demoId('tire_template', t.key), name: t.name, company_id: company.id } });
    await tx.tire_template_axles.createMany({
      data: t.axles.map((a) => ({ id: demoId('tire_axle', `${t.key}:${a.n}`), template_id: demoId('tire_template', t.key), axle_number: a.n, tires_per_side: a.perSide, tire_size: a.size, is_drive_axle: a.drive })),
    });
    await tx.sub_type.update({ where: { id: demoId('sub_type', t.subType) }, data: { tire_template_id: demoId('tire_template', t.key) } });
  }

  const tires: Prisma.tiresCreateManyInput[] = [];
  const positions: Prisma.vehicle_tire_positionsCreateManyInput[] = [];
  let serial = 0;
  const newTire = (type: string, status: 'AVAILABLE' | 'INSTALLED' | 'DISCARDED' | 'IN_REPAIR') => {
    serial++;
    const id = demoId('tire', serial);
    const isNew = faker.datatype.boolean({ probability: 0.7 });
    tires.push({
      id,
      serial_number: `NEU-${String(serial).padStart(5, '0')}`,
      brand_id: demoId('tire_brand', pick(faker, BRANDS)),
      tire_type_id: demoId('tire_type', type),
      is_new: isNew,
      retread_level: isNew ? null : 'FIRST',
      tread_depth: faker.number.float({ min: 4, max: 16, fractionDigits: 1 }),
      status,
      discarded_at: status === 'DISCARDED' ? cal.at(-faker.number.int({ min: 5, max: 200 })) : null,
      discard_comment: status === 'DISCARDED' ? 'Corte lateral irreparable' : null,
      company_id: company.id,
      created_at: cal.at(-400),
      updated_at: cal.at(-10),
    });
    return id;
  };

  // Montadas: las unidades cuyo subtipo tiene plantilla.
  const subTypeOf = new Map<string, string>();
  const rows = await tx.vehicles.findMany({ where: { company_id: company.id, is_active: true }, select: { id: true, subType: true } });
  for (const r of rows) if (r.subType) subTypeOf.set(r.id, r.subType);
  const mounted: Array<{ vehicle: DemoVehicle; tireIds: string[] }> = [];
  for (const v of vehicles.filter((x) => x.active)) {
    const template = TEMPLATES.find((t) => subTypeOf.get(v.id) === demoId('sub_type', t.subType));
    if (!template) continue;
    let position = 0;
    const tireIds: string[] = [];
    for (const axle of template.axles) {
      for (const side of ['LEFT', 'RIGHT'] as const) {
        for (let k = 0; k < axle.perSide; k++) {
          position++;
          const tireId = newTire(axle.type, 'INSTALLED');
          tireIds.push(tireId);
          positions.push({
            vehicle_id: v.id,
            template_axle_id: demoId('tire_axle', `${template.key}:${axle.n}`),
            position_number: position,
            axle_number: axle.n,
            side,
            tire_id: tireId,
            updated_at: cal.at(-30),
          });
        }
      }
    }
    mounted.push({ vehicle: v, tireIds });
  }
  // Stock y descartes.
  for (let i = 0; i < 24; i++) newTire(pick(faker, TYPES).key, weighted(faker, [['AVAILABLE', 70], ['DISCARDED', 20], ['IN_REPAIR', 10]] as const));

  await seedTireStock(ctx, tires, mounted);
  await tx.tires.createMany({ data: tires });
  await tx.vehicle_tire_positions.createMany({ data: positions });
  await tx.vehicle_axle_tire_sizes.createMany({
    data: mounted.flatMap(({ vehicle }) => {
      const template = TEMPLATES.find((t) => subTypeOf.get(vehicle.id) === demoId('sub_type', t.subType))!;
      return template.axles.map((a) => ({ vehicle_id: vehicle.id, axle_number: a.n, tire_size: a.size, updated_at: cal.at(-30) }));
    }),
  });

  // Ordenes de gomeria de los ultimos tres meses.
  let orders = 0;
  for (const { vehicle } of mounted.slice(0, 18)) {
    orders++;
    const offset = -faker.number.int({ min: 1, max: 90 });
    const open = offset > -3;
    const id = demoId('tire_order', vehicle.id);
    await tx.tire_service_orders.create({
      data: {
        id,
        vehicle_id: vehicle.id,
        kilometer: String(vehicle.kilometer + offset * 250),
        service_date: cal.at(offset, 10),
        status: open ? 'OPEN' : 'CLOSED',
        created_by: actorId,
        company_id: company.id,
        closed_at: open ? null : cal.at(offset, 15),
        created_at: cal.at(offset, 10),
      },
    });
    await tx.tire_service_items.createMany({
      data: [1, 2].map((position) => ({
        service_order_id: id,
        position_number: position,
        vehicle_id: vehicle.id,
        action: weighted(faker, [['CALIBRATE', 70], ['REPAIR', 20], ['REPLACE', 10]] as const),
        tread_depth: faker.number.float({ min: 5, max: 14, fractionDigits: 1 }),
        pressure_start: faker.number.float({ min: 90, max: 110, fractionDigits: 1 }),
        pressure_end: 110,
        observations: 'Control de presión y desgaste',
        created_at: cal.at(offset, 11),
      })),
    });
  }
  ctx.log(`neumáticos: ${tires.length} cubiertas, ${mounted.length} unidades con plantilla, ${orders} órdenes de gomería`);
}

/** Costo de compra por medida (ARS). */
const TIRE_COSTS: Record<string, number> = { pesado_traccion: 520000, pesado_direccional: 495000, camioneta: 185000 };

/**
 * Stock de las cubiertas: materiales, una compra al deposito base y una salida por equipo con
 * las montadas. Completa `material_unit_id` en las cubiertas (se escriben despues). Como estos
 * materiales solo tienen esta compra y estas salidas, el costo promedio es el de la compra.
 */
async function seedTireStock(
  ctx: Ctx,
  tires: Prisma.tiresCreateManyInput[],
  mounted: Array<{ vehicle: DemoVehicle; tireIds: string[] }>
): Promise<void> {
  const { tx, cal, company, actorId } = ctx;
  const dec = (v: number | string) => new Prisma.Decimal(v);
  const warehouseId = demoId('warehouse', 'BASE');
  const categoryId = demoId('material_category', 'Cubiertas');
  await tx.material_categories.create({ data: { id: categoryId, company_id: company.id, name: 'Cubiertas' } });

  // Un material por tipo x marca.
  const taken = new Set((await tx.materials.findMany({ where: { company_id: company.id }, select: { code: true } })).map((m) => m.code));
  const materialOf = new Map<string, string>();
  const costOf = new Map<string, number>();
  const materials: Prisma.materialsCreateManyInput[] = [];
  const links: Prisma.tire_materialsCreateManyInput[] = [];
  for (const type of TYPES) {
    for (const brand of BRANDS) {
      const combination = { size: type.size, treadType: type.tread, brandName: brand };
      const code = tireMaterialCode(combination, taken);
      taken.add(code);
      const id = demoId('material', `cubierta:${type.key}:${brand}`);
      materials.push({
        id,
        company_id: company.id,
        code,
        name: tireMaterialName(combination),
        category_id: categoryId,
        unit_id: demoId('measurement_unit', 'u'),
        tracking_type: 'SERIAL',
        average_cost: TIRE_COSTS[type.key]!,
      });
      links.push({
        company_id: company.id,
        tire_type_id: demoId('tire_type', type.key),
        tire_brand_id: demoId('tire_brand', brand),
        material_id: id,
      });
      materialOf.set(`${demoId('tire_type', type.key)}|${demoId('tire_brand', brand)}`, id);
      costOf.set(id, TIRE_COSTS[type.key]!);
    }
  }
  await tx.materials.createMany({ data: materials });
  await tx.tire_materials.createMany({ data: links });

  // Entran las montadas y las disponibles; las en reparacion y las descartadas quedan sin stock.
  const stocked = tires.filter((t) => t.status === 'INSTALLED' || t.status === 'AVAILABLE');
  const lastNumber = await tx.stock_movements.findMany({
    where: { company_id: company.id },
    select: { number: true },
    orderBy: { number: 'desc' },
    take: 1,
  });
  let seq = Number(lastNumber[0]?.number.replace(/\D/g, '') ?? 0);
  const nextNumber = () => `MOV-${String(++seq).padStart(6, '0')}`;
  const movements: Prisma.stock_movementsCreateManyInput[] = [];
  const lines: Prisma.stock_movement_linesCreateManyInput[] = [];
  const units: Prisma.material_unitsCreateManyInput[] = [];

  const purchaseId = demoId('stock_movement', 'cubiertas:compra');
  let purchaseTotal = dec(0);
  for (const tire of stocked) {
    const materialId = materialOf.get(`${tire.tire_type_id}|${tire.brand_id}`)!;
    const cost = costOf.get(materialId)!;
    const unitId = demoId('material_unit', `cubierta:${tire.id}`);
    tire.material_unit_id = unitId;
    units.push({
      id: unitId,
      company_id: company.id,
      material_id: materialId,
      serial_number: tire.serial_number,
      status: tire.status === 'INSTALLED' ? 'OUT' : 'IN_STOCK',
      warehouse_id: tire.status === 'INSTALLED' ? null : warehouseId,
      last_movement_id: purchaseId,
    });
    lines.push({ movement_id: purchaseId, material_id: materialId, quantity: 1, direction: 1, unit_cost: cost, total_cost: cost, unit_id: unitId });
    purchaseTotal = purchaseTotal.plus(cost);
  }
  movements.push({
    id: purchaseId,
    company_id: company.id,
    number: nextNumber(),
    type: 'ENTRY',
    warehouse_id: warehouseId,
    occurred_on: cal.day(-400),
    reference: 'Factura A 0007-00002214 · Neumáticos Patagonia',
    notes: 'Alta de cubiertas',
    total_cost: purchaseTotal,
    created_by: actorId,
    created_at: cal.at(-400, 9),
  });

  // Una salida por equipo con sus cubiertas montadas.
  const unitOf = new Map(tires.map((t) => [t.id!, t]));
  for (const { vehicle, tireIds } of mounted) {
    const exitId = demoId('stock_movement', `cubiertas:montaje:${vehicle.id}`);
    let total = dec(0);
    for (const tireId of tireIds) {
      const tire = unitOf.get(tireId)!;
      const materialId = materialOf.get(`${tire.tire_type_id}|${tire.brand_id}`)!;
      const cost = costOf.get(materialId)!;
      lines.push({ movement_id: exitId, material_id: materialId, quantity: 1, direction: -1, unit_cost: cost, total_cost: cost, unit_id: tire.material_unit_id! });
      total = total.plus(cost);
      units.find((u) => u.id === tire.material_unit_id)!.last_movement_id = exitId;
    }
    movements.push({
      id: exitId,
      company_id: company.id,
      number: nextNumber(),
      type: 'EXIT',
      warehouse_id: warehouseId,
      occurred_on: cal.day(-390),
      reference: `Gomería ${vehicle.domain ?? 'equipo'}, montaje inicial`,
      destination_type: 'VEHICLE',
      vehicle_id: vehicle.id,
      total_cost: total,
      created_by: actorId,
      created_at: cal.at(-390, 10),
    });
  }

  await tx.stock_movements.createMany({ data: movements });
  await tx.material_units.createMany({ data: units });
  await tx.stock_movement_lines.createMany({ data: lines });

  // Saldo del deposito base: las disponibles, por material.
  const balances = new Map<string, number>();
  for (const unit of units) if (unit.status === 'IN_STOCK') balances.set(unit.material_id, (balances.get(unit.material_id) ?? 0) + 1);
  await tx.stock_balances.createMany({
    data: [...balances].map(([materialId, quantity]) => ({ company_id: company.id, material_id: materialId, warehouse_id: warehouseId, quantity })),
  });
  ctx.log(`cubiertas en stock: ${units.length} unidades, ${movements.length} movimientos, ${materials.length} materiales`);
}
