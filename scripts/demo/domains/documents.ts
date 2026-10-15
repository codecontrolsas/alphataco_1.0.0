/**
 * Documentacion de empleados, equipos y empresa, con un PDF por documento cargado.
 *
 * Los documentos obligatorios de empleados y equipos se INSERTAN aca, uno por recurso activo y
 * tipo obligatorio (una fila por documento PRESENTADO, como espera el motor de cumplimiento).
 * Los "no cargados" no tienen fila: el motor los cuenta como faltantes a partir de `document_types`.
 *
 * Reparto de los que vencen: ~12% vencidos, ~13% por vencer (<30 dias), ~62% vigentes,
 * ~10% sin cargar (faltantes) y ~3% rechazados. Los que no vencen: ~92% cargados, ~8% faltantes.
 */
import type { Prisma } from '../../../src/generated/prisma/client.ts';
import { DOC_TYPES, type DocTypeDef } from '../data/catalog.ts';
import { addPdf, type Ctx } from '../lib/ctx.ts';
import { toDmy } from '../lib/dates.ts';
import { demoId } from '../lib/ids.ts';
import { DOCUMENT_BUCKET, companyFolder, pathSegment } from '../lib/paths.ts';
import { pick, weighted } from '../lib/random.ts';
import type { DemoEmployee } from './employees.ts';
import type { DemoVehicle } from './vehicles.ts';

type Folder = 'persona' | 'equipos' | 'empresa';

function docPath(folder: Folder, owner: string | null, type: DocTypeDef, mark: string): string {
  const base = `${companyFolder()}/${folder}`;
  const file = `${pathSegment(type.name)}-(${mark}).pdf`;
  return owner ? `${base}/${owner}/${file}` : `${base}/${file}`;
}

type DocState = 'presentado' | 'vencido' | 'pendiente' | 'rechazado';

interface Outcome {
  state: DocState;
  /** Offset de vencimiento; null si el tipo no vence o el documento no tiene archivo. */
  expiry: number | null;
}

function outcomeFor(ctx: Ctx, type: DocTypeDef): Outcome {
  const { faker } = ctx;
  if (!type.expires) {
    return weighted(faker, [
      [{ state: 'presentado', expiry: null }, 92],
      [{ state: 'pendiente', expiry: null }, 8],
    ]);
  }
  const bucket = weighted(faker, [
    ['vencido', 12],
    ['por_vencer', 13],
    ['vigente', 62],
    ['pendiente', 10],
    ['rechazado', 3],
  ] as const);
  switch (bucket) {
    case 'vencido':
      return { state: 'vencido', expiry: -faker.number.int({ min: 1, max: 120 }) };
    case 'por_vencer':
      return { state: 'presentado', expiry: faker.number.int({ min: 0, max: 29 }) };
    case 'vigente':
      return { state: 'presentado', expiry: faker.number.int({ min: 30, max: type.validityDays ?? 365 }) };
    case 'rechazado':
      return { state: 'rechazado', expiry: faker.number.int({ min: 30, max: 200 }) };
    default:
      return { state: 'pendiente', expiry: null };
  }
}

const DENY_REASONS = [
  'El documento está ilegible',
  'Falta la firma del emisor',
  'La fecha de vencimiento no coincide',
  'Corresponde a otra persona/unidad',
];

/** Documento obligatorio ya resuelto: estado, vencimiento y archivo. */
interface ResolvedDoc {
  id: string;
  typeId: string;
  state: DocState;
  validity: Date | null;
  path: string;
  deny: string | null;
  policy: string | null;
  createdAt: Date;
}

/** Fila de documento mensual (no obligatorio): se inserta, no la genera ningun trigger. */
interface MonthlyDocRow {
  id: string;
  applies: string;
  id_document_types: string;
  period: string;
  state: 'presentado';
  document_path: string;
  user_id: string;
  created_at: Date;
}

/** Fecha de emision coherente con el vencimiento, nunca en el futuro. */
function issuedOffset(ctx: Ctx, type: DocTypeDef, expiry: number | null): number {
  if (expiry !== null && type.validityDays) return Math.min(-1, expiry - type.validityDays);
  return -ctx.faker.number.int({ min: 30, max: 900 });
}

interface ResourceDoc {
  folder: Folder;
  /** Carpeta del recurso: `<nombre>-(<documento>)`. */
  owner: string;
  /** Primer dia en que el recurso pudo tener el documento (su ingreso). */
  since: number;
  /** Campos propios del recurso que encabezan el PDF. */
  fields: Array<[string, string]>;
  reference: string;
}

/**
 * Estado final de un documento obligatorio, con su PDF. Devuelve null si el documento queda
 * "no cargado" (sin fila: el motor de cumplimiento lo cuenta como faltante).
 * Es el mismo recorrido para empleados y equipos: solo cambian el recurso y sus campos.
 */
