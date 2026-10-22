import type { Prisma } from '@/generated/prisma/client';
import { ensureCity, ensureCountry, ensureDefaultRole } from '@/test/db-fixtures';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Escritores de documentos en el modelo derivado (etapa E4), contra la base de pruebas
 * (`alphataco_test`, triggers legacy de documentos todavía activos):
 *   DATABASE_URL=postgresql://alphataco:<pass>@127.0.0.1:5432/alphataco_test \
 *     npx vitest run --no-file-parallelism src/features/Documentacion src/features/Seleccion
 *
 * Crea su propia empresa y la borra al terminar. Se simulan la sesión, la empresa activa, los
 * permisos y el storage (en memoria). Los empleados se crean ANTES que los tipos y los triggers
 * de `document_types` se deshabilitan durante la suite, para que sólo se vea lo que escribe el
 * código nuevo (los legacy de `documents_*` siguen activos: conviven hasta la migración M1).
 */

const COMPANY = 'e4000000-0000-4000-8000-000000000001';
const PROFILE = 'e4000000-0000-4000-8000-000000000002';

const stored = vi.hoisted(() => new Set<string>());

vi.mock('@/shared/lib/session', () => ({
  getSessionUserId: async () => 'e4000000-0000-4000-8000-000000000002',
  isSessionAnonymous: async () => false,
}));
vi.mock('@/shared/lib/tenant', () => ({
  getActiveCompanyId: async () => 'e4000000-0000-4000-8000-000000000001',
  assertCompanyAccess: async () => undefined,
}));
vi.mock('@/features/Permissions/actions/permissions.server', () => ({ checkPermissionServer: async () => true }));
vi.mock('@/shared/actions/auth.actions', () => ({
  requireServerAuthProfile: async () => ({
    id: 'e4000000-0000-4000-8000-000000000002',
    credentialId: 'e4000000-0000-4000-8000-000000000002',
    fullname: null,
    email: null,
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/shared/lib/storage', () => ({
  DOCUMENT_FILES_BUCKET: 'document-files',
  DOCUMENT_FILES_EXPIRED_BUCKET: 'document-files-expired',
  storageUpload: async (_bucket: string, path: string) => {
    stored.add(path);
    return { ok: true, data: { path } };
  },
  storageRemove: async (_bucket: string, paths: string[]) => {
    for (const p of paths) stored.delete(p);
    return { ok: true, data: null };
  },
  storageDownload: async () => ({ ok: true, data: new Blob(['x']) }),
  storageDownloadUrls: async () => ({ ok: true, data: [] }),
}));

const RUN = Boolean(process.env.DATABASE_URL);
const DAY = 86_400_000;
const future = () => new Date(Date.now() + 40 * DAY);
const past = () => new Date(Date.now() - 5 * DAY);
const suffix = randomUUID().replace(/-/g, '').slice(0, 10);

type Db = (typeof import('@/shared/lib/prisma'))['prisma'];
let prisma: Db;
let posA = '';
let posB = '';
let hierarchyId = '';
let diagramId = '';
let countryId = '';
let city: { id: bigint; province_id: bigint };
const emp: string[] = [];
const createdTypes: string[] = [];

const status = { ok: 'Completo', expired: 'Completo con doc vencida', incomplete: 'Incompleto' } as const;
const pdf = () => new File(['contenido'], 'documento.pdf', { type: 'application/pdf' });

async function cleanup() {
  const p = (await import('@/shared/lib/prisma')).prisma;
  await p.$executeRaw`ALTER TABLE document_types ENABLE TRIGGER USER`;
  const employees = await p.employees.findMany({ where: { company_id: COMPANY }, select: { id: true } });
  const ids = employees.map((e) => e.id);
  await p.pre_employees.deleteMany({ where: { company_id: COMPANY } });
  await p.documents_employees.deleteMany({ where: { applies: { in: ids } } });
  await p.employees.deleteMany({ where: { company_id: COMPANY } });
  await p.document_types.deleteMany({ where: { company_id: COMPANY } });
  await p.work_diagram.deleteMany({ where: { company_id: COMPANY } });
  await p.hierarchy.deleteMany({ where: { company_id: COMPANY } });
  await p.company_positions.deleteMany({ where: { company_id: COMPANY } });
  await p.profile.deleteMany({ where: { id: PROFILE } });
  await p.company.deleteMany({ where: { id: COMPANY } });
}

async function mkType(name: string, data: Partial<Prisma.document_typesUncheckedCreateInput> = {}) {
  const t = await prisma.document_types.create({
    data: {
      applies: 'Persona',
      name: `${name} ${suffix}`,
      company_id: COMPANY,
      mandatory: true,
      explired: false,
      special: false,
      multiresource: false,
      ...data,
    },
    select: { id: true },
  });
  createdTypes.push(t.id);
  return t.id;
}

async function mkEmployee(position: string, n: number) {
  const e = await prisma.employees.create({
    data: {
      company_id: COMPANY,
      lastname: 'WritersIT',
      firstname: `Emp${n}`,
      cuil: `WR-${suffix}-${n}`,
      document_number: `${suffix}${n}`,
      birthplace: countryId,
      street: 'x',
      street_number: '1',
      province: city.province_id,
      phone: '0',
      file: `WR${suffix}-${n}`,
      date_of_admission: new Date(),
      allocated_to: [],
      company_position: position,
    },
    select: { id: true },
  });
  return e.id;
}

async function employeeStatus(id: string) {
  const rows = await prisma.$queryRaw<
    Array<{ s: string | null }>
  >`SELECT status::text AS s FROM employees WHERE id = ${id}::uuid`;
  return rows[0]?.s ?? null;
}

async function refreshAll() {
  const { refreshDocumentStatus } = await import('../compliance/server/document-status.server');
  await refreshDocumentStatus(prisma, 'Persona', { companyId: COMPANY });
}

async function rowsOf(employeeId: string, typeId: string) {
  return prisma.documents_employees.findMany({ where: { applies: employeeId, id_document_types: typeId } });
}

async function addDoc(
  employeeId: string,
  typeId: string,
  data: { validity?: Date | null; period?: string | null; state?: 'presentado' | 'aprobado' | 'vencido' } = {}
) {
  return prisma.documents_employees.create({
    data: {
      applies: employeeId,
      id_document_types: typeId,
      state: data.state ?? 'presentado',
      document_path: `it/${suffix}/${randomUUID()}.pdf`,
      validity: data.validity ?? null,
      period: data.period ?? null,
    },
  });
}

function multiForm(typeId: string, ids: string[], extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append('file', pdf());
  fd.append('resource', 'empleado');
  fd.append('documentTypeId', typeId);
  fd.append('appliesIds', JSON.stringify(ids));
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
}

describe.skipIf(!RUN)('escritores de documentos sin filas pendientes (integración)', () => {
  beforeAll(async () => {
    prisma = (await import('@/shared/lib/prisma')).prisma;
    await cleanup();
    await ensureDefaultRole(prisma as never);
    city = await ensureCity(prisma as never);
    countryId = (await ensureCountry(prisma as never)).id;
    await prisma.company.create({
      data: {
        id: COMPANY,
        company_name: `Writers IT ${suffix}`,
        description: 'empresa de prueba',
        contact_email: 'writers-it@alphataco.local',
        contact_phone: '+542991234567',
        address: 'Calle 1',
        city: city.id,
        country: 'argentina',
        industry: 'Petroleo',
        company_cuit: `WR-${suffix}`,
      },
    });
    await prisma.profile.create({
      data: { id: PROFILE, credential_id: PROFILE, email: `writers-${suffix}@alphataco.local` },
    });
    posA = (
      await prisma.company_positions.create({
        data: { name: `Pos A ${suffix}`, is_active: true, company_id: COMPANY },
        select: { id: true },
      })
    ).id;
    posB = (
      await prisma.company_positions.create({
        data: { name: `Pos B ${suffix}`, is_active: true, company_id: COMPANY },
        select: { id: true },
      })
    ).id;
    hierarchyId = (
      await prisma.hierarchy.create({ data: { name: `Sector ${suffix}`, company_id: COMPANY }, select: { id: true } })
    ).id;
    diagramId = (
      await prisma.work_diagram.create({
        data: { name: `Diagrama ${suffix}`, company_id: COMPANY },
        select: { id: true },
      })
    ).id;

    // Empleados primero (los triggers legacy de alta no encuentran tipos propios todavía).
    // 0..5 posB (sin tipos que los diferencien), 6 y 7 posA, 8 posB.
    for (let n = 0; n < 9; n++) emp.push(await mkEmployee(n === 6 || n === 7 ? posA : posB, n));

    // Los triggers de document_types (legacy) generarían filas vacías: acá se prueba el código nuevo.
    await prisma.$executeRaw`ALTER TABLE document_types DISABLE TRIGGER USER`;
  }, 120_000);

  afterEach(async () => {
    await prisma.document_types.deleteMany({ where: { company_id: COMPANY } });
    createdTypes.length = 0;
    stored.clear();
  });

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  it('subir N=1 desde una exigencia faltante crea una fila presentado y deja el status al día', async () => {
    const { uploadDocumentForRequirement } = await import('./document-actions');
    const t1 = await mkType('Permanente');
    await refreshAll();
    expect(await employeeStatus(emp[0])).toBe(status.incomplete);
    expect(await rowsOf(emp[0], t1)).toHaveLength(0);

    const res = await uploadDocumentForRequirement({
      kind: 'employee',
      resourceId: emp[0],
      documentTypeId: t1,
      file: pdf(),
    });
    expect(res).toMatchObject({ ok: true, created: 1, updated: 0 });
    const rows = await rowsOf(emp[0], t1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: 'presentado', period: null, user_id: PROFILE });
    expect(rows[0].document_path).toBeTruthy();
    expect(await employeeStatus(emp[0])).toBe(status.ok);

    // Repetir: ya está vigente, no se pisa.
    const again = await uploadDocumentForRequirement({
      kind: 'employee',
      resourceId: emp[0],
      documentTypeId: t1,
      file: pdf(),
    });
    expect(again).toMatchObject({ ok: false, error: 'El documento ya ha sido subido anteriormente' });
    expect(await rowsOf(emp[0], t1)).toHaveLength(1);
  });

  it('subir N=1 reutiliza la fila vacía legacy y rechaza un tipo que no le aplica al recurso', async () => {
    const { uploadDocumentForRequirement } = await import('./document-actions');
    const t1 = await mkType('Permanente');
    const legacy = await prisma.documents_employees.create({
      data: { applies: emp[1], id_document_types: t1, state: 'pendiente' },
    });

    const res = await uploadDocumentForRequirement({
      kind: 'employee',
      resourceId: emp[1],
      documentTypeId: t1,
      file: pdf(),
    });
    expect(res).toMatchObject({ ok: true, created: 0, updated: 1 });
    const rows = await rowsOf(emp[1], t1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(legacy.id);
    expect(rows[0].state).toBe('presentado');

    const { selectionsToConditionsJson } = await import('../../TiposDocumentos/utils/conditionsMapper');
    const special = await mkType('Sólo posA', {
      special: true,
      conditions: selectionsToConditionsJson({ companyPosition: [posA] }, 'Persona', {}) as Prisma.InputJsonValue[],
    });
    const rejected = await uploadDocumentForRequirement({
      kind: 'employee',
      resourceId: emp[1],
      documentTypeId: special,
      file: pdf(),
    });
    expect(rejected).toMatchObject({ ok: false });
    expect(await rowsOf(emp[1], special)).toHaveLength(0);
  });

  it('multirrecurso: el vigente se saltea, el vencido se renueva, el vacío legacy se reutiliza y el ausente se crea', async () => {
    const { uploadMultiResourceDocument } = await import('./upload-multiresource-document');
    const t = await mkType('Con vencimiento', { explired: true, multiresource: true });
    const [a, b, c, d] = [emp[0], emp[1], emp[2], emp[3]];
    const current = await addDoc(a, t, { validity: future() });
    const expired = await addDoc(b, t, { validity: past() });
    const legacy = await prisma.documents_employees.create({
      data: { applies: d, id_document_types: t, state: 'pendiente' },
    });
    await refreshAll();
    expect(await employeeStatus(b)).toBe(status.expired);
    expect(await employeeStatus(c)).toBe(status.incomplete);

    const validity = future().toISOString();
    const res = await uploadMultiResourceDocument(multiForm(t, [a, b, c, d], { validity }));
    expect(res).toEqual({ ok: true, updated: 2, created: 1, skipped: 1 });

    const rowA = await rowsOf(a, t);
    expect(rowA).toHaveLength(1);
    expect(rowA[0].document_path).toBe(current.document_path);

    const rowB = await rowsOf(b, t);
    expect(rowB).toHaveLength(1);
    expect(rowB[0].id).toBe(expired.id);
    expect(rowB[0].state).toBe('presentado');
    expect(rowB[0].document_path).not.toBe(expired.document_path);

    const rowC = await rowsOf(c, t);
    expect(rowC).toHaveLength(1);
    const rowD = await rowsOf(d, t);
    expect(rowD).toHaveLength(1);
    expect(rowD[0].id).toBe(legacy.id);
    // Las N filas comparten el mismo archivo (sin batchId).
    expect(new Set([rowB[0].document_path, rowC[0].document_path, rowD[0].document_path]).size).toBe(1);

    for (const id of [a, b, c, d]) expect(await employeeStatus(id)).toBe(status.ok);
    expect(
      await prisma.documents_employees.count({ where: { applies: { in: [a, b, c, d] }, archived_at: { not: null } } })
    ).toBe(0);
  });

  it('multirrecurso mensual: el período corriente se saltea; el anterior no lo cubre y se crea otra fila', async () => {
    const { uploadMultiResourceDocument } = await import('./upload-multiresource-document');
    const { arCurrentPeriod } = await import('../compliance/dates');
    const t = await mkType('Mensual', { is_it_montlhy: true, multiresource: true });
    const period = arCurrentPeriod(new Date());
    const previous = arCurrentPeriod(new Date(Date.now() - 45 * DAY));
    const [a, b] = [emp[0], emp[1]];
    await addDoc(a, t, { period });
    await addDoc(b, t, { period: previous });

    const res = await uploadMultiResourceDocument(multiForm(t, [a, b], { period }));
    expect(res).toEqual({ ok: true, updated: 0, created: 1, skipped: 1 });
    expect(await rowsOf(a, t)).toHaveLength(1);
    const rowsB = await rowsOf(b, t);
    expect(rowsB.map((r) => r.period).sort()).toEqual([previous, period].sort());

    // El período anterior de b ya está presentado → ahora se saltea; sin período falla.
    const prevRes = await uploadMultiResourceDocument(multiForm(t, [b], { period: previous }));
    expect(prevRes).toMatchObject({ ok: false });
    const noPeriod = await uploadMultiResourceDocument(multiForm(t, [a]));
    expect(noPeriod).toMatchObject({ ok: false });
  });

  it('si la transacción falla se borra el archivo subido (compensación) y no queda ninguna fila', async () => {
    const { uploadMultiResourceDocument } = await import('./upload-multiresource-document');
    const t = await mkType('Permanente');
    const spy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('boom'));
    const res = await uploadMultiResourceDocument(multiForm(t, [emp[4]]));
    spy.mockRestore();
    expect(res).toMatchObject({ ok: false });
    expect(stored.size).toBe(0);
    expect(await rowsOf(emp[4], t)).toHaveLength(0);
  });

  it('eliminar un archivo compartido borra las N filas, quita el archivo y recalcula el status', async () => {
    const { uploadMultiResourceDocument } = await import('./upload-multiresource-document');
    const { deleteDocumentFile } = await import('./document-files.server');
    const t = await mkType('Permanente', { multiresource: true });
    const own = await addDoc(emp[0], t);
    const group = [emp[1], emp[2], emp[3]];
    await uploadMultiResourceDocument(multiForm(t, group));
    const sharedRows = await prisma.documents_employees.findMany({
      where: { applies: { in: group }, id_document_types: t },
    });
    expect(sharedRows).toHaveLength(3);
    const sharedPath = sharedRows[0].document_path as string;
    expect(stored.has(sharedPath)).toBe(true);
    for (const id of [emp[0], ...group]) expect(await employeeStatus(id)).toBe(status.ok);

    const res = await deleteDocumentFile({ id: sharedRows[0].id, resource: 'employee' });
    expect(res).toEqual({ ok: true });
    expect(await prisma.documents_employees.count({ where: { document_path: sharedPath } })).toBe(0);
    // No se dejó ninguna fila vacía: la exigencia pasa a faltante derivado.
    expect(await prisma.documents_employees.count({ where: { applies: { in: group }, id_document_types: t } })).toBe(0);
    expect(stored.has(sharedPath)).toBe(false);
    for (const id of group) expect(await employeeStatus(id)).toBe(status.incomplete);
    // El documento propio de otro recurso no se toca.
    expect(await rowsOf(emp[0], t)).toHaveLength(1);
    expect(await employeeStatus(emp[0])).toBe(status.ok);
    expect(own.document_path).toBeTruthy();
  });

  it('reemplazar y renovar dejan la fila presentado y refrescan el status', async () => {
    const { uploadDocumentForRequirement } = await import('./document-actions');
    const { replaceDocumentFile, renewDocumentFile } = await import('./document-files.server');
    const t = await mkType('Con vencimiento', { explired: true });

    // Un vencido: se sube con una validez ya pasada y el status refleja el vencimiento.
    const up = await uploadDocumentForRequirement({
      kind: 'employee',
      resourceId: emp[5],
      documentTypeId: t,
      file: pdf(),
      validity: past(),
    });
    expect(up).toMatchObject({ ok: true });
    const [row] = await rowsOf(emp[5], t);
    expect(await employeeStatus(emp[5])).toBe(status.expired);

    const renewFd = new FormData();
    renewFd.append('file', pdf());
    renewFd.append('id', row.id);
    renewFd.append('resource', 'employee');
    renewFd.append('validity', future().toISOString());
    expect(await renewDocumentFile(renewFd)).toEqual({ ok: true });
    const [renewed] = await rowsOf(emp[5], t);
    expect(renewed).toMatchObject({ id: row.id, state: 'presentado', archived_at: null });
    expect(await employeeStatus(emp[5])).toBe(status.ok);

    // Reemplazar con una validez pasada vuelve a dejarlo vencido.
    const replaceFd = new FormData();
    replaceFd.append('file', pdf());
    replaceFd.append('id', row.id);
    replaceFd.append('resource', 'employee');
    replaceFd.append('validity', past().toISOString());
    expect(await replaceDocumentFile(replaceFd)).toEqual({ ok: true });
    const [replaced] = await rowsOf(emp[5], t);
    expect(replaced.state).toBe('presentado');
    expect(await employeeStatus(emp[5])).toBe(status.expired);
  });

  it('crear, desactivar, reactivar y borrar un tipo no crea ni borra filas vacías y refresca el status', async () => {
    const { createDocumentType, deactivateDocumentType, reactivateDocumentType, hardDeleteDocumentType } = await import(
      '../../TiposDocumentos/actions/mutations.server'
    );
    await refreshAll();
    expect(await employeeStatus(emp[0])).toBe(status.ok);
    const rowsBefore = await prisma.documents_employees.count({ where: { applies: { in: emp } } });

    const created = await createDocumentType({
      name: `Nuevo ${suffix}`,
      applies: 'Persona',
      mandatory: true,
      explired: false,
      special: false,
      multiresource: false,
    });
    createdTypes.push(created.id);
    expect(await prisma.documents_employees.count({ where: { applies: { in: emp } } })).toBe(rowsBefore);
    expect(await employeeStatus(emp[0])).toBe(status.incomplete);

    await deactivateDocumentType(created.id);
    expect(await prisma.documents_employees.count({ where: { applies: { in: emp } } })).toBe(rowsBefore);
    expect(await employeeStatus(emp[0])).toBe(status.ok);

    await reactivateDocumentType(created.id);
    expect(await prisma.documents_employees.count({ where: { applies: { in: emp } } })).toBe(rowsBefore);
    expect(await employeeStatus(emp[0])).toBe(status.incomplete);

    // Con un documento cargado no se puede borrar; sin él se borra (cascada) y el status vuelve.
    const doc = await addDoc(emp[0], created.id);
    await expect(hardDeleteDocumentType(created.id)).rejects.toThrow(/documento/);
    await prisma.documents_employees.delete({ where: { id: doc.id } });
    await prisma.documents_employees.create({
      data: { applies: emp[1], id_document_types: created.id, state: 'pendiente' },
    });
    await hardDeleteDocumentType(created.id);
    expect(await prisma.document_types.count({ where: { id: created.id } })).toBe(0);
    expect(await prisma.documents_employees.count({ where: { id_document_types: created.id } })).toBe(0);
    expect(await employeeStatus(emp[0])).toBe(status.ok);
  });

  it('diagnóstico y contador de coincidencias con el motor', async () => {
    const { selectionsToConditionsJson } = await import('../../TiposDocumentos/utils/conditionsMapper');
    const { verifyDocumentTypeConsistency } = await import('../../TiposDocumentos/actions/consistency.server');
    const { countMatchingResources } = await import('../../TiposDocumentos/actions/queries.server');
    const byA = selectionsToConditionsJson({ companyPosition: [posA] }, 'Persona', {}) as Prisma.InputJsonValue[];
    const byB = selectionsToConditionsJson({ companyPosition: [posB] }, 'Persona', {}) as Prisma.InputJsonValue[];
    const t = await mkType('Sólo posA', { special: true, conditions: byA });
    await addDoc(emp[6], t); // posA con documento
    await addDoc(emp[8], t); // posB con documento: ya no aplica

    const diag = await verifyDocumentTypeConsistency(t);
    expect(diag.applies).toBe('Persona');
    expect(diag.stats).toMatchObject({
      totalResources: 9,
      applicable: 2,
      withDocument: 1,
      missing: 1,
      notApplicableWithDocument: 1,
    });
    expect(diag.missing.map((r) => r.id)).toEqual([emp[7]]);
    expect(diag.notApplicable.map((r) => r.id)).toEqual([emp[8]]);
    // Es de sólo lectura: no creó filas.
    expect(await prisma.documents_employees.count({ where: { id_document_types: t } })).toBe(2);

    const create = await countMatchingResources('Persona', byA as Prisma.JsonValue[]);
    expect(create).toEqual({ matching: 2, startsRequiring: 0, stopsRequiring: 0 });
    // Editar el tipo guardado a posB: 7 empiezan a exigirlo y 2 dejan de exigirlo.
    const edit = await countMatchingResources('Persona', byB as Prisma.JsonValue[], t);
    expect(edit).toEqual({ matching: 7, startsRequiring: 7, stopsRequiring: 2 });
  });

  it('aprobar un candidato transfiere los documentos que aplican, informa los que no y deja el status correcto', async () => {
    const { selectionsToConditionsJson } = await import('../../TiposDocumentos/utils/conditionsMapper');
    const { approvePreEmployee } = await import('@/features/Seleccion/actions/approve-pre-employee.server');
    const tApplies = await mkType('Aplica a todos');
    const tOnlyA = await mkType('Sólo posA', {
      special: true,
      conditions: selectionsToConditionsJson({ companyPosition: [posA] }, 'Persona', {}) as Prisma.InputJsonValue[],
    });

    const candidate = await prisma.pre_employees.create({
      data: {
        company_id: COMPANY,
        pre_file_number: `PRE-${suffix}`,
        status: 'pre_ingreso',
        firstname: 'Candidato',
        lastname: 'WritersIT',
        cuil: `PRE-${suffix}`,
        document_type: 'DNI',
        document_number: `PRE${suffix}`,
        born_date: '1990-01-01',
        nationality: 'Argentina',
        birthplace: countryId,
        gender: 'Masculino',
        marital_status: 'Soltero',
        level_of_education: 'Secundario',
        street: 'Calle',
        street_number: '1',
        province: city.province_id,
        city: city.id,
        postal_code: '8300',
        phone: '123',
        email: `pre-${suffix}@alphataco.local`,
      },
      select: { id: true },
    });
    await prisma.documents_pre_employees.createMany({
      data: [tApplies, tOnlyA].map((typeId) => ({
        pre_employee_id: candidate.id,
        document_type_id: typeId,
        document_path: `it/${suffix}/pre-${typeId}.pdf`,
        company_id: COMPANY,
        user_id: PROFILE,
      })),
    });

    const result = await approvePreEmployee(candidate.id, {
      file: `LEG-${suffix}`,
      hierarchical_position: hierarchyId,
      company_position: posB,
      workflow_diagram: diagramId,
    });
    expect(result.transferredDocuments).toBe(1);
    expect(result.skippedDocuments).toBe(1);

    const withFile = await prisma.documents_employees.findMany({
      where: { applies: result.employeeId, document_path: { not: null } },
    });
    expect(withFile).toHaveLength(1);
    expect(withFile[0]).toMatchObject({ id_document_types: tApplies, state: 'presentado', user_id: PROFILE });
    // El tipo que no le aplica no se fuerza dentro del legajo.
    expect(withFile.some((r) => r.id_document_types === tOnlyA)).toBe(false);
    // Tiene lo único que se le exige → Completo.
    expect(await employeeStatus(result.employeeId)).toBe(status.ok);
  }, 60_000);
});
