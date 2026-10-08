/**
 * RRHH: candidatos de Seleccion (pre legajos) en todos sus estados con su documentacion,
 * indumentaria (catalogo y entregas) y los KPIs de la empresa.
 */
import { Prisma } from '../../../src/generated/prisma/client.ts';
import { clothingMaterialCode, clothingMaterialName } from '../../../src/features/Warehouses/lib/clothing-material-code.ts';
import { addPdf, type Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import { makePerson } from '../lib/people.ts';
import { toDmy } from '../lib/dates.ts';
import { pick, sample, weighted } from '../lib/random.ts';
import { DOC_TYPES, POSITIONS } from '../data/catalog.ts';
import type { DemoEmployee } from './employees.ts';
import { DOCUMENT_BUCKET, companyFolder, pathSegment } from '../lib/paths.ts';
import { NEUQUEN_CITY, NEUQUEN_PROVINCE } from './catalogs.ts';

export async function seedCandidates(ctx: Ctx, employees: DemoEmployee[]): Promise<void> {
  const { tx, cal, faker, company, actorId } = ctx;
  const usedDni = new Set(employees.map((e) => e.dni));
  const preFileTypes = DOC_TYPES.filter((d) => d.preFile);
  // Los convertidos en legajo son los ingresos mas recientes.
  const converted = employees.filter((e) => e.active && e.admission > -150).slice(0, 5);
  const plan: Array<{ status: 'en_proceso' | 'pre_ingreso' | 'rechazado' | 'legajo'; employee?: DemoEmployee }> = [
    ...Array.from({ length: 10 }, () => ({ status: 'en_proceso' as const })),
    ...Array.from({ length: 6 }, () => ({ status: 'pre_ingreso' as const })),
    ...Array.from({ length: 4 }, () => ({ status: 'rechazado' as const })),
    ...converted.map((employee) => ({ status: 'legajo' as const, employee })),
  ];
  const docs: Prisma.documents_pre_employeesCreateManyInput[] = [];

  const positions = POSITIONS.filter((x) => ['chofer', 'operador', 'ayudante', 'mecanico', 'administrativo'].includes(x.key));
  for (const [i, p] of plan.entries()) {
    // Un candidato convertido en legajo tiene los mismos datos que el empleado en que se convirtio.
    const person = p.employee
      ? {
          ...p.employee,
          streetNumber: p.employee.streetNumber,
          email: p.employee.email,
          position: POSITIONS.find((x) => x.key === p.employee!.position)!,
        }
      : (() => {
          const fresh = makePerson(faker, usedDni, { today: cal.today, age: [20, 45] });
          return {
            ...fresh,
            city: NEUQUEN_CITY,
            email: `${pathSegment(fresh.firstname)}.${pathSegment(fresh.lastname)}@gmail.com`,
            position: pick(faker, positions),
          };
        })();
    const created = p.employee ? p.employee.admission - faker.number.int({ min: 10, max: 30 }) : -faker.number.int({ min: 1, max: 90 });
    const reviewed = Math.min(created + 7, 0);
    const id = demoId('pre_employee', i);
    const preFile = `PL-${String(i + 1).padStart(4, '0')}`;
    await tx.pre_employees.create({
      data: {
        id,
        company_id: company.id,
        pre_file_number: preFile,
        status: p.status,
        firstname: person.firstname,
        lastname: person.lastname,
        cuil: person.cuil,
        document_type: 'DNI',
        document_number: person.dni,
        born_date: person.bornDate,
        nationality: 'Argentina',
        birthplace: demoId('country', 'Argentina'),
        gender: person.gender,
        level_of_education: weighted(faker, [['Secundario', 70], ['Terciario', 20], ['Universitario', 10]] as const),
        street: person.street,
        street_number: person.streetNumber,
        province: BigInt(NEUQUEN_PROVINCE),
        city: BigInt(person.city),
        phone: person.phone,
        email: person.email,
        proposed_hierarchical_position: demoId('hierarchy', person.position.hierarchy[0]),
        proposed_company_position: demoId('position', person.position.key),
        rejection_reason: p.status === 'rechazado' ? pick(faker, ['No aprobó el examen preocupacional', 'Desistió del proceso', 'Sin licencia profesional vigente']) : null,
        reviewed_by: p.status === 'en_proceso' ? null : actorId,
        reviewed_at: p.status === 'en_proceso' ? null : cal.at(reviewed, 12),
        created_by: actorId,
        employee_id: p.employee?.id ?? null,
        created_at: cal.at(created, 10),
        updated_at: cal.at(p.status === 'en_proceso' ? created : reviewed, 12),
      },
    });
    const count = p.status === 'en_proceso' ? faker.number.int({ min: 0, max: 2 }) : preFileTypes.length;
    for (const type of preFileTypes.slice(0, count)) {
      const key = `${companyFolder()}/candidatos/${preFile}-${pathSegment(`${person.lastname} ${person.firstname}`)}/${pathSegment(type.name)}.pdf`;
      const expiry = type.expires ? created + (type.validityDays ?? 365) : null;
      const uploaded = Math.min(created + 1, 0);
      docs.push({
        pre_employee_id: id,
        document_type_id: demoId('doc_type', type.key),
        document_path: key,
        validity: expiry === null ? null : cal.at(expiry, 23, 59),
        uploaded_at: cal.at(uploaded, 11),
        user_id: actorId,
        company_id: company.id,
        created_at: cal.at(uploaded, 11),
      });
      await addPdf(ctx, DOCUMENT_BUCKET, key, {
        title: type.name,
        fields: [
          ['Candidato', `${person.lastname}, ${person.firstname}`],
          ['CUIL', person.cuil],
          ['Pre legajo', preFile],
          ['Fecha de emisión', toDmy(cal.ymd(created))],
          ['Vencimiento', expiry === null ? 'Sin vencimiento' : toDmy(cal.ymd(expiry))],
        ],
        body: `${type.description}. Documento presentado durante el proceso de selección.`,
        reference: `${preFile}/${type.key}`,
      });
    }
  }
  await tx.documents_pre_employees.createMany({ data: docs });
  ctx.log(`${plan.length} candidatos de selección con ${docs.length} documentos`);
}

const CLOTHING_ITEMS = [
  { key: 'camisa', name: 'Camisa ignífuga', code: 'IND-001', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { key: 'pantalon', name: 'Pantalón ignífugo', code: 'IND-002', sizes: ['38', '40', '42', '44', '46', '48'] },
  { key: 'mameluco', name: 'Mameluco', code: 'IND-003', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { key: 'campera', name: 'Campera de abrigo', code: 'IND-004', sizes: ['M', 'L', 'XL', 'XXL'] },
  { key: 'botines', name: 'Botines de seguridad', code: 'EPP-001', sizes: ['39', '40', '41', '42', '43', '44', '45'] },
  { key: 'casco', name: 'Casco de seguridad', code: 'EPP-002', sizes: ['Único'] },
  { key: 'guantes', name: 'Guantes de vaqueta', code: 'EPP-003', sizes: ['Único'] },
  { key: 'anteojos', name: 'Anteojos de seguridad', code: 'EPP-004', sizes: ['Único'] },
];
const CLOTHING_BRANDS = ['Ombú', 'Pampero', 'Funcional', 'Libus', '3M'];

/** Costo de compra por prenda (Almacenes etapa 5): la ropa entra al deposito base con este costo. */
const CLOTHING_COSTS: Record<string, number> = {
  camisa: 38000,
  pantalon: 42000,
  mameluco: 65000,
  campera: 85000,
  botines: 98000,
  casco: 18500,
  guantes: 6900,
  anteojos: 3800,
};

/** Los elementos de proteccion personal (EPP) y la ropa de trabajo tienen marcas distintas. */
function brandsFor(item: (typeof CLOTHING_ITEMS)[number]): string[] {
  return item.code.startsWith('EPP') ? ['Libus', '3M', 'Funcional'] : ['Ombú', 'Pampero'];
}

export async function seedClothing(ctx: Ctx, employees: DemoEmployee[]): Promise<void> {
  const { tx, cal, faker, company } = ctx;
  const sizes = [...new Set(CLOTHING_ITEMS.flatMap((i) => i.sizes))];
  await tx.clothing_items.createMany({
    data: CLOTHING_ITEMS.map((i) => ({ id: demoId('clothing_item', i.key), name: i.name, code: i.code, company_id: company.id })),
  });
  await tx.clothing_brands.createMany({ data: CLOTHING_BRANDS.map((b) => ({ id: demoId('clothing_brand', b), name: b, company_id: company.id })) });
  await tx.clothing_sizes.createMany({ data: sizes.map((s) => ({ id: demoId('clothing_size', s), name: s, company_id: company.id })) });
  await tx.clothing_item_brand_sizes.createMany({
    data: CLOTHING_ITEMS.flatMap((item) => {
      return brandsFor(item).flatMap((b) =>
        item.sizes.map((s) => ({ clothing_item_id: demoId('clothing_item', item.key), clothing_brand_id: demoId('clothing_brand', b), clothing_size_id: demoId('clothing_size', s) }))
      );
    }),
  });

  const storekeeper = employees.find((e) => e.position === 'administrativo' && e.active)!;
  const deliveries: Prisma.clothing_deliveriesCreateManyInput[] = [];
  const items: Prisma.clothing_delivery_itemsCreateManyInput[] = [];
  const field = employees.filter((e) => e.active && !['administrativo', 'analista_rrhh'].includes(e.position));
  for (const [n, emp] of field.entries()) {
    // Entrega semestral de convenio + reposiciones sueltas.
    const events: Array<{ offset: number; type: 'PLANNED_CCT' | 'PLANNED_EPP' | 'REPLACEMENT' }> = [
      { offset: -faker.number.int({ min: 150, max: 200 }), type: 'PLANNED_CCT' },
      { offset: -faker.number.int({ min: 5, max: 40 }), type: 'PLANNED_EPP' },
    ];
    if (faker.datatype.boolean({ probability: 0.35 })) events.push({ offset: -faker.number.int({ min: 1, max: 120 }), type: 'REPLACEMENT' });
    for (const [k, ev] of events.entries()) {
      if (ev.offset < emp.admission) continue;
      const id = demoId('clothing_delivery', `${n}:${k}`);
      deliveries.push({
        id,
        employee_id: emp.id,
        delivered_by_id: storekeeper.id,
        delivery_type: ev.type,
        delivered_at: cal.at(ev.offset, 9),
        notes: ev.type === 'REPLACEMENT' ? 'Reposición por desgaste' : null,
        company_id: company.id,
        created_at: cal.at(ev.offset, 9),
      });
      const chosen =
        ev.type === 'PLANNED_CCT'
          ? CLOTHING_ITEMS.filter((i) => ['camisa', 'pantalon', 'campera'].includes(i.key))
          : ev.type === 'PLANNED_EPP'
            ? CLOTHING_ITEMS.filter((i) => ['botines', 'casco', 'guantes', 'anteojos'].includes(i.key))
            : sample(faker, CLOTHING_ITEMS, 1);
      for (const item of chosen) {
        items.push({
          clothing_delivery_id: id,
          clothing_item_id: demoId('clothing_item', item.key),
          clothing_brand_id: demoId('clothing_brand', pick(faker, brandsFor(item))),
          clothing_size_id: demoId('clothing_size', pick(faker, item.sizes)),
          quantity: item.key === 'guantes' ? 3 : item.key === 'camisa' || item.key === 'pantalon' ? 2 : 1,
          has_certificate: item.code.startsWith('EPP'),
        });
      }
    }
  }
  const stock = await seedClothingStock(ctx, deliveries, items);
  // Primero el stock: cada entrega referencia a su salida (`stock_movement_id`).
  await stock.writeMovements();
  await tx.clothing_deliveries.createMany({ data: deliveries });
  await tx.clothing_delivery_items.createMany({ data: items });
  ctx.log(`indumentaria: ${deliveries.length} entregas, ${stock.materialCount} materiales de ropa, ${stock.movementCount} movimientos de stock`);
}

/**
 * Stock de la ropa (Almacenes etapa 5): un material por combinacion de la matriz (misma regla de
 * codigo que el sistema), una compra al deposito base antes de la primera entrega, una salida
 * por entrega imputada al empleado y una entrega anulada (su salida, anulada). Como estos
 * materiales solo tienen movimientos de ropa y una sola compra, el costo promedio es el de la
 * compra y no hace falta el libro de Almacenes. Completa `warehouse_id`, `stock_movement_id` y la
 * anulacion en las entregas y devuelve la escritura de movimientos, que va ANTES que las entregas.
 */
async function seedClothingStock(
  ctx: Ctx,
  deliveries: Prisma.clothing_deliveriesCreateManyInput[],
  items: Prisma.clothing_delivery_itemsCreateManyInput[]
) {
  const { tx, cal, company, actorId } = ctx;
  const dec = (v: number | string) => new Prisma.Decimal(v);
  const warehouseId = demoId('warehouse', 'BASE');
  const categoryId = demoId('material_category', 'Ropa');
  await tx.material_categories.create({ data: { id: categoryId, company_id: company.id, name: 'Ropa' } });

  // Materiales de la matriz.
  const taken = new Set((await tx.materials.findMany({ where: { company_id: company.id }, select: { code: true } })).map((m) => m.code));
  const materialByCombo = new Map<string, { id: string; cost: number; name: string }>();
  const materials: Prisma.materialsCreateManyInput[] = [];
  const links: Prisma.clothing_item_materialsCreateManyInput[] = [];
  for (const item of CLOTHING_ITEMS) {
    for (const brand of brandsFor(item)) {
      for (const size of item.sizes) {
        const combination = { itemCode: item.code, itemName: item.name, brandName: brand, sizeName: size };
        const code = clothingMaterialCode(combination, taken);
        taken.add(code);
        const id = demoId('material', `ropa:${item.key}:${brand}:${size}`);
        const name = clothingMaterialName(combination);
        materials.push({
          id,
          company_id: company.id,
          code,
          name,
          category_id: categoryId,
          unit_id: demoId('measurement_unit', 'u'),
          tracking_type: 'QUANTITY',
          average_cost: CLOTHING_COSTS[item.key]!,
        });
        links.push({
          company_id: company.id,
          clothing_item_id: demoId('clothing_item', item.key),
          clothing_brand_id: demoId('clothing_brand', brand),
          clothing_size_id: demoId('clothing_size', size),
          material_id: id,
        });
        materialByCombo.set(`${demoId('clothing_item', item.key)}|${demoId('clothing_brand', brand)}|${demoId('clothing_size', size)}`, {
          id,
          cost: CLOTHING_COSTS[item.key]!,
          name,
        });
      }
    }
  }
  await tx.materials.createMany({ data: materials });
  await tx.clothing_item_materials.createMany({ data: links });

  // Lo que sale por entrega, agrupado por material.
  const linesByDelivery = new Map<string, Map<string, number>>();
  for (const it of items) {
    const material = materialByCombo.get(`${it.clothing_item_id}|${it.clothing_brand_id}|${it.clothing_size_id}`)!;
    const lines = linesByDelivery.get(it.clothing_delivery_id) ?? new Map<string, number>();
    lines.set(material.id, (lines.get(material.id) ?? 0) + (it.quantity ?? 1));
    linesByDelivery.set(it.clothing_delivery_id, lines);
  }
  const costOf = new Map([...materialByCombo.values()].map((m) => [m.id, m.cost]));

  // La ultima reposicion se anula (cargada por error): su ropa vuelve al deposito.
  const ordered = [...deliveries].sort((a, b) => +new Date(a.delivered_at) - +new Date(b.delivered_at));
  const cancelled = [...ordered].reverse().find((d) => d.delivery_type === 'REPLACEMENT') ?? null;

  const lastNumber = await tx.stock_movements.findMany({
    where: { company_id: company.id },
    select: { number: true },
    orderBy: { number: 'desc' },
    take: 1,
  });
  let seq = Number(lastNumber[0]?.number.replace(/\D/g, '') ?? 0);
  const movements: Prisma.stock_movementsCreateManyInput[] = [];
  const movementLines: Prisma.stock_movement_linesCreateManyInput[] = [];
  const balances = new Map<string, number>();
  const nextNumber = () => `MOV-${String(++seq).padStart(6, '0')}`;

  // Compra: todo lo que se entrega mas un margen, antes de la primera entrega.
  const purchased = new Map<string, number>();
  for (const lines of linesByDelivery.values()) for (const [m, q] of lines) purchased.set(m, (purchased.get(m) ?? 0) + q);
  const purchaseId = demoId('stock_movement', 'ropa:compra');
  const firstDay = ordered.length ? Math.round((+new Date(ordered[0]!.delivered_at) - +cal.day(0)) / 86_400_000) - 5 : -210;
  let purchaseTotal = dec(0);
  for (const [i, [materialId, used]] of [...purchased].entries()) {
    const qty = used + 6;
    const cost = costOf.get(materialId)!;
    purchaseTotal = purchaseTotal.plus(dec(qty).times(cost));
    balances.set(materialId, qty);
    movementLines.push({ id: demoId('stock_line', `ropa:compra:${i}`), movement_id: purchaseId, material_id: materialId, quantity: qty, direction: 1, unit_cost: cost, total_cost: dec(qty).times(cost) });
  }
  movements.push({
    id: purchaseId,
    company_id: company.id,
    number: nextNumber(),
    type: 'ENTRY',
    warehouse_id: warehouseId,
    occurred_on: cal.day(firstDay),
    reference: 'Factura A 0004-00031207 · Indumentaria del Sur',
    notes: 'Compra de ropa de trabajo y EPP',
    total_cost: purchaseTotal,
    created_by: actorId,
    created_at: cal.at(firstDay, 8),
  });

  // Una salida por entrega (y la anulacion de la anulada, el dia siguiente).
  for (const delivery of ordered) {
    const lines = linesByDelivery.get(delivery.id!);
    if (!lines) continue;
    const exitId = demoId('stock_movement', `ropa:${delivery.id}`);
    let total = dec(0);
    const exitLines = [...lines].map(([materialId, qty], i) => {
      const cost = costOf.get(materialId)!;
      total = total.plus(dec(qty).times(cost));
      balances.set(materialId, balances.get(materialId)! - qty);
      return { id: demoId('stock_line', `ropa:${delivery.id}:${i}`), movement_id: exitId, material_id: materialId, quantity: qty, direction: -1, unit_cost: cost, total_cost: dec(qty).times(cost) };
    });
    const at = new Date(delivery.delivered_at);
    movements.push({
      id: exitId,
      company_id: company.id,
      number: nextNumber(),
      type: 'EXIT',
      warehouse_id: warehouseId,
      occurred_on: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())),
      reference: 'Entrega de ropa',
      notes: delivery.notes ?? null,
      destination_type: 'EMPLOYEE',
      employee_id: delivery.employee_id,
      total_cost: total,
      created_by: actorId,
      created_at: at,
    });
    movementLines.push(...exitLines);
    delivery.warehouse_id = warehouseId;
    delivery.stock_movement_id = exitId;

    if (delivery === cancelled) {
      const reversalId = demoId('stock_movement', `ropa:anulacion:${delivery.id}`);
      const reversalAt = new Date(at.getTime() + 86_400_000);
      movements.push({
        id: reversalId,
        company_id: company.id,
        number: nextNumber(),
        type: 'EXIT',
        warehouse_id: warehouseId,
        occurred_on: new Date(Date.UTC(reversalAt.getUTCFullYear(), reversalAt.getUTCMonth(), reversalAt.getUTCDate())),
        reference: 'Entrega de ropa',
        notes: 'Anulación de entrega de ropa: se cargó el talle equivocado',
        destination_type: 'EMPLOYEE',
        employee_id: delivery.employee_id,
        reverses_movement_id: exitId,
        total_cost: total,
        created_by: actorId,
        created_at: reversalAt,
      });
      exitLines.forEach((l, i) => {
        balances.set(l.material_id, balances.get(l.material_id)! + Number(l.quantity));
        movementLines.push({ ...l, id: demoId('stock_line', `ropa:anulacion:${delivery.id}:${i}`), movement_id: reversalId, direction: 1 });
      });
      delivery.cancelled_at = reversalAt;
      delivery.cancelled_by = actorId;
      delivery.cancel_reason = 'Se cargó el talle equivocado';
    }
  }

  return {
    materialCount: materials.length,
    movementCount: movements.length,
    /** Va antes que las entregas: `clothing_deliveries.stock_movement_id` referencia estos movimientos. */
    async writeMovements() {
      await tx.stock_movements.createMany({ data: movements });
      await tx.stock_movement_lines.createMany({ data: movementLines });
      await tx.stock_balances.createMany({
        data: [...balances].map(([materialId, qty]) => ({ company_id: company.id, material_id: materialId, warehouse_id: warehouseId, quantity: qty })),
      });
    },
  };
}

const KPIS = [
  { code: 'KPI-0001', name: 'Ausentismo diario', formula: 'AD = TA / TE × 100', target: '≤ 4%' },
  { code: 'KPI-0002', name: 'Personal en movimientos internos', formula: 'PMI = TMI / TPA × 100', target: '≤ 10%' },
  { code: 'KPI-0003', name: 'Personal productivo en clientes', formula: 'PP = TPC / (TPA - TMI) × 100', target: '≥ 85%' },
  { code: 'KPI-0004', name: 'Equipos detenidos por falla', formula: 'EDO = ENO / EA × 100', target: '≤ 8%' },
  { code: 'KPI-0005', name: 'Equipos en movimientos internos', formula: 'EMI = EAMI / EOA × 100', target: '≤ 10%' },
  { code: 'KPI-0006', name: 'Equipos operativos en clientes', formula: 'EOC = TEOC / TEOA × 100', target: '≥ 80%' },
];

export async function seedKpis(ctx: Ctx): Promise<void> {
  const { tx, cal, company, actorId } = ctx;
  await tx.kpis.createMany({
    data: KPIS.map((k, i) => ({
      id: demoId('kpi', k.code),
      company_id: company.id,
      code: k.code,
      name: k.name,
      number: `IND-${String(i + 1).padStart(2, '0')} Rev. 2`,
      validity_date: cal.day(200 + i * 15),
      calculation_formula: k.formula,
      improvement_opportunities: `Meta: ${k.target}. Revisión mensual en el comité de operaciones.`,
      created_at: cal.at(-400),
    })),
  });
  await tx.kpi_revisions.createMany({
    data: KPIS.map((k, i) => ({
      kpi_id: demoId('kpi', k.code),
      previous_number: `IND-${String(i + 1).padStart(2, '0')} Rev. 1`,
      new_number: `IND-${String(i + 1).padStart(2, '0')} Rev. 2`,
      previous_validity_date: cal.day(-165 + i * 15),
      new_validity_date: cal.day(200 + i * 15),
      change_reason: 'Revisión anual del indicador',
      changed_by: actorId,
      created_at: cal.at(-165 + i * 15),
    })),
  });
}