async function resolveDocument(
  ctx: Ctx,
  docId: string,
  type: DocTypeDef,
  resource: ResourceDoc
): Promise<ResolvedDoc | null> {
  const { cal, faker } = ctx;
  const outcome = outcomeFor(ctx, type);
  if (outcome.state === 'pendiente') return null;
  const issued = Math.max(issuedOffset(ctx, type, outcome.expiry), resource.since);
  const policy = type.policy ? `POL-${faker.string.numeric(9)}` : null;
  const mark = outcome.expiry !== null ? toDmy(cal.ymd(outcome.expiry), '-') : 'v0';
  const path = docPath(resource.folder, resource.owner, type, mark);
  await addPdf(ctx, DOCUMENT_BUCKET, path, {
    title: type.name,
    fields: [
      ...resource.fields,
      ['Fecha de emisión', toDmy(cal.ymd(issued))],
      ['Vencimiento', outcome.expiry === null ? 'Sin vencimiento' : toDmy(cal.ymd(outcome.expiry))],
      policy
        ? ['N° de póliza', policy]
        : ['N° de documento', `${type.key.toUpperCase().slice(0, 3)}-${faker.string.numeric(8)}`],
    ],
    body: `${type.description}. Se deja constancia de la presentación de la documentación requerida.`,
    reference: `${resource.reference}/${type.key}`,
  });
  return {
    id: docId,
    typeId: demoId('doc_type', type.key),
    state: outcome.state,
    validity: outcome.expiry === null ? null : cal.at(outcome.expiry, 23, 59),
    path,
    deny: outcome.state === 'rechazado' ? pick(faker, DENY_REASONS) : null,
    policy,
    createdAt: cal.at(issued, 11),
  };
}

function employeeResource(emp: DemoEmployee): ResourceDoc {
  return {
    folder: 'persona',
    owner: `${pathSegment(`${emp.firstname} ${emp.lastname}`)}-(${emp.dni})`,
    since: emp.admission,
    fields: [
      ['Titular', `${emp.lastname}, ${emp.firstname}`],
      ['CUIL', emp.cuil],
      ['Legajo', emp.file],
    ],
    reference: emp.file,
  };
}

function vehicleResource(veh: DemoVehicle): ResourceDoc {
  return {
    folder: 'equipos',
    owner: `${pathSegment(veh.domain)}-(${veh.domain})`,
    since: -3650,
    fields: [
      ['Dominio', veh.domain],
      ['Unidad', `${veh.typeName} ${veh.brand} ${veh.model}`],
      ['Año', String(veh.year)],
      ['N° interno', veh.internNumber],
    ],
    reference: veh.domain,
  };
}

/** Documentos mensuales de un recurso: una fila y un PDF por periodo. */
async function monthlyDocs(
  ctx: Ctx,
  applies: string,
  resource: ResourceDoc,
  type: DocTypeDef,
  monthsAgo: number[],
  body: string
): Promise<MonthlyDocRow[]> {
  const { cal, faker } = ctx;
  const rows: MonthlyDocRow[] = [];
  for (const m of monthsAgo) {
    const period = cal.period(m);
    const path = docPath(resource.folder, resource.owner, type, period);
    rows.push({
      id: demoId('doc_monthly', `${applies}:${type.key}:${period}`),
      applies,
      id_document_types: demoId('doc_type', type.key),
      period,
      state: 'presentado',
      document_path: path,
      user_id: ctx.actorId,
      // Se carga los primeros dias del mes siguiente al periodo (nunca en el futuro).
      created_at: cal.at(Math.min(cal.monthRange(m - 1).from + faker.number.int({ min: 2, max: 6 }), 0), 10),
    });
    await addPdf(ctx, DOCUMENT_BUCKET, path, {
      title: `${type.name} ${period}`,
      fields: [...resource.fields, ['Período', period]],
      body,
      reference: `${resource.reference}/${type.key}/${period}`,
    });
  }
  return rows;
}

/** createMany en lotes para no armar una sentencia gigante. */
async function insertInBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>, size = 500): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

