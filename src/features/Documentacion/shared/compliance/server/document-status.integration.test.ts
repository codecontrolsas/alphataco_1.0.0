import type { Prisma } from '@/generated/prisma/client';
import { ensureCity, ensureCountry } from '@/test/db-fixtures';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { selectionsToConditionsJson } from '../../../TiposDocumentos/utils/conditionsMapper';
import { arCurrentPeriod } from '../dates';

/**
 * Integración del escritor único del cache de status (`refreshDocumentStatus`) y del job diario
 * `documents-status`, contra la base de pruebas (`alphataco_test`, triggers legacy activos):
 *   DATABASE_URL=postgresql://alphataco:<pass>@127.0.0.1:5432/alphataco_test \
 *     npx vitest run src/features/Documentacion src/features/Jobs
 *
 * Crea su propia empresa (con recursos y tipos propios) y la borra al terminar. Como los tipos
 * globales de la base (company_id NULL) también se exigen a los recursos de la empresa de prueba,
 * cada recurso recibe un documento vigente por cada tipo global obligatorio aplicable.
 */
const RUN = Boolean(process.env.DATABASE_URL);
const DAY = 86_400_000;

type Db = (typeof import('@/shared/lib/prisma'))['prisma'];
let prisma: Db;
let companyId = '';
const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
const created = {
  employees: [] as string[],
  vehicles: [] as string[],
  types: [] as string[],
  positions: [] as string[],
  vehicleCategories: [] as string[],
  vehicleTypes: [] as string[],
};

const status = {
  ok: 'Completo',
  expired: 'Completo con doc vencida',
  incomplete: 'Incompleto',
} as const;

const future = () => new Date(Date.now() + 40 * DAY);
const past = () => new Date(Date.now() - 3 * DAY);

