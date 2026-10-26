/**
 * Empleados: ~120 legajos repartidos por puesto, con convenio, categoria, diagrama de trabajo,
 * centro de costo y clientes asignados. Diez estan dados de baja.
 *
 * Al insertarlos, los triggers de la base generan sus documentos pendientes. Las filas de
 * `contractor_employee` se insertan acá, explícitas (desde `allocated_to`): ya no hay trigger
 * que las derive. `companies_employees` dejó de escribirse (la empresa es `employees.company_id`).
 */
import type { Prisma } from '../../../src/generated/prisma/client.ts';
import {
  APTITUDES,
  CATEGORIES,
  CITIES,
  COVENANTS,
  MANAGEMENT_POSITIONS,
  POSITIONS,
  POSITION_HEADCOUNT,
  type PositionKey,
  type WorkDiagramKey,
} from '../data/catalog.ts';
import { ACTIVE_CUSTOMERS, EXTERNAL_CUSTOMERS, customerId, demandOf } from '../data/customers.ts';
import type { Ctx } from '../lib/ctx.ts';
import { insertMany } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import { corporateEmail, makePerson } from '../lib/people.ts';
import { pick, sample, weighted } from '../lib/random.ts';
import { NEUQUEN_PROVINCE } from './catalogs.ts';

export interface DemoEmployee {
  id: string;
  file: string;
  firstname: string;
  lastname: string;
  dni: string;
  cuil: string;
  position: PositionKey;
  /** `key` del sector de su ficha (`hierarchical_position`). */
  sector: string;
  active: boolean;
  /** Offset (dias) de la fecha de ingreso. */
  admission: number;
  diagram: WorkDiagramKey;
  /** Ids de clientes asignados. */
  customers: string[];
  /** Desfase del ciclo de su diagrama (para que no todos tengan franco el mismo dia). */
  cycleOffset: number;
  /** Offset de la baja; null si esta activo. */
  terminationOffset: number | null;
  bornDate: string;
  gender: 'Masculino' | 'Femenino';
  street: string;
  streetNumber: string;
  phone: string;
  city: number;
  email: string;
}

const OPERATIONS: PositionKey[] = ['chofer', 'operador', 'ayudante', 'supervisor', 'jefe_base'];
const WORKSHOP: PositionKey[] = ['mecanico', 'electricista', 'gomero', 'jefe_taller'];

/**
 * Clientes a los que se asigna un recurso, en proporcion a lo que cada uno pide por dia
 * (`type` = tipo de equipo, o null para personal). Un 25% queda asignado a un segundo cliente.
 */
export function assignCustomers(ctx: Ctx, type: string | null): string[] {
  const options = ACTIVE_CUSTOMERS.map((c) => [c, demandOf(c, type)] as const).filter(([, d]) => d > 0);
  if (!options.length) return sample(ctx.faker, EXTERNAL_CUSTOMERS, 1).map(customerId);
  const first = weighted(
    ctx.faker,
    options.map(([c, d]) => [c, d] as [typeof c, number])
  );
  const rest = options.filter(([c]) => c !== first);
  const second =
    rest.length && ctx.faker.datatype.boolean({ probability: 0.25 })
      ? weighted(
          ctx.faker,
          rest.map(([c, d]) => [c, d] as [typeof c, number])
        )
      : null;
  return [first, ...(second ? [second] : [])].map(customerId);
}

function categoryFor(ctx: Ctx, position: PositionKey): string {
  switch (position) {
    case 'chofer':
      return weighted(ctx.faker, [
        ['chofer1', 60],
        ['chofer3', 30],
        ['camion_1', 10],
      ]);
    case 'operador':
      return 'operador';
    case 'ayudante':
      return 'ayudante';
    case 'mecanico':
    case 'electricista':
    case 'gomero':
    case 'jefe_taller':
      return 'oficial';
    case 'supervisor':
    case 'jefe_base':
    case 'tecnico_hse':
      return 'supervisor';
    default:
      return weighted(ctx.faker, [
        ['admin_a', 50],
        ['admin_b', 50],
      ]);
  }
}