export async function seedDocuments(ctx: Ctx, employees: DemoEmployee[], vehicles: DemoVehicle[]): Promise<void> {
  const { tx, cal, faker } = ctx;
  // Obligatorios que aplican a cada recurso (los tipos del demo no tienen condiciones ni `down_document`).
  const mandatory = (applies: DocTypeDef['applies']) => DOC_TYPES.filter((d) => d.applies === applies && d.mandatory);
  const typeOf = (key: string) => DOC_TYPES.find((d) => d.key === key)!;

  // ── Empleados ───────────────────────────────────────────────────────────────
  // Solo recursos activos: ningun tipo del demo es `down_document`, asi que las bajas no los exigen.
  const empRows: Prisma.documents_employeesCreateManyInput[] = [];
  for (const emp of employees.filter((e) => e.active)) {
    for (const type of mandatory('Persona')) {
      const doc = await resolveDocument(
        ctx,
        demoId('doc_employee', `${emp.id}:${type.key}`),
        type,
        employeeResource(emp)
      );
      if (!doc) continue;
      empRows.push({
        id: doc.id,
        applies: emp.id,
        id_document_types: doc.typeId,
        state: doc.state,
        validity: doc.validity,
        document_path: doc.path,
        deny_reason: doc.deny,
        user_id: ctx.actorId,
        created_at: doc.createdAt,
      });
    }
  }
  await insertInBatches(empRows, (data) => tx.documents_employees.createMany({ data }));

  const empMonthly: MonthlyDocRow[] = [];
  for (const emp of employees.filter((e) => e.active && e.admission < -60)) {
    empMonthly.push(
      ...(await monthlyDocs(
        ctx,
        emp.id,
        employeeResource(emp),
        typeOf('recibo'),
        [1, 2],
        'Recibo de haberes del período indicado, firmado en conformidad por el empleado.'
      )),
      ...(await monthlyDocs(
        ctx,
        emp.id,
        employeeResource(emp),
        typeOf('art_nomina'),
        [1],
        'El empleado figura en la nómina vigente de la aseguradora de riesgos del trabajo.'
      ))
    );
  }
  await insertInBatches(empMonthly, (data) => tx.documents_employees.createMany({ data }));

  // ── Equipos ─────────────────────────────────────────────────────────────────
  const eqRows: Prisma.documents_equipmentCreateManyInput[] = [];
  for (const veh of vehicles.filter((v) => v.active)) {
    for (const type of mandatory('Equipos')) {
      const doc = await resolveDocument(
        ctx,
        demoId('doc_equipment', `${veh.id}:${type.key}`),
        type,
        vehicleResource(veh)
      );
      if (!doc) continue;
      eqRows.push({
        id: doc.id,
        applies: veh.id,
        id_document_types: doc.typeId,
        state: doc.state,
        validity: doc.validity,
        document_path: doc.path,
        deny_reason: doc.deny,
        policy_number: doc.policy,
        user_id: ctx.actorId,
        created_at: doc.createdAt,
      });
    }
  }
  await insertInBatches(eqRows, (data) => tx.documents_equipment.createMany({ data }));

  const eqMonthly: MonthlyDocRow[] = [];
  for (const veh of vehicles.filter((v) => v.active)) {
    eqMonthly.push(
      ...(await monthlyDocs(
        ctx,
        veh.id,
        vehicleResource(veh),
        typeOf('pago_seguro'),
        [1],
        'Comprobante de pago de la cuota mensual de la póliza de seguro de la unidad.'
      ))
    );
  }
  await insertInBatches(eqMonthly, (data) => tx.documents_equipment.createMany({ data }));

  // ── Empresa ─────────────────────────────────────────────────────────────────
  const companyDocs: Array<{
    id: string;
    applies: string;
    id_document_types: string;
    validity: string | null;
    state: DocState;
    document_path: string;
    period: string | null;
    user_id: string;
    created_at: Date;
  }> = [];
  for (const type of DOC_TYPES.filter((d) => d.applies === 'Empresa')) {
    const periods = type.monthly ? [1, 2, 3].map((m) => cal.period(m)) : [null];
    for (const period of periods) {
      // ART por vencer y habilitacion vencida: la pantalla de empresa tiene alertas que mostrar.
      const expiry =
        type.key === 'art_empresa'
          ? 18
          : type.key === 'habilitacion'
            ? -12
            : type.expires
              ? faker.number.int({ min: 60, max: type.validityDays ?? 365 })
              : null;
      const mark = period ?? (expiry !== null ? toDmy(cal.ymd(expiry), '-') : 'v0');
      const path = docPath('empresa', null, type, mark);
      companyDocs.push({
        id: demoId('doc_company', `${type.key}:${period ?? ''}`),
        applies: ctx.company.id,
        id_document_types: demoId('doc_type', type.key),
        validity: expiry === null ? null : toDmy(cal.ymd(expiry)),
        state: type.key === 'habilitacion' ? 'vencido' : 'presentado',
        document_path: path,
        period,
        user_id: ctx.actorId,
        created_at: cal.at(Math.min(expiry !== null && type.validityDays ? expiry - type.validityDays : -200, -1), 10),
      });
      await addPdf(ctx, DOCUMENT_BUCKET, path, {
        title: period ? `${type.name} ${period}` : type.name,
        fields: [
          ['Razón social', ctx.company.name],
          ['CUIT', ctx.company.cuit],
          ...(period ? ([['Período', period]] as Array<[string, string]>) : []),
          ['Vencimiento', expiry === null ? 'Sin vencimiento' : toDmy(cal.ymd(expiry))],
        ],
        body: `${type.description}.`,
        reference: `empresa/${type.key}${period ? `/${period}` : ''}`,
      });
    }
  }
  await tx.documents_company.createMany({ data: companyDocs });

  ctx.log(
    `documentos: ${empRows.length + empMonthly.length} de empleados, ${eqRows.length + eqMonthly.length} de equipos, ${companyDocs.length} de empresa (${ctx.files.length} PDFs)`
  );
}