async function cleanup() {
  if (companyId) {
    await prisma.jobs_runs.deleteMany({ where: { company_id: companyId } });
    await prisma.documents_employees.deleteMany({ where: { applies: { in: created.employees } } });
    await prisma.documents_equipment.deleteMany({ where: { applies: { in: created.vehicles } } });
    await prisma.contractor_employee.deleteMany({ where: { employee_id: { in: created.employees } } });
    await prisma.employees.deleteMany({ where: { id: { in: created.employees } } });
    await prisma.vehicles.deleteMany({ where: { id: { in: created.vehicles } } });
    await prisma.document_types.deleteMany({ where: { company_id: companyId } });
    await prisma.company_positions.deleteMany({ where: { id: { in: created.positions } } });
    await prisma.type.deleteMany({ where: { id: { in: created.vehicleTypes as never[] } } });
    await prisma.types_of_vehicles.deleteMany({ where: { id: { in: created.vehicleCategories as never[] } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  }
}

async function employeeStatus(id: string) {
  const row = await prisma.$queryRaw<
    Array<{ s: string | null }>
  >`SELECT status::text AS s FROM employees WHERE id = ${id}::uuid`;
  return row[0]?.s ?? null;
}
async function vehicleStatus(id: string) {
  const row = await prisma.$queryRaw<
    Array<{ s: string | null }>
  >`SELECT status::text AS s FROM vehicles WHERE id = ${id}::uuid`;
  return row[0]?.s ?? null;
}

/** Fuerza un valor de status viejo con SQL directo (los triggers de status no dependen de esta columna). */
async function setStatus(table: 'employees' | 'vehicles', ids: string[], value: string) {
  if (table === 'employees') {
    await prisma.$executeRaw`UPDATE employees SET status = ${value}::status_type WHERE id = ANY(${ids}::uuid[])`;
  } else {
    await prisma.$executeRaw`UPDATE vehicles SET status = ${value}::status_type WHERE id = ANY(${ids}::uuid[])`;
  }
}

async function addDoc(
  kind: 'Persona' | 'Equipos',
  resourceId: string,
  typeId: string,
  data: {
    validity?: Date | null;
    period?: string | null;
    state?: 'presentado' | 'aprobado' | 'rechazado' | 'vencido';
  } = {}
) {
  const row = {
    state: data.state ?? 'presentado',
    document_path: `it/${suffix}/${randomUUID()}.pdf`,
    validity: data.validity ?? null,
    period: data.period ?? null,
  };
  if (kind === 'Persona') {
    const updated = await prisma.documents_employees.updateMany({
      where: { applies: resourceId, id_document_types: typeId },
      data: row,
    });
    if (updated.count === 0)
      await prisma.documents_employees.create({ data: { applies: resourceId, id_document_types: typeId, ...row } });
  } else {
    const updated = await prisma.documents_equipment.updateMany({
      where: { applies: resourceId, id_document_types: typeId },
      data: row,
    });
    if (updated.count === 0)
      await prisma.documents_equipment.create({ data: { applies: resourceId, id_document_types: typeId, ...row } });
  }
}

/** Un documento vigente por cada tipo global obligatorio aplicable a recursos activos. */
async function coverGlobals(kind: 'Persona' | 'Equipos', resourceId: string) {
  const globals = await prisma.document_types.findMany({
    where: { company_id: null, applies: kind, is_active: true, mandatory: true, down_document: { not: true } },
    select: { id: true, is_it_montlhy: true },
  });
  for (const g of globals) {
    await addDoc(kind, resourceId, g.id, {
      validity: future(),
      period: g.is_it_montlhy ? arCurrentPeriod(new Date()) : null,
    });
  }
}

const baseType = { multiresource: false, mandatory: true, explired: false, special: false };

describe.skipIf(!RUN)('refreshDocumentStatus y job documents-status (integración)', () => {
  const ids = { e1: '', e2: '', e3: '', e4: '', e5: '', v1: '', v2: '' };
  const types = { base: '', exp: '', pos: '', monthly: '', cond: '' };
  let posA = '';
  let posB = '';
  let customer = '';

  beforeAll(async () => {
    prisma = (await import('@/shared/lib/prisma')).prisma;
    const city = await ensureCity(prisma as never);
    const country = await ensureCountry(prisma as never);
    const company = await prisma.company.create({
      data: {
        company_name: `Status IT ${suffix}`,
        description: 'empresa de prueba',
        contact_email: 'status-it@alphataco.local',
        contact_phone: '+542991234567',
        address: 'Calle 1',
        city: city.id,
        country: 'argentina',
        industry: 'Petroleo',
        company_cuit: `ST-${suffix}`,
      },
      select: { id: true },
    });
    companyId = company.id;

    for (const n of ['A', 'B']) {
      const p = await prisma.company_positions.create({
        data: { name: `Pos ${n} ${suffix}`, is_active: true, company_id: companyId },
        select: { id: true },
      });
      created.positions.push(p.id);
      if (n === 'A') posA = p.id;
      else posB = p.id;
    }
    const k = await prisma.customers.create({
      data: {
        name: `Cliente ${suffix}`,
        cuit: BigInt(30_000_000_000 + Math.floor(Math.random() * 1e9)),
        company_id: companyId,
      },
      select: { id: true },
    });
    customer = k.id;

    const mkType = async (name: string, data: Partial<Prisma.document_typesUncheckedCreateInput> = {}) => {
      const t = await prisma.document_types.create({
        data: { ...baseType, applies: 'Persona', name: `${name} ${suffix}`, company_id: companyId, ...data },
        select: { id: true },
      });
      created.types.push(t.id);
      return t.id;
    };
    types.base = await mkType('Base');
    types.exp = await mkType('Con vencimiento', { explired: true });
    types.monthly = await mkType('Mensual', { is_it_montlhy: true });
    types.pos = await mkType('Por posición', {
      special: true,
      conditions: selectionsToConditionsJson({ companyPosition: [posA] }, 'Persona', {}) as Prisma.InputJsonValue[],
    });

    let seq = 0;
    const mkEmployee = async (position: string) => {
      seq += 1;
      const e = await prisma.employees.create({
        data: {
          company_id: companyId,
          lastname: 'StatusIT',
          firstname: `Emp${seq}`,
          cuil: `ST-${suffix}-${seq}`,
          document_number: `${suffix}${seq}`,
          birthplace: country.id,
          street: 'x',
          street_number: '1',
          province: city.province_id,
          phone: '0',
          file: `ST${suffix}-${seq}`,
          date_of_admission: new Date(),
          allocated_to: [],
          company_position: position,
        },
        select: { id: true },
      });
      created.employees.push(e.id);
      return e.id;
    };
    const period = arCurrentPeriod(new Date());
    const previous = arCurrentPeriod(new Date(Date.now() - 45 * DAY));

    // e1 (posB): todo vigente → Completo
    ids.e1 = await mkEmployee(posB);
    await coverGlobals('Persona', ids.e1);
    await addDoc('Persona', ids.e1, types.base);
    await addDoc('Persona', ids.e1, types.exp, { validity: future() });
    await addDoc('Persona', ids.e1, types.monthly, { period });

    // e2 (posA): igual que e1 pero sin el documento de su posición → Incompleto
    ids.e2 = await mkEmployee(posA);
    await coverGlobals('Persona', ids.e2);
    await addDoc('Persona', ids.e2, types.base);
    await addDoc('Persona', ids.e2, types.exp, { validity: future() });
    await addDoc('Persona', ids.e2, types.monthly, { period });

    // e3 (posB): documento con vencimiento vencido → Completo con doc vencida
    ids.e3 = await mkEmployee(posB);
    await coverGlobals('Persona', ids.e3);
    await addDoc('Persona', ids.e3, types.base);
    await addDoc('Persona', ids.e3, types.exp, { validity: past() });
    await addDoc('Persona', ids.e3, types.monthly, { period });

    // e4 (posB): el mensual es del período anterior → no cubre el corriente → Incompleto
    ids.e4 = await mkEmployee(posB);
    await coverGlobals('Persona', ids.e4);
    await addDoc('Persona', ids.e4, types.base);
    await addDoc('Persona', ids.e4, types.exp, { validity: future() });
    await addDoc('Persona', ids.e4, types.monthly, { period: previous });

    // e5 (posB): cubierto; se usa para afectarlo a un cliente
    ids.e5 = await mkEmployee(posB);
    await coverGlobals('Persona', ids.e5);
    await addDoc('Persona', ids.e5, types.base);
    await addDoc('Persona', ids.e5, types.exp, { validity: future() });
    await addDoc('Persona', ids.e5, types.monthly, { period });

    // Equipos: un tipo condicionado por `condition = operativo`
    const category = await prisma.types_of_vehicles.create({
      data: { name: `Categoría ${suffix}` },
      select: { id: true },
    });
    created.vehicleCategories.push(category.id as never);
    const vType = await prisma.type.create({
      data: { name: `Tipo ${suffix}`, company_id: companyId },
      select: { id: true },
    });
    created.vehicleTypes.push(vType.id as never);
    const cond = await prisma.document_types.create({
      data: {
        ...baseType,
        applies: 'Equipos',
        name: `Por condición ${suffix}`,
        company_id: companyId,
        special: true,
        conditions: selectionsToConditionsJson({ condition: ['operativo'] }, 'Equipos', {}) as Prisma.InputJsonValue[],
      },
      select: { id: true },
    });
    created.types.push(cond.id);
    types.cond = cond.id;
    let vseq = 0;
    const mkVehicle = async (condition: 'operativo' | 'no_operativo') => {
      vseq += 1;
      const v = await prisma.vehicles.create({
        data: {
          company_id: companyId,
          type_of_vehicle: category.id,
          type: vType.id,
          engine: 'x',
          year: '2020',
          domain: `ST${suffix}${vseq}`,
          condition,
        },
        select: { id: true },
      });
      created.vehicles.push(v.id);
      return v.id;
    };
    ids.v1 = await mkVehicle('operativo'); // exige el tipo por condición y no lo tiene → Incompleto
    ids.v2 = await mkVehicle('no_operativo'); // no lo exige → Completo
    await coverGlobals('Equipos', ids.v1);
    await coverGlobals('Equipos', ids.v2);
  }, 120_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  it('(a) calcula y escribe el status correcto: condiciones, vencidos, faltantes y mensual', async () => {
    const { refreshDocumentStatus } = await import('./document-status.server');
    await setStatus('employees', created.employees, 'Avalado');
    await setStatus('vehicles', created.vehicles, 'Avalado');

    const emp = await refreshDocumentStatus(prisma, 'Persona', { companyId });
    expect(emp.evaluated).toBe(created.employees.length);
    expect(emp.changed).toBe(created.employees.length);
    expect(await employeeStatus(ids.e1)).toBe(status.ok);
    expect(await employeeStatus(ids.e2)).toBe(status.incomplete);
    expect(await employeeStatus(ids.e3)).toBe(status.expired);
    expect(await employeeStatus(ids.e4)).toBe(status.incomplete);

    const veh = await refreshDocumentStatus(prisma, 'Equipos', { companyId });
    expect(veh.evaluated).toBe(created.vehicles.length);
    expect(await vehicleStatus(ids.v1)).toBe(status.incomplete);
    expect(await vehicleStatus(ids.v2)).toBe(status.ok);
  });

  it('(b) es idempotente: la segunda corrida no cambia nada y sólo se escribe lo que cambia', async () => {
    const { refreshDocumentStatus } = await import('./document-status.server');
    const again = await refreshDocumentStatus(prisma, 'Persona', { companyId });
    expect(again.changed).toBe(0);
    expect((await refreshDocumentStatus(prisma, 'Equipos', { companyId })).changed).toBe(0);

    // Por ids: ensucia uno solo y se corrige sólo ese.
    await setStatus('employees', [ids.e1], 'Incompleto');
    const some = await refreshDocumentStatus(prisma, 'Persona', { ids: [ids.e1, ids.e2, 'no-es-uuid'] });
    expect(some).toEqual({ evaluated: 2, changed: 1 });
    expect(await employeeStatus(ids.e1)).toBe(status.ok);
  });

  it('(c) cambiar un atributo o una pivote cambia el status sólo cuando se refresca el recurso', async () => {
    const { refreshDocumentStatus, refreshResourceStatus } = await import('./document-status.server');

    // Tipo condicionado por cliente: sólo se exige a los afectados al cliente.
    const custType = await prisma.document_types.create({
      data: {
        ...baseType,
        applies: 'Persona',
        name: `Por cliente ${suffix}`,
        company_id: companyId,
        special: true,
        conditions: selectionsToConditionsJson(
          { contractorEmployee: [customer] },
          'Persona',
          {}
        ) as Prisma.InputJsonValue[],
      },
      select: { id: true },
    });
    created.types.push(custType.id);
    await refreshDocumentStatus(prisma, 'Persona', { ids: [ids.e5], companyId });
    expect(await employeeStatus(ids.e5)).toBe(status.ok);

    // Afectar a un cliente (pivote sin trigger): el cache queda viejo hasta el refresh del escritor.
    await prisma.contractor_employee.create({ data: { employee_id: ids.e5, contractor_id: customer } });
    expect(await employeeStatus(ids.e5)).toBe(status.ok);
    expect(await refreshResourceStatus(prisma, 'Persona', companyId, ids.e5)).toEqual({ evaluated: 1, changed: 1 });
    expect(await employeeStatus(ids.e5)).toBe(status.incomplete);

    // Desafectar: vuelve a Completo recién con el refresh.
    await prisma.contractor_employee.deleteMany({ where: { employee_id: ids.e5 } });
    expect(await employeeStatus(ids.e5)).toBe(status.incomplete);
    expect((await refreshResourceStatus(prisma, 'Persona', companyId, ids.e5)).changed).toBe(1);
    expect(await employeeStatus(ids.e5)).toBe(status.ok);

    // e2 (posA) estaba Incompleto por no tener el documento de su posición. Pasa a posB: ya no se
    // le exige. (Con los triggers legacy todavía activos, `company_position` ya recalcula solo;
    // el refresh deja el mismo valor y es idempotente.)
    await prisma.employees.update({ where: { id: ids.e2 }, data: { company_position: posB } });
    await refreshResourceStatus(prisma, 'Persona', companyId, ids.e2);
    expect(await employeeStatus(ids.e2)).toBe(status.ok);

    // v1 (operativo) pasa a no_operativo: `condition` no está en la guarda de los triggers legacy,
    // así que el cache queda viejo hasta el refresh.
    await prisma.vehicles.update({ where: { id: ids.v1 }, data: { condition: 'no_operativo' } });
    expect(await vehicleStatus(ids.v1)).toBe(status.incomplete);
    expect(await refreshResourceStatus(prisma, 'Equipos', companyId, ids.v1)).toEqual({ evaluated: 1, changed: 1 });
    expect(await vehicleStatus(ids.v1)).toBe(status.ok);
  });

  it('(d) el job corre por empresa, reporta changed y la segunda corrida del día se saltea', async () => {
    const { runDocumentsStatusJob } = await import('@/features/Jobs/jobs/documents-status');
    await setStatus('employees', [ids.e3, ids.e4], 'Completo');
    const date = '2099-04-01';

    const first = await runDocumentsStatusJob({ date });
    const unit = first.units.find((u) => u.companyId === companyId);
    expect(unit?.status).toBe('ok');
    expect(unit?.metadata).toMatchObject({ employees: { changed: 2 }, equipment: { changed: 0 } });
    expect(await employeeStatus(ids.e3)).toBe(status.expired);
    expect(await employeeStatus(ids.e4)).toBe(status.incomplete);

    const second = await runDocumentsStatusJob({ date });
    expect(second.units.find((u) => u.companyId === companyId)).toMatchObject({
      status: 'skipped',
      reason: 'ya procesada hoy',
    });

    // Con otra fecha de negocio vuelve a correr y, como el cache está al día, cambia 0.
    const third = await runDocumentsStatusJob({ date: '2099-04-02' });
    expect(third.units.find((u) => u.companyId === companyId)?.metadata).toMatchObject({ changed: 0 });
    await prisma.jobs_runs.deleteMany({ where: { job: 'documents-status', run_key: { endsWith: date } } });
    await prisma.jobs_runs.deleteMany({ where: { job: 'documents-status', run_key: { contains: '2099-04' } } });
  }, 120_000);
});