function diagramFor(ctx: Ctx, position: PositionKey): WorkDiagramKey {
  if (OPERATIONS.includes(position))
    return weighted(ctx.faker, [
      ['14x14', 55],
      ['7x7', 45],
    ]);
  if (WORKSHOP.includes(position)) return '6x1';
  if (position === 'tecnico_hse') return '7x7';
  return '5x2';
}

function costCenterFor(ctx: Ctx, position: PositionKey): string {
  if (WORKSHOP.includes(position)) return 'taller';
  if (
    ['administrativo', 'analista_rrhh'].includes(position) ||
    (MANAGEMENT_POSITIONS as readonly string[]).includes(position)
  )
    return 'admin';
  return weighted(ctx.faker, [
    ['anelo', 60],
    ['rincon', 40],
  ]);
}

export async function seedEmployees(ctx: Ctx): Promise<DemoEmployee[]> {
  const { tx, cal, faker, company } = ctx;
  const usedDni = new Set<string>();
  const employees: DemoEmployee[] = [];
  const rows: Prisma.employeesCreateManyInput[] = [];
  const neuquenCities = CITIES.filter((c) => c.province === NEUQUEN_PROVINCE);

  let file = 1000;
  const positions = POSITIONS.flatMap((p) => Array.from({ length: POSITION_HEADCOUNT[p.key] }, () => p));
  const inactiveIdx = new Set(
    sample(
      faker,
      positions
        .map((_, i) => i)
        .filter(
          (i) =>
            positions[i].key !== 'jefe_taller' &&
            !(MANAGEMENT_POSITIONS as readonly string[]).includes(positions[i].key)
        ),
      10
    )
  );

  let choferCount = 0;
  for (const [index, pos] of positions.entries()) {
    // Un chofer de cada cuatro está asignado a Logística (el puesto existe en los dos sectores).
    const sector = pos.key === 'chofer' && choferCount++ % 4 === 3 ? 'logistica' : pos.hierarchy[0];
    file += faker.number.int({ min: 1, max: 4 });
    const person = makePerson(faker, usedDni, {
      today: cal.today,
      female: ['administrativo', 'analista_rrhh', 'tecnico_hse'].includes(pos.key)
        ? faker.datatype.boolean({ probability: 0.6 })
        : undefined,
    });
    const id = demoId('employee', index);
    const active = !inactiveIdx.has(index);
    // Antiguedad: la mayoria entre 1 y 10 años; algunos ingresos recientes.
    const admission = -weighted(faker, [
      [faker.number.int({ min: 20, max: 120 }), 10],
      [faker.number.int({ min: 121, max: 1100 }), 45],
      [faker.number.int({ min: 1101, max: 3800 }), 45],
    ]);
    const category = categoryFor(ctx, pos.key);
    const covenantKey = CATEGORIES.find((c) => c.key === category)!.covenant;
    const guildKey = COVENANTS.find((c) => c.key === covenantKey)!.guild;
    const customers = OPERATIONS.includes(pos.key) ? assignCustomers(ctx, null) : [];
    const diagram = diagramFor(ctx, pos.key);
    // La baja siempre es posterior al ingreso.
    const terminated = !active ? Math.max(admission + 30, faker.number.int({ min: -300, max: -10 })) : null;
    const city = pick(faker, neuquenCities).id;
    const email = corporateEmail(person.firstname, person.lastname);
    const contract =
      admission > -90
        ? 'prueba'
        : weighted(faker, [
            ['indeterminado', 88],
            ['plazo_fijo', 9],
            ['eventual', 3],
          ]);

    employees.push({
      id,
      file: String(file),
      firstname: person.firstname,
      lastname: person.lastname,
      dni: person.dni,
      cuil: person.cuil,
      position: pos.key,
      sector,
      active,
      admission,
      diagram,
      customers,
      cycleOffset: faker.number.int({ min: 0, max: 27 }),
      terminationOffset: terminated,
      bornDate: person.bornDate,
      gender: person.gender,
      street: person.street,
      streetNumber: person.streetNumber,
      phone: person.phone,
      city,
      email,
    });

    rows.push({
      id,
      firstname: person.firstname,
      lastname: person.lastname,
      cuil: person.cuil,
      document_type: 'DNI',
      document_number: person.dni,
      born_date: person.bornDate,
      nationality: 'Argentina',
      birthplace: demoId('country', 'Argentina'),
      gender: person.gender,
      marital_status: weighted(faker, [
        ['Casado', 40],
        ['Soltero', 35],
        ['Union_de_hecho', 18],
        ['Divorciado', 7],
      ]),
      level_of_education: OPERATIONS.includes(pos.key)
        ? weighted(faker, [
            ['Secundario', 75],
            ['Primario', 15],
            ['Terciario', 10],
          ])
        : weighted(faker, [
            ['Terciario', 40],
            ['Universitario', 45],
            ['Secundario', 15],
          ]),
      street: person.street,
      street_number: person.streetNumber,
      province: BigInt(NEUQUEN_PROVINCE),
      city: BigInt(city),
      postal_code: '8300',
      phone: person.phone,
      email,
      file: String(file),
      normal_hours: OPERATIONS.includes(pos.key) ? '12' : '8',
      date_of_admission: cal.day(admission),
      affiliate_status: ['jefe_base', 'jefe_taller', 'supervisor'].includes(pos.key)
        ? 'Fuera_de_convenio'
        : 'Dentro_de_convenio',
      hierarchical_position: demoId('hierarchy', sector),
      company_position: demoId('position', pos.key),
      workflow_diagram: demoId('work_diagram', diagram),
      category_id: demoId('category', category),
      covenants_id: demoId('covenant', covenantKey),
      guild_id: demoId('guild', guildKey),
      cost_center_id: demoId('cost_center', costCenterFor(ctx, pos.key)),
      type_of_contract: demoId('contract_type', contract),
      cost_type: OPERATIONS.includes(pos.key) || WORKSHOP.includes(pos.key) ? 'Directo' : 'Indirecto',
      allocated_to: customers,
      company_id: company.id,
      is_active: active,
      termination_date: terminated === null ? null : cal.day(terminated),
      reason_for_termination:
        terminated === null
          ? null
          : weighted(faker, [
              ['Renuncia', 50],
              ['Despido_sin_causa', 20],
              ['Fin_de_contrato', 20],
              ['Acuerdo_de_partes', 10],
            ]),
      created_at: cal.at(Math.max(admission, -1500), 10),
    });
  }

  await insertMany(rows, (chunk) => tx.employees.createMany({ data: chunk }), 40);

  // Afectaciones a clientes: pivote explícita, en sincronía con `allocated_to`.
  const contractorLinks = employees.flatMap((e) =>
    e.customers.map((contractorId) => ({ employee_id: e.id, contractor_id: contractorId }))
  );
  await insertMany(
    contractorLinks,
    (chunk) => tx.contractor_employee.createMany({ data: chunk, skipDuplicates: true }),
    500
  );

  // Aptitudes tecnicas segun el puesto.
  const aptitudes = employees.flatMap((e) =>
    APTITUDES.filter((a) => (a.positions as readonly string[]).includes(e.position)).map((a) => ({
      empleado_id: e.id,
      aptitud_id: demoId('aptitud', a.key),
      tiene_aptitud: faker.datatype.boolean({ probability: 0.85 }),
      fecha_verificacion: cal.day(-faker.number.int({ min: 10, max: 600 })),
    }))
  );
  await tx.empleado_aptitudes.createMany({ data: aptitudes });

  ctx.log(`${employees.length} empleados (${employees.filter((e) => !e.active).length} de baja)`);
  return employees;
}
