import type { PrismaClient } from '@/generated/prisma/client';
import type { TenantContext } from '@/shared/lib/tenant-context';
import { ensureCity } from '@/test/db-fixtures';
import {
  asContext,
  callAsEmployee,
  createPublishedTraining,
  employeeContext,
  passTraining,
  type TestQuestion,
} from '@/test/hse-fixtures';
import {
  createTestEmployee,
  createTestUser,
  dropCatalogRows,
  dropTestUsers,
  emptyCatalogRows,
  grantPermissions,
} from '@/test/permission-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Actas de capacitación y constancias firmadas (ticket 804, fase 4) bajo el rol REAL de la app, con dos empresas.
 *
 * La constancia nace solo de la firma del empleado (una por aprobación vigente, no se pisa) y solo HSE la anula con
 * motivo; el acta se cierra con su huella y cerrada no cambia (salvo anularla con motivo). El empleado no lee actas ni
 * constancias ajenas. La huella detecta alteraciones: la del contenido (SHA-256 de `content::text`) y la del PDF guardado
 * (cada descarga la verifica). El storage es un mapa en memoria: se puede «alterar» el archivo guardado.
 *
 * Corre con `scripts/test-rls.sh`.
 */
const state = vi.hoisted(() => ({ ctx: null as TenantContext | null, files: new Map<string, Uint8Array>() }));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('next/cache', () => ({
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
}));
vi.mock('@/shared/lib/tenant-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant-db')>()),
  getTenantContextOrNull: async () => state.ctx,
}));
vi.mock('@/shared/lib/storage', () => ({
  storageUpload: async (_bucket: string, path: string, file: Blob) => {
    state.files.set(path, new Uint8Array(await file.arrayBuffer()));
    return { ok: true, data: { path } };
  },
  storageDownload: async (_bucket: string, path: string) => {
    const bytes = state.files.get(path);
    return bytes ? { ok: true, data: new Blob([bytes as BlobPart]) } : { ok: false, error: 'no', code: 'not-found' };
  },
  storageRemove: async (_bucket: string, paths: string[]) => {
    for (const path of paths) state.files.delete(path);
    return { ok: true, data: null };
  },
}));

const COMPANY_A = '7f000000-0000-4000-8000-00000000000a';
const COMPANY_B = '7f000000-0000-4000-8000-00000000000b';
const HSE_USER = '7f000000-0000-4000-8000-0000000001aa';
const VIEWER_USER = '7f000000-0000-4000-8000-0000000001ab';
const E1_USER = '7f000000-0000-4000-8000-0000000001e1';
const E2_USER = '7f000000-0000-4000-8000-0000000001e2';
const E1 = '7f000000-0000-4000-8000-0000000002e1';
const E2 = '7f000000-0000-4000-8000-0000000002e2';
const E3 = '7f000000-0000-4000-8000-0000000002e3';
const TRAINING = '7f000000-0000-4000-8000-000000000301';
const RECORD = '7f000000-0000-4000-8000-000000000401';
const RECORD_B = '7f000000-0000-4000-8000-000000000402';
const QUESTIONS: TestQuestion[] = [
  {
    id: '7f000000-0000-4000-8000-000000000501',
    points: 10,
    correctOptionId: '7f000000-0000-4000-8000-000000000511',
    wrongOptionId: '7f000000-0000-4000-8000-000000000521',
  },
];

let owner: PrismaClient;
const catalog = emptyCatalogRows();
const ctx1 = employeeContext(COMPANY_A, E1, E1_USER);
const ctx2 = employeeContext(COMPANY_A, E2, E2_USER);
const hseCtx: TenantContext = { companyId: COMPANY_A, userId: HSE_USER, kind: 'user' };
const viewerCtx: TenantContext = { companyId: COMPANY_A, userId: VIEWER_USER, kind: 'user' };
let passedAttempt = '';

