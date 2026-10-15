/**
 * Flota: ~120 vehiculos (tractores, chasis, semirremolques, camionetas, hidrogruas, minibuses y
 * cisternas) y los equipos varios (generadores, torres, compresores, bombas).
 *
 * Los tipos Tractor y Chasis usan los ids fijos de `get_kpi_range`, asi los KPIs de flota
 * tienen datos. Al insertarlos, los triggers generan los documentos pendientes. Las filas de
 * `contractor_equipment` se insertan acá, explícitas (desde `allocated_to`): ya no hay trigger.
 */
import type { Prisma } from '../../../src/generated/prisma/client.ts';
import {
  BRANDS,
  EQUIPMENT_OWNERS,
  EQUIPMENT_TYPES,
  OTHER_EQUIPMENT_TYPES,
  SUB_TYPES,
  type EquipmentTypeKey,
} from '../data/catalog.ts';
import type { Ctx } from '../lib/ctx.ts';
import { insertMany } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import { pick, weighted } from '../lib/random.ts';
import { brandId, equipmentTypeId, modelId } from './catalogs.ts';
import { assignCustomers } from './employees.ts';

export interface DemoVehicle {
  id: string;
  domain: string;
  type: EquipmentTypeKey;
  typeName: string;
  brand: string;
  model: string;
  year: number;
  internNumber: string;
  active: boolean;
  condition: 'operativo' | 'no_operativo' | 'en_reparacion' | 'operativo_condicionado' | 'en_preparacion';
  customers: string[];
  kilometer: number;
}

export interface DemoOtherEquipment {
  id: string;
  type: string;
  typeName: string;
  internNumber: string;
  serial: string;
}

const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

function plate(ctx: Ctx, year: number, used: Set<string>): string {
  const { faker } = ctx;
  let value = '';
  do {
    const l = () => LETTERS[faker.number.int({ min: 0, max: LETTERS.length - 1 })];
    const n = () => String(faker.number.int({ min: 0, max: 9 }));
    // Mercosur (AA123BB) desde 2016; antes, el formato ABC123.
    value = year >= 2016 ? `A${l()}${n()}${n()}${n()}${l()}${l()}` : `${l()}${l()}${l()}${n()}${n()}${n()}`;
  } while (used.has(value));
  used.add(value);
  return value;
}

function modelsFor(type: string): Array<{ brand: string; model: string }> {
  return BRANDS.flatMap((b) =>
    b.models.filter((m) => m.types.includes(type)).map((m) => ({ brand: b.key, model: m.key }))
  );
}

