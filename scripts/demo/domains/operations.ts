/**
 * Operaciones: partes diarios de un año hasta pasado mañana (lunes a sabado), sus lineas con
 * personal y equipos asignados, remitos, y los pedidos (preparte) en todos sus estados.
 *
 * El personal de cada linea sale de los empleados que ese dia TRABAJAN segun su diagrama y
 * estan asignados al cliente; los equipos, de los vehiculos operativos del tipo que pide el
 * item y asignados al cliente. Asi el tablero de hoy, el uso de flota/personal y los desvios de
 * Sala de Control son coherentes.
 *
 * Jornadas: los items por hora o por dia son de 12 horas, con turno dia o noche y roles
 * (chofer/ayudante de dia o de noche); el resto son de 8 horas, de dia y sin rol, como las
 * carga la app.
 *
 * Se inserta sin triggers: los de historial escribirian una fila de `dailyreportrows_history`
 * por linea y por cada recurso vinculado.
 */
import type { Prisma } from '../../../src/generated/prisma/client.ts';
import { addPdf, insertMany, withoutTriggers, type Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';
import { toDmy } from '../lib/dates.ts';
import { REMIT_BUCKET, REMIT_PREFIX, pathSegment } from '../lib/paths.ts';
import { pick, weighted } from '../lib/random.ts';
import { ACTIVE_CUSTOMERS, ITEM_EQUIPMENT, customerId, type ContractDef, type CustomerDef, type ItemDef } from '../data/customers.ts';
import type { DemoEmployee } from './employees.ts';
import type { DemoOtherEquipment, DemoVehicle } from './vehicles.ts';
import { isWorking, type DiagramGrid } from './diagrams.ts';

export const OPERATIONS_FROM = -365;
export const OPERATIONS_TO = 2;

type RowStatus = 'pendiente' | 'sin_recursos_asignados' | 'ejecutado' | 'reprogramado' | 'cancelado' | 'en_certificacion';

export interface DemoRow {
  id: string;
  offset: number;
  customerKey: string;
  contractKey: string;
  item: ItemDef;
  status: RowStatus;
  quantity: number;
  typeService: 'mensual' | 'adicional' | 'adicional_permanente';
  sector: string;
  area: string;
  twelveHours: boolean;
  startHour: number;
  endHour: number;
}

const OTHER_PREFIX = 'other:';
const CANCEL_REASONS = ['El cliente suspendió la tarea', 'Condiciones climáticas (viento)', 'Locación no habilitada', 'Cambio de programa del cliente'];

function quantityFor(ctx: Ctx, unit: number): number {
  const { faker } = ctx;
  switch (unit) {
    case 1:
      return faker.number.int({ min: 6, max: 12 });
    case 4:
      return faker.number.int({ min: 1, max: 3 });
    case 5:
      return faker.number.int({ min: 120, max: 420 });
    case 8:
      return faker.number.int({ min: 24, max: 30 });
    default:
      return 1;
  }
}

function contractActiveOn(ctx: Ctx, contract: ContractDef, offset: number): boolean {
  const from = ctx.cal.monthRange(contract.startMonthsAgo).from;
  const to = ctx.cal.monthRange(contract.startMonthsAgo - contract.months).to;
  return offset >= from && offset <= to;
}

function rowStatus(ctx: Ctx, offset: number): RowStatus {
  if (offset < 0) return weighted(ctx.faker, [['ejecutado', 88], ['cancelado', 6], ['reprogramado', 6]] as const);
  if (offset === 0) return weighted(ctx.faker, [['pendiente', 55], ['ejecutado', 40], ['cancelado', 5]] as const);
  return weighted(ctx.faker, [['pendiente', 60], ['sin_recursos_asignados', 40]] as const);
}

function time(hour: number): Date {
  return new Date(`1970-01-01T${String(hour % 24).padStart(2, '0')}:00:00Z`);
}

/** Recursos del dia: lo que ya salio a trabajar no se vuelve a asignar. */
interface DayState {
  offset: number;
  usedEmployees: Set<string>;
  usedEquipment: Set<string>;
}

interface Pools {
  drivers: DemoEmployee[];
  helpers: DemoEmployee[];
  vehicles: DemoVehicle[];
  others: DemoOtherEquipment[];
  grid: DiagramGrid;
}

interface Relations {
  employees: Prisma.dailyreportemployeerelationsCreateManyInput[];
  equipment: Prisma.dailyreportequipmentrelationsCreateManyInput[];
  rigs: Prisma.dailyreport_customer_equipment_relationsCreateManyInput[];
  remitos: Prisma.remitosCreateManyInput[];
  remitDocs: Prisma.remito_documentsCreateManyInput[];
}

/**
 * Equipo de la linea. Casi siempre uno operativo asignado al cliente; a veces uno prestado de
 * otro contrato, que es el desvio "equipo no asignado" de Sala de Control.
 */
function assignEquipment(ctx: Ctx, day: DayState, pools: Pools, customer: CustomerDef, item: ItemDef, rowId: string, rel: Relations): void {
  const { cal, faker } = ctx;
  const needed = ITEM_EQUIPMENT[item.key];
  if (!needed || !(item.needsEquipment ?? true)) return;
  let equipmentId: string | null = null;
  if (needed.startsWith(OTHER_PREFIX)) {
    const kind = needed.slice(OTHER_PREFIX.length);
    const candidate = pools.others.find((o) => o.type === kind && !day.usedEquipment.has(o.id));
    if (candidate) {
      equipmentId = candidate.id;
      rel.equipment.push({ daily_report_row_id: rowId, other_equipment_id: candidate.id, created_at: cal.at(day.offset, 6) });
    }
  } else {
    const pool = pools.vehicles.filter((v) => v.type === needed && v.condition === 'operativo' && !day.usedEquipment.has(v.id));
    const assigned = pool.filter((v) => v.customers.includes(customerId(customer)));
    const borrow = !assigned.length || faker.datatype.boolean({ probability: 0.08 });
    const vehicle = !borrow ? pick(faker, assigned) : pool.length ? pick(faker, pool) : null;
    if (vehicle) {
      equipmentId = vehicle.id;
      rel.equipment.push({ daily_report_row_id: rowId, equipment_id: vehicle.id, created_at: cal.at(day.offset, 6) });
    }
  }
  if (equipmentId) day.usedEquipment.add(equipmentId);
}

/**
 * Chofer (y a veces ayudante) que trabaje ese dia y este asignado al cliente. Devuelve false si
 * no hay nadie disponible. En jornada de 8 horas la app no usa roles.
 */
function assignPersonnel(
  ctx: Ctx,
  day: DayState,
  pools: Pools,
  customer: CustomerDef,
  rowId: string,
  shift: 'dia' | 'noche' | null,
  rel: Relations
): boolean {
  const { cal, faker } = ctx;
  const available = (list: DemoEmployee[]) =>
    list.filter((e) => !day.usedEmployees.has(e.id) && isWorking(pools.grid, e.id, day.offset) && e.customers.includes(customerId(customer)));
  const drivers = available(pools.drivers);
  if (!drivers.length) return false;
  const driver = pick(faker, drivers);
  day.usedEmployees.add(driver.id);
  rel.employees.push({
    daily_report_row_id: rowId,
    employee_id: driver.id,
    role: shift === null ? null : shift === 'dia' ? 'chofer_dia' : 'chofer_noche',
    created_at: cal.at(day.offset, 6),
  });
  if (faker.datatype.boolean({ probability: 0.35 })) {
    const [helper] = available(pools.helpers);
    if (helper) {
      day.usedEmployees.add(helper.id);
      rel.employees.push({
        daily_report_row_id: rowId,
        employee_id: helper.id,
        role: shift === null ? null : shift === 'dia' ? 'ayudante_dia' : 'ayudante_noche',
        created_at: cal.at(day.offset, 6),
      });
    }
  }
  return true;
}

/** Remito de un viaje ejecutado; los de las ultimas tres semanas llevan el PDF firmado. */
async function addRemit(
  ctx: Ctx,
  seq: number,
  customer: CustomerDef,
  contract: ContractDef,
  item: ItemDef,
  rowId: string,
  offset: number,
  quantity: number,
  rel: Relations
): Promise<string> {
  const { cal } = ctx;
  const remitNumber = `R-0003-${String(10000 + seq).padStart(8, '0')}`;
  const remitId = demoId('remito', remitNumber);
  rel.remitos.push({ id: remitId, daily_report_row_id: rowId, remit_number: remitNumber, is_linked: true, created_at: cal.at(offset, 19) });
  if (offset >= -20) {
    const key = `${REMIT_PREFIX}/${pathSegment(customer.name)}/remito-${remitNumber}.pdf`;
    rel.remitDocs.push({ remit_id: remitId, document_path: key, document_name: `Remito ${remitNumber}.pdf`, created_at: cal.at(offset, 19) });
    await addPdf(ctx, REMIT_BUCKET, key, {
      title: `Remito ${remitNumber}`,
      fields: [
        ['Cliente', customer.name],
        ['Contrato', `${contract.number} - ${contract.name}`],
        ['Servicio', item.name],
        ['Fecha', toDmy(cal.ymd(offset))],
        ['Cantidad', `${quantity}`],
      ],
      body: `${item.description}. Conforme cliente: ${customer.contact.name}.`,
      reference: remitNumber,
    });
  }
  return remitNumber;
}

export async function seedOperations(
  ctx: Ctx,
  employees: DemoEmployee[],
  vehicles: DemoVehicle[],
  others: DemoOtherEquipment[],
  grid: DiagramGrid
): Promise<DemoRow[]> {
  const { tx, cal, faker, company } = ctx;
  const headers: Prisma.dailyreportCreateManyInput[] = [];
  const rows: Prisma.dailyreportrowsCreateManyInput[] = [];
  const rel: Relations = { employees: [], equipment: [], rigs: [], remitos: [], remitDocs: [] };
  const demoRows: DemoRow[] = [];
  const pools: Pools = {
    drivers: employees.filter((e) => ['chofer', 'operador'].includes(e.position)),
    helpers: employees.filter((e) => e.position === 'ayudante'),
    vehicles: vehicles.filter((v) => v.active),
    others,
    grid,
  };
  /** Abonos mensuales ya registrados (`contrato:item:YYYY-MM`): uno por mes. */
  const monthlyDone = new Set<string>();
  let remitSeq = 0;

  for (let offset = OPERATIONS_FROM; offset <= OPERATIONS_TO; offset++) {
    const weekday = cal.weekday(offset);
    if (weekday === 0) continue;
    const headerId = demoId('dailyreport', cal.ymd(offset));
    const day: DayState = { offset, usedEmployees: new Set(), usedEquipment: new Set() };
    let dayHasRows = false;

    for (const customer of ACTIVE_CUSTOMERS) {
      for (const contract of customer.contracts) {
        if (!contractActiveOn(ctx, contract, offset)) continue;
        for (const item of contract.items) {
          const isMonthly = item.unit === 3;
          let count = weekday === 6 ? Math.ceil(item.perDay / 2) : item.perDay;
          if (isMonthly) {
            // El abono mensual se registra una vez, el primer dia habil del mes.
            const monthKey = `${contract.key}:${item.key}:${cal.ymd(offset).slice(0, 7)}`;
            count = monthlyDone.has(monthKey) ? 0 : 1;
            monthlyDone.add(monthKey);
          }
          for (let n = 0; n < count; n++) {
            dayHasRows = true;
            const rowId = demoId('dr_row', `${cal.ymd(offset)}:${contract.key}:${item.key}:${n}`);
            let status = rowStatus(ctx, offset);
            const typeService: DemoRow['typeService'] = isMonthly ? 'mensual' : weighted(faker, [['adicional', 75], ['adicional_permanente', 25]] as const);
            const quantity = quantityFor(ctx, item.unit);
            const twelveHours = item.unit === 1 || item.unit === 2;
            const shift = twelveHours ? weighted(faker, [['dia', 80], ['noche', 20]] as const) : null;
            const startHour = shift === 'noche' ? 19 : pick(faker, [6, 7, 8]);
            const endHour = startHour + (twelveHours ? 12 : 8);
            const sector = pick(faker, customer.sectors);
            const area = pick(faker, customer.areas);

            if (status !== 'sin_recursos_asignados' && status !== 'cancelado') {
              assignEquipment(ctx, day, pools, customer, item, rowId, rel);
              if ((item.needsPersonnel ?? true) && !assignPersonnel(ctx, day, pools, customer, rowId, shift, rel) && offset > 0) {
                status = 'sin_recursos_asignados';
              }
            }
            if (customer.rigs.length && faker.datatype.boolean({ probability: 0.5 })) {
              rel.rigs.push({ daily_report_row_id: rowId, customer_equipment_id: demoId('rig', `${customer.key}:${pick(faker, customer.rigs).name}`) });
            }
            const isTrip = item.unit === 4 || item.unit === 5 || item.unit === 8;
            // El remito vive solo en la tabla `remitos` (addRemit lo crea con su documento)
            if (status === 'ejecutado' && isTrip) await addRemit(ctx, ++remitSeq, customer, contract, item, rowId, offset, quantity, rel);

            rows.push({
              id: rowId,
              daily_report_id: headerId,
              customer_id: customerId(customer),
              service_id: demoId('contract', contract.key),
              item_id: demoId('item', `${contract.key}:${item.key}`),
              quantity,
              start_time: time(startHour),
              end_time: time(endHour),
              description: status === 'ejecutado' ? `${item.name} en ${sector.toLowerCase()}` : null,
              status,
              working_day: twelveHours ? 'jornada 12 horas' : 'jornada 8 horas',
              shift_12h: shift,
              sector_service_id: demoId('service_sector', `${contract.key}:${sector}`),
              areas_service_id: demoId('service_area', `${contract.key}:${area}`),
              cancel_reason: status === 'cancelado' ? pick(faker, CANCEL_REASONS) : null,
              type_service: typeService,
              completed_day: status === 'ejecutado' ? true : null,
              created_at: cal.at(offset - 1, 17),
              updated_at: cal.at(Math.min(offset, 0), 20),
            });
            demoRows.push({ id: rowId, offset, customerKey: customer.key, contractKey: contract.key, item, status, quantity, typeService, sector, area, twelveHours, startHour, endHour });
          }
        }
      }
    }

    if (dayHasRows) {
      headers.push({
        id: headerId,
        date: cal.day(offset),
        creation_date: cal.day(offset - 1),
        company_id: company.id,
        is_active: true,
        status: offset >= 0 ? 'abierto' : weighted(faker, [['cerrado_completo', 92], ['cerrado_incompleto', 8]] as const),
        created_at: cal.at(offset - 1, 17),
        updated_at: cal.at(Math.min(offset, 0), 20),
      });
    }
  }

  await withoutTriggers(tx, async () => {
    await insertMany(headers, (c) => tx.dailyreport.createMany({ data: c }));
    await insertMany(rows, (c) => tx.dailyreportrows.createMany({ data: c }), 1000);
    await insertMany(rel.employees, (c) => tx.dailyreportemployeerelations.createMany({ data: c }), 3000);
    await insertMany(rel.equipment, (c) => tx.dailyreportequipmentrelations.createMany({ data: c }), 3000);
    await insertMany(rel.rigs, (c) => tx.dailyreport_customer_equipment_relations.createMany({ data: c }), 3000);
    await insertMany(rel.remitos, (c) => tx.remitos.createMany({ data: c }), 3000);
    await tx.remito_documents.createMany({ data: rel.remitDocs });
  });

  await seedPrepartes(ctx, demoRows);
  ctx.log(
    `${headers.length} partes diarios, ${rows.length} líneas, ${rel.employees.length + rel.equipment.length} recursos asignados, ${rel.remitos.length} remitos`
  );
  return demoRows;
}

/**
 * Pedidos: parte de las lineas adicionales nacieron de un pedido confirmado (quedan
 * vinculadas por `preparte_id` y comparten sector, area y horario); el resto son pedidos
 * cancelados, rechazados, reprogramados, vencidos y pendientes de los proximos dias.
 */
async function seedPrepartes(ctx: Ctx, rows: DemoRow[]): Promise<void> {
  const { tx, cal, faker, company, actorId } = ctx;
  const prepartes: Prisma.preparteCreateManyInput[] = [];
  const links: Array<{ rowId: string; preparteId: string }> = [];
  let seq = 0;
  const findCustomer = (key: string) => ACTIVE_CUSTOMERS.find((c) => c.key === key) as CustomerDef;
  const hhmm = (hour: number) => `${String(hour % 24).padStart(2, '0')}:00`;

  const base = (row: DemoRow, created: number, status: Prisma.preparteCreateManyInput['status']) => {
    const customer = findCustomer(row.customerKey);
    seq++;
    return {
      id: demoId('preparte', `${row.id}:${status}`),
      cliente_id: customerId(customer),
      contrato_id: demoId('contract', row.contractKey),
      item: demoId('item', `${row.contractKey}:${row.item.key}`),
      tipo: row.typeService,
      jornada: row.twelveHours ? 'jornada 12 horas' : 'jornada 8 horas',
      start_time: hhmm(row.startHour),
      end_time: hhmm(row.endHour),
      solicitante: customer.contact.name,
      observaciones: faker.helpers.maybe(() => pick(faker, ['Ingresar por portería 2', 'Coordinar con el company man', 'Llevar EPP completo', 'Presentarse 30 min antes']), { probability: 0.4 }) ?? null,
      executionDate: cal.at(row.offset, row.startHour),
      requestDate: cal.at(created, 10),
      created_at: cal.at(created, 10),
      quantity: row.quantity,
      numero_pedido: `PED-${String(seq).padStart(4, '0')}`,
      company_id: company.id,
      sector_service_id: demoId('service_sector', `${row.contractKey}:${row.sector}`),
      areas_service_id: demoId('service_area', `${row.contractKey}:${row.area}`),
      equipos_cliente: customer.rigs.length ? demoId('rig', `${customer.key}:${customer.rigs[0].name}`) : null,
      status,
    } satisfies Prisma.preparteCreateManyInput;
  };

  for (const row of rows.filter((r) => r.typeService === 'adicional').sort((a, b) => a.offset - b.offset)) {
    const created = Math.min(row.offset - faker.number.int({ min: 1, max: 5 }), 0);
    const roll = faker.number.float({ min: 0, max: 1 });
    if (roll < 0.3 && row.status !== 'sin_recursos_asignados') {
      const p = { ...base(row, created, 'confirmado'), confirmed_by: actorId };
      prepartes.push(p);
      links.push({ rowId: row.id, preparteId: p.id });
    } else if (roll < 0.34) {
      prepartes.push({ ...base(row, created, 'cancelado'), cancel_reason: pick(faker, CANCEL_REASONS), cancelled_by: actorId });
    } else if (roll < 0.36) {
      prepartes.push({ ...base(row, created, 'rechazado'), rejected_reason: 'Sin equipo disponible para la fecha solicitada', rejected_by: actorId });
    } else if (roll < 0.38 && row.offset < 0) {
      prepartes.push({ ...base(row, created, 'reprogramado'), reprogram_reason: 'El cliente pidió pasarlo al día siguiente', reprogrammed_by: actorId });
    } else if (roll < 0.39 && row.offset < 0) {
      prepartes.push(base(row, created, 'vencido'));
    } else if (row.offset > 0 && roll < 0.6) {
      prepartes.push(base(row, created, 'pendiente'));
    }
  }
  await insertMany(prepartes, (c) => tx.preparte.createMany({ data: c }));
  // Un solo UPDATE y sin triggers: los de historial registrarian cada vinculo como un cambio.
  await withoutTriggers(tx, () =>
    tx.$executeRawUnsafe(
      `UPDATE dailyreportrows d SET preparte_id = v.preparte_id
         FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::uuid[]) AS preparte_id) v
        WHERE d.id = v.id`,
      links.map((l) => l.rowId),
      links.map((l) => l.preparteId)
    )
  );
  ctx.log(`${prepartes.length} pedidos (${links.length} confirmados y vinculados a partes)`);
}