type SignResult = { ok: boolean; certificateId?: string; alreadySigned?: boolean; reason?: string };
const sign = (ctx: TenantContext, attemptId: string) =>
  callAsEmployee<SignResult>(
    ctx,
    (tx) => tx.$queryRaw`SELECT public.hse_sign_certificate(${attemptId}::uuid, '10.0.0.1', 'vitest') AS r`
  );

/** ¿La huella guardada es la del contenido? Y la de un contenido con un dato cambiado, ¿difiere? */
async function contentHashCheck(table: 'hse_training_certificates' | 'hse_training_records', id: string) {
  const rows =
    table === 'hse_training_certificates'
      ? await owner.$queryRaw<{ matches: boolean; tampered: boolean }[]>`
          SELECT encode(sha256(convert_to(content::text, 'UTF8')), 'hex') = content_sha256 AS matches,
                 encode(sha256(convert_to(jsonb_set(content, '{employee,fullName}', '"Otra Persona"')::text, 'UTF8')), 'hex')
                   = content_sha256 AS tampered
          FROM public.hse_training_certificates WHERE id = ${id}::uuid`
      : await owner.$queryRaw<{ matches: boolean; tampered: boolean }[]>`
          SELECT encode(sha256(convert_to(content::text, 'UTF8')), 'hex') = content_sha256 AS matches,
                 encode(sha256(convert_to(jsonb_set(content, '{topics}', '"Otro temario"')::text, 'UTF8')), 'hex')
                   = content_sha256 AS tampered
          FROM public.hse_training_records WHERE id = ${id}::uuid`;
  return rows[0];
}

async function cleanup(): Promise<void> {
  const companies = [COMPANY_A, COMPANY_B];
  await owner.hse_trainings.deleteMany({ where: { company_id: { in: companies } } });
  await owner.employees.deleteMany({ where: { company_id: { in: companies } } });
  await dropTestUsers(owner, [HSE_USER, VIEWER_USER, E1_USER, E2_USER]);
  await owner.company.deleteMany({ where: { id: { in: companies } } });
}