export async function seedVehicles(ctx: Ctx): Promise<{ vehicles: DemoVehicle[]; others: DemoOtherEquipment[] }> {
  const { tx, cal, faker, company, actorId } = ctx;
  const usedPlates = new Set<string>();
  const vehicles: DemoVehicle[] = [];
  const rows: Prisma.vehiclesCreateManyInput[] = [];
  let intern = 100;

  for (const type of EQUIPMENT_TYPES) {
    const subTypes = SUB_TYPES.filter((s) => s.type === type.key);
    const inactiveCount = type.count >= 18 ? 2 : type.count >= 10 ? 1 : 0;
    for (let i = 0; i < type.count; i++) {
      intern++;
      const id = demoId('vehicle', `${type.key}:${i}`);
      const { brand, model } = pick(faker, modelsFor(type.key));
      const year = faker.number.int({ min: 2012, max: 2025 });
      const domain = plate(ctx, year, usedPlates);
      const active = i >= inactiveCount;
      const condition = !active
        ? 'no_operativo'
        : weighted(faker, [
            ['operativo', 80],
            ['operativo_condicionado', 6],
            ['en_reparacion', 7],
            ['no_operativo', 3],
            ['en_preparacion', 4],
          ] as const);
      const contract = weighted(faker, [
        ['Propio', 62],
        ['Leasing', 20],
        ['Alquiler', 13],
        ['Prendado', 5],
      ] as const);
      const owner = contract === 'Propio' ? null : EQUIPMENT_OWNERS.find((o) => o.type === contract) ?? null;
      const ageYears = Number(cal.today.slice(0, 4)) - year;
      const kilometer =
        type.key === 'semirremolque'
          ? 0
          : ageYears * faker.number.int({ min: 45_000, max: 95_000 }) + faker.number.int({ min: 0, max: 30_000 });
      const customers = type.operative && active ? assignCustomers(ctx, type.key) : [];
      const contractStart = contract === 'Propio' ? null : -faker.number.int({ min: 120, max: 900 });

      vehicles.push({
        id,
        domain,
        type: type.key,
        typeName: type.name,
        brand: BRANDS.find((b) => b.key === brand)!.name,
        model: BRANDS.find((b) => b.key === brand)!.models.find((m) => m.key === model)!.name,
        year,
        internNumber: `INT-${intern}`,
        active,
        condition,
        customers,
        kilometer,
      });

      rows.push({
        id,
        type_of_vehicle: BigInt(1),
        type: equipmentTypeId(type.key),
        subType: subTypes.length ? demoId('sub_type', pick(faker, subTypes).key) : null,
        domain,
        chassis: `8AC${faker.string.alphanumeric({ length: 14, casing: 'upper' })}`,
        engine: `${faker.string.alpha({ length: 2, casing: 'upper' })}${faker.string.numeric(8)}`,
        serie: type.key === 'semirremolque' ? `SR-${faker.string.numeric(6)}` : null,
        intern_number: `INT-${intern}`,
        year: String(year),
        brand: brandId(brand),
        model: modelId(brand, model),
        is_active: active,
        termination_date: active ? null : cal.day(-faker.number.int({ min: 20, max: 400 })),
        reason_for_termination: active
          ? null
          : weighted(faker, [
              ['venta', 60],
              ['devoluci_n', 25],
              ['destrucci_n_total', 15],
            ] as const),
        company_id: company.id,
        user_id: actorId,
        condition,
        kilometer: String(kilometer),
        engine_hours: type.key === 'hidrogrua' ? String(faker.number.int({ min: 2000, max: 18000 })) : '0',
        cost_center_id: demoId(
          'cost_center',
          weighted(faker, [
            ['anelo', 60],
            ['rincon', 40],
          ])
        ),
        type_operative_id: demoId('type_operative', type.operativeKind),
        owner_id: owner ? demoId('owner', owner.key) : null,
        type_of_contract: contract,
        contract_number:
          contract === 'Propio' ? null : `${contract.slice(0, 3).toUpperCase()}-${faker.string.numeric(5)}`,
        contract_start_date: contractStart === null ? null : cal.day(contractStart),
        contract_expiration_date:
          contractStart === null
            ? null
            : cal.day(
                contractStart +
                  weighted(faker, [
                    [730, 60],
                    [1095, 40],
                  ])
              ),
        has_certification: type.key === 'hidrogrua',
        certification_number: type.key === 'hidrogrua' ? `IZ-${faker.string.numeric(6)}` : null,
        certification_expiration_date:
          type.key === 'hidrogrua' ? cal.day(faker.number.int({ min: -20, max: 300 })) : null,
        currency: 'USD',
        price: faker.number.int({ min: 25, max: 180 }) * 1000,
        cost_type: 'Directo',
        sector: demoId('hierarchy', type.key === 'camioneta' ? 'operaciones' : 'logistica'),
        allocated_to: customers,
        created_at: cal.at(-faker.number.int({ min: 60, max: 1500 }), 9),
      });
    }
  }
  await insertMany(rows, (chunk) => tx.vehicles.createMany({ data: chunk }), 40);

  // Afectaciones a clientes: pivote explícita, en sincronía con `allocated_to`.
  const contractorLinks = vehicles.flatMap((v) =>
    v.customers.map((contractorId) => ({ equipment_id: v.id, contractor_id: contractorId }))
  );
  await insertMany(
    contractorLinks,
    (chunk) => tx.contractor_equipment.createMany({ data: chunk, skipDuplicates: true }),
    500
  );

  // Equipos varios (no son vehiculos: no llevan patente ni documentos de equipo).
  const others: DemoOtherEquipment[] = [];
  const otherRows: Prisma.other_equipmentCreateManyInput[] = [];
  const tractors = vehicles.filter((v) => v.type === 'chasis' && v.active);
  let oe = 0;
  for (const type of OTHER_EQUIPMENT_TYPES) {
    for (let i = 0; i < type.count; i++) {
      oe++;
      const id = demoId('other_equipment', `${type.key}:${i}`);
      const { brand, model } = pick(faker, modelsFor(type.key));
      const serial = `${type.key.slice(0, 3).toUpperCase()}-${faker.string.numeric(7)}`;
      others.push({
        id,
        type: type.key,
        typeName: type.name,
        internNumber: `EQ-${String(oe).padStart(3, '0')}`,
        serial,
      });
      otherRows.push({
        id,
        company_id: company.id,
        type_id: demoId('type', type.key),
        brand_id: brandId(brand),
        model_id: modelId(brand, model),
        serial_number: serial,
        year: String(faker.number.int({ min: 2015, max: 2025 })),
        condition: weighted(faker, [
          ['operativo', 85],
          ['en_reparacion', 10],
          ['no_operativo', 5],
        ] as const),
        intern_number: `EQ-${String(oe).padStart(3, '0')}`,
        horometer: faker.number.int({ min: 800, max: 22000 }),
        manufacturer_plate: `${BRANDS.find((b) => b.key === brand)!.name} ${serial}`,
        currency: 'USD',
        initial_value: faker.number.int({ min: 8, max: 60 }) * 1000,
        purchase_date: cal.day(-faker.number.int({ min: 200, max: 2500 })),
        cost_type: 'Directo',
        cost_center_id: demoId('cost_center', 'anelo'),
        sector: demoId('hierarchy', 'operaciones'),
        linked_vehicle_id: type.key === 'generador' && i < 2 ? tractors[i]?.id ?? null : null,
        type_of_contract: 'Propio',
        is_active: true,
        user_id: actorId,
        created_at: cal.at(-faker.number.int({ min: 60, max: 900 })),
      });
    }
  }
  await tx.other_equipment.createMany({ data: otherRows });
  await tx.contractor_other_equipment.createMany({
    // Asignados segun la demanda (torres y generadores a quien los pide en sus contratos).
    data: others.flatMap((o) =>
      assignCustomers(ctx, `other:${o.type}`).map((contractor_id) => ({ equipment_id: o.id, contractor_id }))
    ),
  });

  ctx.log(
    `${vehicles.length} vehículos (${vehicles.filter((v) => !v.active).length} de baja) y ${others.length} equipos varios`
  );
  return { vehicles, others };
}