describe.skipIf(!RUN_RLS)('actas y constancias HSE bajo RLS (rol alphataco_app)', () => {
  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    const city = await ensureCity(owner);
    await createTestCompany(owner, {
      id: COMPANY_A,
      name: '__rls_hse_actas_A__',
      cuit: 'RLS-HSE-ACTA-A',
      cityId: city.id,
    });
    await createTestCompany(owner, {
      id: COMPANY_B,
      name: '__rls_hse_actas_B__',
      cuit: 'RLS-HSE-ACTA-B',
      cityId: city.id,
    });
    await createTestEmployee(owner, {
      id: E1,
      companyId: COMPANY_A,
      seed: 7301,
      lastname: 'Uno',
      firstname: 'Empleado',
    });
    await createTestEmployee(owner, {
      id: E2,
      companyId: COMPANY_A,
      seed: 7302,
      lastname: 'Dos',
      firstname: 'Empleado',
    });
    await createTestEmployee(owner, {
      id: E3,
      companyId: COMPANY_B,
      seed: 7303,
      lastname: 'Tres',
      firstname: 'Empleado',
    });
    await createTestUser(owner, { id: HSE_USER, email: 'hse@rls-hse-actas.test', fullname: 'Responsable HSE' });
    await createTestUser(owner, { id: VIEWER_USER, email: 'ver@rls-hse-actas.test', fullname: 'Solo lectura' });
    await owner.share_company_users.createMany({
      data: [
        { company_id: COMPANY_A, profile_id: HSE_USER },
        { company_id: COMPANY_A, profile_id: VIEWER_USER },
      ],
    });
    await grantPermissions(owner, catalog, {
      userId: HSE_USER,
      companyId: COMPANY_A,
      keys: ['hse:actas:view', 'hse:actas:approve', 'hse:actas:delete', 'hse:capacitaciones:view'],
    });
    await grantPermissions(owner, catalog, { userId: VIEWER_USER, companyId: COMPANY_A, keys: ['hse:actas:view'] });
    await createTestUser(owner, { id: E1_USER, email: 'e1@rls-hse-actas.test', fullname: 'Uno', employeeId: E1 });
    await createTestUser(owner, { id: E2_USER, email: 'e2@rls-hse-actas.test', fullname: 'Dos', employeeId: E2 });

    await createPublishedTraining(owner, {
      id: TRAINING,
      companyId: COMPANY_A,
      title: 'Trabajo en altura',
      createdBy: HSE_USER,
      validityMonths: 12,
      questions: QUESTIONS,
    });
    passedAttempt = await passTraining(ctx1, TRAINING, QUESTIONS);
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await dropCatalogRows(owner, catalog);
    await owner.$disconnect();
  });

  it('la constancia la firma solo el dueño del intento aprobado, una vez, con la huella de su contenido', async () => {
    await expect(sign(ctx2, passedAttempt)).resolves.toEqual({ ok: false, reason: 'not_found' });
    const first = await sign(ctx1, passedAttempt);
    expect(first).toMatchObject({ ok: true, alreadySigned: false });
    // Firmar de nuevo no crea otra ni pisa la primera.
    await expect(sign(ctx1, passedAttempt)).resolves.toEqual({
      ok: true,
      certificateId: first.certificateId,
      alreadySigned: true,
    });
    await expect(owner.hse_training_certificates.count({ where: { attempt_id: passedAttempt } })).resolves.toBe(1);

    const certificate = await owner.hse_training_certificates.findUniqueOrThrow({
      where: { id: first.certificateId! },
      select: { signer_name: true, ip: true, user_agent: true, content: true },
    });
    expect(certificate).toMatchObject({ signer_name: 'Uno Empleado', ip: '10.0.0.1', user_agent: 'vitest' });
    await expect(contentHashCheck('hse_training_certificates', first.certificateId!)).resolves.toEqual({
      matches: true,
      tampered: false,
    });
    // Nadie la modifica después (ni el dueño de las tablas): el contenido firmado queda congelado.
    await expect(
      owner.hse_training_certificates.update({ where: { id: first.certificateId! }, data: { signer_name: 'Otro' } })
    ).rejects.toThrow(/no se modifica/);
    // El empleado no la escribe ni la borra.
    await expect(
      asContext(ctx1, (tx) =>
        tx.hse_training_certificates.updateMany({ where: { employee_id: E1 }, data: { ip: null } })
      )
    ).resolves.toEqual({ count: 0 });
    await expect(
      asContext(hseCtx, (tx) => tx.hse_training_certificates.deleteMany({ where: { employee_id: E1 } }))
    ).rejects.toThrow(/no se borra/);
  });

  it('el empleado ve solo sus constancias; las actas no las ve (listan a todos los asistentes)', async () => {
    await expect(asContext(ctx1, (tx) => tx.hse_training_certificates.count())).resolves.toBe(1);
    await expect(asContext(ctx2, (tx) => tx.hse_training_certificates.count())).resolves.toBe(0);
    await expect(
      asContext(employeeContext(COMPANY_B, E3, E1_USER), (tx) => tx.hse_training_certificates.count())
    ).resolves.toBe(0);
    await expect(asContext(hseCtx, (tx) => tx.hse_training_certificates.count())).resolves.toBe(1);
  });

  it('solo HSE con permiso anula una constancia, con motivo; anulada, el empleado puede volver a firmar', async () => {
    const certificate = await owner.hse_training_certificates.findFirstOrThrow({
      where: { attempt_id: passedAttempt, voided_at: null },
      select: { id: true },
    });
    const voidAs = (ctx: TenantContext, reason: string) =>
      asContext(
        ctx,
        (tx) =>
          tx.$executeRaw`SELECT public.hse_void_certificate(${certificate.id}::uuid, ${reason}, ${ctx.userId}::uuid)`
      );
    await expect(voidAs(ctx1, 'No me gusta la nota')).rejects.toThrow(/sin permiso/);
    await expect(voidAs(viewerCtx, 'Error de carga del acta')).rejects.toThrow(/sin permiso/);
    await expect(voidAs(hseCtx, 'mal')).rejects.toThrow(/falta el motivo/);
    await voidAs(hseCtx, 'Error de carga del acta');
    // Una segunda anulación no cambia el motivo.
    await voidAs(hseCtx, 'Otro motivo distinto');
    await expect(
      owner.hse_training_certificates.findUniqueOrThrow({
        where: { id: certificate.id },
        select: { void_reason: true },
      })
    ).resolves.toEqual({ void_reason: 'Error de carga del acta' });

    const again = await sign(ctx1, passedAttempt);
    expect(again).toMatchObject({ ok: true, alreadySigned: false });
    expect(again.certificateId).not.toBe(certificate.id);
  });

  it('el acta se cierra solo con permiso y datos completos, con la huella de lo congelado', async () => {
    await owner.hse_training_records.create({
      data: {
        id: RECORD,
        company_id: COMPANY_A,
        training_id: TRAINING,
        number: 1,
        held_on: new Date('2026-10-01T00:00:00Z'),
        topics: 'Arnés, líneas de vida y rescate',
        created_by: HSE_USER,
      },
    });
    const close = (ctx: TenantContext) =>
      asContext(
        ctx,
        (tx) =>
          tx.$queryRaw<
            { r: { ok: boolean; reason?: string } }[]
          >`SELECT public.hse_close_training_record(${RECORD}::uuid, ${ctx.userId}::uuid) AS r`
      ).then((rows) => rows[0]!.r);

    await expect(close(viewerCtx)).rejects.toThrow(/sin permiso/);
    await expect(close(hseCtx)).resolves.toEqual({ ok: false, reason: 'missing_instructors' });
    await owner.hse_training_record_instructors.create({
      data: { company_id: COMPANY_A, record_id: RECORD, kind: 'external', full_name: 'Ana Instructora' },
    });
    await expect(close(hseCtx)).resolves.toEqual({ ok: false, reason: 'missing_attendees' });
    await owner.hse_training_record_attendees.createMany({
      data: [
        { company_id: COMPANY_A, record_id: RECORD, employee_id: E1, attended: true },
        { company_id: COMPANY_A, record_id: RECORD, employee_id: E2, attended: false },
      ],
    });
    await expect(close(hseCtx)).resolves.toEqual({ ok: true });
    // Ya cerrada: no se vuelve a cerrar.
    await expect(close(hseCtx)).resolves.toEqual({ ok: false, reason: 'not_draft' });

    await expect(contentHashCheck('hse_training_records', RECORD)).resolves.toEqual({ matches: true, tampered: false });
    const record = await owner.hse_training_records.findUniqueOrThrow({
      where: { id: RECORD },
      select: { status: true, content: true },
    });
    expect(record.status).toBe('closed');
    const attendees = (
      record.content as { attendees: { employeeId: string; attended: boolean; certificate: unknown }[] }
    ).attendees;
    expect(attendees.map((a) => [a.employeeId, a.attended])).toEqual(
      expect.arrayContaining([
        [E1, true],
        [E2, false],
      ])
    );
    expect(attendees.find((a) => a.employeeId === E1)?.certificate).not.toBeNull();

    // El empleado no lee actas; quien tiene el permiso de ver, sí.
    await expect(asContext(ctx1, (tx) => tx.hse_training_records.count())).resolves.toBe(0);
    await expect(asContext(ctx1, (tx) => tx.hse_training_record_attendees.count())).resolves.toBe(0);
    await expect(asContext(viewerCtx, (tx) => tx.hse_training_records.count())).resolves.toBe(1);
  });

  it('el acta cerrada es inmutable: datos, capacitadores y asistentes no cambian ni se borra', async () => {
    await expect(
      owner.hse_training_records.update({ where: { id: RECORD }, data: { topics: 'Otro' } })
    ).rejects.toThrow(/no se modifica/);
    await expect(
      owner.hse_training_record_attendees.create({
        data: { company_id: COMPANY_A, record_id: RECORD, employee_id: E2 },
      })
    ).rejects.toThrow(/no se modifican/);
    await expect(owner.hse_training_record_instructors.deleteMany({ where: { record_id: RECORD } })).rejects.toThrow(
      /no se modifican/
    );
    await expect(
      asContext(hseCtx, (tx) => tx.hse_training_records.deleteMany({ where: { id: RECORD } }))
    ).rejects.toThrow(/no se borra/);
  });

  it('el PDF del acta se guarda una vez con su huella y una alteración del archivo guardado no se entrega', async () => {
    const { ensureRecordPdf } = await import('@/features/Hse/pdf/hse-pdf.server');
    state.ctx = hseCtx;
    const first = await ensureRecordPdf(RECORD);
    expect(first).toMatchObject({ ok: true });
    const stored = await owner.hse_training_records.findUniqueOrThrow({
      where: { id: RECORD },
      select: { pdf_path: true, pdf_sha256: true },
    });
    expect(stored.pdf_path).toMatch(new RegExp(`^${COMPANY_A}/records/`));
    expect(state.files.has(stored.pdf_path!)).toBe(true);

    // Segunda descarga: verifica la huella y devuelve el mismo archivo.
    await expect(ensureRecordPdf(RECORD)).resolves.toEqual(first);
    // Adjuntar otro PDF no pisa el primero.
    const reattach = await asContext(
      hseCtx,
      (tx) =>
        tx.$queryRaw<
          { r: { pdfPath: string } }[]
        >`SELECT public.hse_attach_record_pdf(${RECORD}::uuid, 'otro.pdf', ${'c'.repeat(64)}) AS r`
    );
    expect(reattach[0]!.r.pdfPath).toBe(stored.pdf_path);

    // Alguien cambia el archivo en el storage: la huella no coincide y no se entrega.
    const bytes = state.files.get(stored.pdf_path!)!;
    state.files.set(stored.pdf_path!, Uint8Array.from([...bytes.slice(0, -1), bytes.at(-1)! ^ 1]));
    const altered = await ensureRecordPdf(RECORD);
    expect(altered).toMatchObject({ ok: false });
    expect(altered && !altered.ok && altered.error).toMatch(/no coincide con su huella/);
    state.ctx = null;
  }, 60_000);

  it('el acta cerrada se anula solo con permiso y motivo, una sola vez', async () => {
    const voidAs = (ctx: TenantContext, reason: string) =>
      asContext(
        ctx,
        (tx) => tx.$executeRaw`SELECT public.hse_void_training_record(${RECORD}::uuid, ${reason}, ${ctx.userId}::uuid)`
      );
    await expect(voidAs(viewerCtx, 'Fecha equivocada en el acta')).rejects.toThrow(/sin permiso/);
    await expect(voidAs(hseCtx, 'no')).rejects.toThrow(/falta el motivo/);
    await voidAs(hseCtx, 'Fecha equivocada en el acta');
    await expect(
      owner.hse_training_records.findUniqueOrThrow({
        where: { id: RECORD },
        select: { status: true, void_reason: true },
      })
    ).resolves.toEqual({ status: 'voided', void_reason: 'Fecha equivocada en el acta' });
    await expect(voidAs(hseCtx, 'Fecha equivocada otra vez')).rejects.toThrow(/solo se anula un acta cerrada/);
    // Un borrador no se anula: se borra o se cierra.
    await owner.hse_training_records.create({
      data: {
        id: RECORD_B,
        company_id: COMPANY_A,
        training_id: TRAINING,
        number: 2,
        held_on: new Date('2026-10-02T00:00:00Z'),
        topics: 'Repaso',
        created_by: HSE_USER,
      },
    });
    await expect(
      asContext(
        hseCtx,
        (tx) =>
          tx.$executeRaw`SELECT public.hse_void_training_record(${RECORD_B}::uuid, 'Borrador de prueba', ${HSE_USER}::uuid)`
      )
    ).rejects.toThrow(/solo se anula un acta cerrada/);
    // Y un acta no nace cerrada.
    await expect(
      owner.hse_training_records.update({ where: { id: RECORD_B }, data: { status: 'closed' } })
    ).rejects.toThrow(/cierre formal/);
  });
});
