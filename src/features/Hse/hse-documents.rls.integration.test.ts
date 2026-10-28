import type { PrismaClient } from '@/generated/prisma/client';
import type { TenantContext, TenantTx } from '@/shared/lib/tenant-context';
import { ensureCity } from '@/test/db-fixtures';
import {
  createTestEmployee,
  createTestUser,
  dropCatalogRows,
  dropTestUsers,
  emptyCatalogRows,
  grantPermissions,
} from '@/test/permission-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { hashPassword } from 'better-auth/crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Documentos HSE (ticket 804, fase 2) bajo el rol REAL de la app (`alphataco_app`, sin BYPASSRLS), con dos empresas.
 *
 * Lo que la base garantiza aunque una action se equivoque: el empleado del portal lee solo lo PUBLICADO que le aplica
 * (todos / su puesto / su sector / él mismo) en su versión VIGENTE; una respuesta registrada no se pisa
 * (`hse_ack_guard`); quién tiene que aceptar sale de UNA regla (`hse_sync_acknowledgements`), que archiva y desarchiva
 * al cambiar de puesto, dar de baja y reintegrar; y `/api/files` sirve un archivo de `hse-files` solo si la fila de la
 * versión es visible para quien lo pide. El storage se sustituye (sin RustFS): lo que se prueba es el perímetro.
 *
 * Corre con `scripts/test-rls.sh`.
 */
const state = vi.hoisted(() => ({
  ctx: null as TenantContext | null,
  userId: null as string | null,
}));

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
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': 'vitest', 'x-forwarded-for': '10.0.0.1' }),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock('@/shared/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/session')>()),
  getSessionUserId: async () => state.userId,
  isSessionAnonymous: async () => false,
  getSessionNeedsPasswordChange: async () => false,
  getSessionCompanyClaim: async () => state.ctx?.companyId ?? null,
}));
vi.mock('@/shared/lib/tenant-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant-db')>()),
  getTenantContextOrNull: async () => state.ctx,
  getTenantContext: async () => {
    if (!state.ctx) throw new Error('sin contexto');
    return state.ctx;
  },
}));
vi.mock('@/shared/lib/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant')>()),
  getActiveCompanyId: async () => {
    if (!state.ctx) throw new Error('sin empresa activa');
    return state.ctx.companyId;
  },
  canUseAsActiveCompany: async (companyId: string) => companyId === state.ctx?.companyId,
}));
// Storage sustituido: la ruta llega al `GetObject` solo si el perímetro dejó pasar.
vi.mock('@/shared/lib/s3', () => ({
  s3Client: () => ({
    send: async () => ({
      ContentType: 'application/pdf',
      ContentLength: 3,
      Body: { transformToWebStream: () => new Blob(['pdf']).stream() },
    }),
  }),
}));

const COMPANY_A = '7d000000-0000-4000-8000-00000000000a';
const COMPANY_B = '7d000000-0000-4000-8000-00000000000b';
const HSE_USER = '7d000000-0000-4000-8000-0000000001aa';
const E1_USER = '7d000000-0000-4000-8000-0000000001e1';
const E2_USER = '7d000000-0000-4000-8000-0000000001e2';
const E1 = '7d000000-0000-4000-8000-0000000002e1';
const E2 = '7d000000-0000-4000-8000-0000000002e2';
const E3 = '7d000000-0000-4000-8000-0000000002e3';
const POSITION_1 = '7d000000-0000-4000-8000-000000000301';
const POSITION_2 = '7d000000-0000-4000-8000-000000000302';
const SECTOR_1 = '7d000000-0000-4000-8000-000000000401';
const E1_PASSWORD = 'Clave-de-prueba-1';

/** Documentos de la suite: id, versión y archivo. */
const DOC = {
  all: { id: '7d000000-0000-4000-8000-000000000501', v1: '7d000000-0000-4000-8000-000000000511' },
  position: { id: '7d000000-0000-4000-8000-000000000502', v1: '7d000000-0000-4000-8000-000000000512' },
  sector: { id: '7d000000-0000-4000-8000-000000000503', v1: '7d000000-0000-4000-8000-000000000513' },
  employee: { id: '7d000000-0000-4000-8000-000000000504', v1: '7d000000-0000-4000-8000-000000000514' },
  draft: { id: '7d000000-0000-4000-8000-000000000505', v1: '7d000000-0000-4000-8000-000000000515' },
  otherCompany: { id: '7d000000-0000-4000-8000-000000000506', v1: '7d000000-0000-4000-8000-000000000516' },
} as const;
const ALL_V2 = '7d000000-0000-4000-8000-000000000521';

const filePath = (companyId: string, versionId: string) => `${companyId}/documents/${versionId}/norma.pdf`;

let owner: PrismaClient;
const catalog = emptyCatalogRows();

const employeeCtx = (employeeId: string, userId: string, companyId = COMPANY_A): TenantContext => ({
  companyId,
  userId,
  kind: 'employee',
  employeeId,
});

async function asCtx<T>(ctx: TenantContext, fn: (tx: TenantTx) => Promise<T>) {
  const { prismaBase } = await import('@/shared/lib/prisma');
  const { runWithTenantContext } = await import('@/shared/lib/tenant-context');
  return runWithTenantContext(prismaBase, ctx, fn);
}

async function sync(companyId: string, employeeId: string | null = null) {
  await owner.$executeRaw`SELECT public.hse_sync_acknowledgements(${companyId}::uuid, NULL::uuid, ${employeeId}::uuid)`;
}

async function createDocument(input: {
  id: string;
  versionId: string;
  companyId: string;
  title: string;
  target:
    | { kind: 'all' }
    | { kind: 'position'; position_id: string }
    | { kind: 'sector'; sector_id: string }
    | { kind: 'employee'; employee_id: string };
  publish: boolean;
}) {
  await owner.hse_documents.create({
    data: { id: input.id, company_id: input.companyId, title: input.title, created_by: HSE_USER },
  });
  await owner.hse_document_versions.create({
    data: {
      id: input.versionId,
      company_id: input.companyId,
      document_id: input.id,
      version: 1,
      file_path: filePath(input.companyId, input.versionId),
      file_name: 'norma.pdf',
      file_size: 3,
      file_sha256: 'a'.repeat(64),
      created_by: HSE_USER,
    },
  });
  await owner.hse_document_targets.create({
    data: { company_id: input.companyId, document_id: input.id, ...input.target },
  });
  await owner.hse_documents.update({
    where: { id: input.id },
    data: { current_version_id: input.versionId, status: input.publish ? 'published' : 'draft' },
  });
}

async function cleanup(): Promise<void> {
  const companies = [COMPANY_A, COMPANY_B];
  await owner.hse_documents.deleteMany({ where: { company_id: { in: companies } } });
  await owner.employees.deleteMany({ where: { company_id: { in: companies } } });
  await owner.company_positions.deleteMany({ where: { company_id: { in: companies } } });
  await owner.hierarchy.deleteMany({ where: { company_id: { in: companies } } });
  await dropTestUsers(owner, [HSE_USER, E1_USER, E2_USER]);
  await owner.company.deleteMany({ where: { id: { in: companies } } });
}

/** Pide un archivo de `hse-files` por la ruta real, con la sesión del contexto actual. */
async function requestHseFile(path: string): Promise<number> {
  const { GET } = await import('@/app/api/files/[bucket]/[...path]/route');
  const response = await GET(new Request(`http://app.test/api/files/hse-files/${path}`), {
    params: Promise.resolve({ bucket: 'hse-files', path: path.split('/') }),
  });
  return response.status;
}

describe.skipIf(!RUN_RLS)('documentos HSE bajo RLS (rol alphataco_app)', () => {
  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    const city = await ensureCity(owner);
    await createTestCompany(owner, {
      id: COMPANY_A,
      name: '__rls_hse_docs_A__',
      cuit: 'RLS-HSE-DOC-A',
      cityId: city.id,
    });
    await createTestCompany(owner, {
      id: COMPANY_B,
      name: '__rls_hse_docs_B__',
      cuit: 'RLS-HSE-DOC-B',
      cityId: city.id,
    });
    await owner.company_positions.createMany({
      data: [
        { id: POSITION_1, company_id: COMPANY_A, name: 'Soldador', is_active: true },
        { id: POSITION_2, company_id: COMPANY_A, name: 'Chofer', is_active: true },
      ],
    });
    await owner.hierarchy.create({ data: { id: SECTOR_1, company_id: COMPANY_A, name: 'Taller' } });

    await createTestEmployee(owner, {
      id: E1,
      companyId: COMPANY_A,
      seed: 7101,
      lastname: 'Uno',
      firstname: 'Empleado',
      positionId: POSITION_1,
      sectorId: SECTOR_1,
    });
    await createTestEmployee(owner, {
      id: E2,
      companyId: COMPANY_A,
      seed: 7102,
      lastname: 'Dos',
      firstname: 'Empleado',
      positionId: POSITION_2,
    });
    await createTestEmployee(owner, {
      id: E3,
      companyId: COMPANY_B,
      seed: 7103,
      lastname: 'Tres',
      firstname: 'Empleado',
    });

    await createTestUser(owner, { id: HSE_USER, email: 'hse@rls-hse-docs.test', fullname: 'Responsable HSE' });
    await owner.share_company_users.create({ data: { company_id: COMPANY_A, profile_id: HSE_USER } });
    await grantPermissions(owner, catalog, {
      userId: HSE_USER,
      companyId: COMPANY_A,
      keys: ['hse:documentos-hse:view', 'hse:cumplimiento:view'],
    });
    await createTestUser(owner, {
      id: E1_USER,
      email: 'e1@rls-hse-docs.test',
      fullname: 'Empleado Uno',
      employeeId: E1,
    });
    await createTestUser(owner, {
      id: E2_USER,
      email: 'e2@rls-hse-docs.test',
      fullname: 'Empleado Dos',
      employeeId: E2,
    });
    const now = new Date();
    await owner.account.create({
      data: {
        id: '7d000000-0000-4000-8000-0000000006e1',
        userId: E1_USER,
        accountId: E1_USER,
        providerId: 'credential',
        password: await hashPassword(E1_PASSWORD),
        createdAt: now,
        updatedAt: now,
      },
    });
    await owner.employee_portal_access.createMany({
      data: [
        {
          company_id: COMPANY_A,
          employee_id: E1,
          credential_id: E1_USER,
          status: 'enabled',
          method: 'temporary_password',
          granted_by: HSE_USER,
        },
        {
          company_id: COMPANY_A,
          employee_id: E2,
          credential_id: E2_USER,
          status: 'enabled',
          method: 'temporary_password',
          granted_by: HSE_USER,
        },
      ],
    });

    await createDocument({ ...DOC_INPUT('all'), target: { kind: 'all' }, publish: true });
    await createDocument({
      ...DOC_INPUT('position'),
      target: { kind: 'position', position_id: POSITION_1 },
      publish: true,
    });
    await createDocument({ ...DOC_INPUT('sector'), target: { kind: 'sector', sector_id: SECTOR_1 }, publish: true });
    await createDocument({ ...DOC_INPUT('employee'), target: { kind: 'employee', employee_id: E2 }, publish: true });
    await createDocument({ ...DOC_INPUT('draft'), target: { kind: 'all' }, publish: false });
    await createDocument({ ...DOC_INPUT('otherCompany', COMPANY_B), target: { kind: 'all' }, publish: true });
    await sync(COMPANY_A);
    await sync(COMPANY_B);
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await dropCatalogRows(owner, catalog);
    await owner.$disconnect();
  });

  beforeEach(() => {
    state.ctx = null;
    state.userId = null;
  });

  it('control: sin contexto el rol de la app no ve documentos, versiones ni aceptaciones', async () => {
    const { prisma } = await import('@/shared/lib/prisma');
    const where = { company_id: { in: [COMPANY_A, COMPANY_B] } };
    await expect(prisma.hse_documents.count({ where })).resolves.toBe(0);
    await expect(prisma.hse_document_versions.count({ where })).resolves.toBe(0);
    await expect(prisma.hse_document_acknowledgements.count({ where })).resolves.toBe(0);
    await expect(owner.hse_documents.count({ where })).resolves.toBe(6);
  });

  it('la conciliación crea una aceptación pendiente por cada documento publicado que aplica', async () => {
    const acks = await owner.hse_document_acknowledgements.findMany({
      where: { company_id: { in: [COMPANY_A, COMPANY_B] }, archived_at: null },
      select: { employee_id: true, document_id: true, status: true },
    });
    const pairs = acks.map((a) => `${a.employee_id}:${a.document_id}`).sort();
    expect(pairs).toEqual(
      [
        `${E1}:${DOC.all.id}`,
        `${E1}:${DOC.position.id}`,
        `${E1}:${DOC.sector.id}`,
        `${E2}:${DOC.all.id}`,
        `${E2}:${DOC.employee.id}`,
        `${E3}:${DOC.otherCompany.id}`,
      ].sort()
    );
    expect(acks.every((a) => a.status === 'pending')).toBe(true);
  });

  it.each([
    ['E1 (todos, su puesto y su sector)', E1, E1_USER, [DOC.all.id, DOC.position.id, DOC.sector.id]],
    ['E2 (todos y él mismo)', E2, E2_USER, [DOC.all.id, DOC.employee.id]],
  ])(
    '%s lee solo lo publicado que le aplica: nunca borradores, ni de otro, ni de otra empresa',
    async (_l, employeeId, userId, expected) => {
      const rows = await asCtx(employeeCtx(employeeId, userId), (tx) =>
        tx.hse_documents.findMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } }, select: { id: true } })
      );
      expect(rows.map((r) => r.id).sort()).toEqual([...expected].sort());
      const versions = await asCtx(employeeCtx(employeeId, userId), (tx) =>
        tx.hse_document_versions.findMany({ select: { document_id: true } })
      );
      expect(versions.map((v) => v.document_id).sort()).toEqual([...expected].sort());
      // Destinatarios: solo con permiso (el empleado no sabe a quién más le aplica).
      await expect(asCtx(employeeCtx(employeeId, userId), (tx) => tx.hse_document_targets.count())).resolves.toBe(0);
    }
  );

  it('con el permiso de HSE el dashboard ve todos los de su empresa (borradores incluidos) y ninguno de la otra', async () => {
    const rows = await asCtx({ companyId: COMPANY_A, userId: HSE_USER, kind: 'user' }, (tx) =>
      tx.hse_documents.findMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } }, select: { id: true } })
    );
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.id)).not.toContain(DOC.otherCompany.id);
  });

  it('el empleado ve solo sus aceptaciones y no crea, borra ni responde las de otro', async () => {
    const ctx = employeeCtx(E1, E1_USER);
    const own = await asCtx(ctx, (tx) => tx.hse_document_acknowledgements.findMany({ select: { employee_id: true } }));
    expect(own.length).toBe(3);
    expect(own.every((a) => a.employee_id === E1)).toBe(true);

    const foreign = await owner.hse_document_acknowledgements.findFirstOrThrow({
      where: { employee_id: E2, document_id: DOC.all.id },
      select: { id: true, version_id: true },
    });
    const updated = await asCtx(ctx, (tx) =>
      tx.hse_document_acknowledgements.updateMany({
        where: { id: foreign.id },
        data: { status: 'accepted', responded_at: new Date() },
      })
    );
    expect(updated.count).toBe(0);
    await expect(
      asCtx(ctx, (tx) =>
        tx.hse_document_acknowledgements.create({
          data: { company_id: COMPANY_A, document_id: DOC.employee.id, version_id: DOC.employee.v1, employee_id: E1 },
        })
      )
    ).rejects.toThrow();
    // Borrar las propias: la RLS deja (escribe su fila) pero `hse_ack_guard` lo rechaza.
    await expect(
      asCtx(ctx, (tx) => tx.hse_document_acknowledgements.deleteMany({ where: { employee_id: E1 } }))
    ).rejects.toThrow(/no crea ni borra/);
    await expect(owner.hse_document_acknowledgements.count({ where: { employee_id: E1 } })).resolves.toBe(3);
  });

  it('aceptar exige la contraseña correcta y una respuesta registrada no se pisa', async () => {
    const { respondHseDocument } = await import('@/features/Portal/actions/hse-documents.server');
    const ack = await owner.hse_document_acknowledgements.findFirstOrThrow({
      where: { employee_id: E1, document_id: DOC.position.id, archived_at: null },
      select: { id: true },
    });
    state.ctx = employeeCtx(E1, E1_USER);
    state.userId = E1_USER;

    const wrong = await respondHseDocument({ ackId: ack.id, decision: 'accept', password: 'otra-clave' });
    expect(wrong.ok).toBe(false);
    await expect(
      owner.hse_document_acknowledgements.findUniqueOrThrow({ where: { id: ack.id }, select: { status: true } })
    ).resolves.toEqual({ status: 'pending' });

    const accepted = await respondHseDocument({ ackId: ack.id, decision: 'accept', password: E1_PASSWORD });
    expect(accepted).toEqual({ ok: true, data: { status: 'accepted' } });
    const row = await owner.hse_document_acknowledgements.findUniqueOrThrow({
      where: { id: ack.id },
      select: { status: true, signer_name: true, file_sha256: true, ip: true, user_agent: true },
    });
    expect(row).toEqual({
      status: 'accepted',
      signer_name: 'Uno Empleado',
      file_sha256: 'a'.repeat(64),
      ip: '10.0.0.1',
      user_agent: 'vitest',
    });

    // Una segunda respuesta (otra pestaña) no cambia nada.
    const again = await respondHseDocument({ ackId: ack.id, decision: 'reject', reason: 'Ya no estoy de acuerdo' });
    expect(again.ok).toBe(false);
    // Y la base lo impide aunque una action escriba directo (trigger `hse_ack_guard`, también para el dueño).
    await expect(
      owner.hse_document_acknowledgements.update({
        where: { id: ack.id },
        data: { status: 'rejected', reject_reason: 'pisada' },
      })
    ).rejects.toThrow(/no se modifica/);
    await expect(
      owner.hse_document_acknowledgements.findUniqueOrThrow({ where: { id: ack.id }, select: { status: true } })
    ).resolves.toEqual({ status: 'accepted' });
  });

  it('el empleado no responde la aceptación de otro aunque conozca su id', async () => {
    const { respondHseDocument } = await import('@/features/Portal/actions/hse-documents.server');
    const foreign = await owner.hse_document_acknowledgements.findFirstOrThrow({
      where: { employee_id: E2, document_id: DOC.employee.id },
      select: { id: true },
    });
    state.ctx = employeeCtx(E1, E1_USER);
    state.userId = E1_USER;
    const result = await respondHseDocument({
      ackId: foreign.id,
      decision: 'reject',
      reason: 'No es mío pero lo rechazo',
    });
    expect(result.ok).toBe(false);
    await expect(
      owner.hse_document_acknowledgements.findUniqueOrThrow({ where: { id: foreign.id }, select: { status: true } })
    ).resolves.toEqual({ status: 'pending' });
  });

  it('/api/files: el archivo publicado que aplica se sirve; borrador, ajeno, de otra empresa o sin sesión, 404', async () => {
    state.ctx = employeeCtx(E1, E1_USER);
    state.userId = E1_USER;
    expect(await requestHseFile(filePath(COMPANY_A, DOC.position.v1))).toBe(200);
    expect(await requestHseFile(filePath(COMPANY_A, DOC.draft.v1))).toBe(404);
    expect(await requestHseFile(filePath(COMPANY_A, DOC.employee.v1))).toBe(404);
    expect(await requestHseFile(filePath(COMPANY_B, DOC.otherCompany.v1))).toBe(404);
    expect(await requestHseFile(`${COMPANY_A}/documents/inexistente.pdf`)).toBe(404);

    // Con permiso de HSE el borrador sí se sirve (es el dashboard).
    state.ctx = { companyId: COMPANY_A, userId: HSE_USER, kind: 'user' };
    state.userId = HSE_USER;
    expect(await requestHseFile(filePath(COMPANY_A, DOC.draft.v1))).toBe(200);

    state.ctx = null;
    state.userId = null;
    expect(await requestHseFile(filePath(COMPANY_A, DOC.position.v1))).toBe(404);
  });

  it('una versión nueva archiva la aceptación anterior (con su respuesta) y crea una pendiente', async () => {
    const before = await owner.hse_document_acknowledgements.findFirstOrThrow({
      where: { employee_id: E1, document_id: DOC.all.id, archived_at: null },
      select: { id: true },
    });
    // E1 había aceptado la versión 1 (respuesta registrada a mano por el dueño: el flujo del portal ya se probó).
    await owner.hse_document_acknowledgements.update({
      where: { id: before.id },
      data: { status: 'accepted', responded_at: new Date(), signer_name: 'Uno Empleado' },
    });

    await owner.hse_document_versions.create({
      data: {
        id: ALL_V2,
        company_id: COMPANY_A,
        document_id: DOC.all.id,
        version: 2,
        file_path: filePath(COMPANY_A, ALL_V2),
        file_name: 'norma-v2.pdf',
        file_size: 3,
        file_sha256: 'b'.repeat(64),
        created_by: HSE_USER,
      },
    });
    await owner.hse_documents.update({ where: { id: DOC.all.id }, data: { current_version_id: ALL_V2 } });
    await sync(COMPANY_A);

    const old = await owner.hse_document_acknowledgements.findUniqueOrThrow({
      where: { id: before.id },
      select: { status: true, archive_reason: true, archived_at: true },
    });
    expect(old.status).toBe('accepted');
    expect(old.archive_reason).toBe('superseded');
    expect(old.archived_at).not.toBeNull();
    const current = await owner.hse_document_acknowledgements.findMany({
      where: { document_id: DOC.all.id, archived_at: null },
      select: { employee_id: true, version_id: true, status: true },
    });
    expect(current.map((a) => a.employee_id).sort()).toEqual([E1, E2].sort());
    expect(current.every((a) => a.version_id === ALL_V2 && a.status === 'pending')).toBe(true);

    // El empleado ya no lee la versión vieja (ni por la base ni por /api/files).
    const versions = await asCtx(employeeCtx(E1, E1_USER), (tx) =>
      tx.hse_document_versions.findMany({ where: { document_id: DOC.all.id }, select: { id: true } })
    );
    expect(versions.map((v) => v.id)).toEqual([ALL_V2]);
    state.ctx = employeeCtx(E1, E1_USER);
    state.userId = E1_USER;
    expect(await requestHseFile(filePath(COMPANY_A, DOC.all.v1))).toBe(404);
    expect(await requestHseFile(filePath(COMPANY_A, ALL_V2))).toBe(200);
  });

  it('la conciliación archiva al cambiar de puesto o dar de baja, y desarchiva (con su respuesta) al volver', async () => {
    const positionAck = () =>
      owner.hse_document_acknowledgements.findFirstOrThrow({
        where: { employee_id: E1, document_id: DOC.position.id },
        select: { status: true, archived_at: true, archive_reason: true },
      });
    // Cambio de puesto: el documento de su puesto viejo deja de aplicar (queda como historia, aceptado).
    await owner.employees.update({ where: { id: E1 }, data: { company_position: POSITION_2 } });
    await sync(COMPANY_A, E1);
    expect(await positionAck()).toMatchObject({ status: 'accepted', archive_reason: 'no_longer_applies' });
    const readable = await asCtx(employeeCtx(E1, E1_USER), (tx) => tx.hse_documents.findMany({ select: { id: true } }));
    expect(readable.map((d) => d.id)).not.toContain(DOC.position.id);

    // Vuelve al puesto: se desarchiva con su respuesta (no se le vuelve a pedir).
    await owner.employees.update({ where: { id: E1 }, data: { company_position: POSITION_1 } });
    await sync(COMPANY_A, E1);
    expect(await positionAck()).toEqual({ status: 'accepted', archived_at: null, archive_reason: null });

    // Baja: todo lo suyo se archiva. Reintegro: vuelve.
    await owner.employees.update({ where: { id: E1 }, data: { is_active: false } });
    await sync(COMPANY_A, E1);
    await expect(
      owner.hse_document_acknowledgements.count({ where: { employee_id: E1, archived_at: null } })
    ).resolves.toBe(0);
    await owner.employees.update({ where: { id: E1 }, data: { is_active: true } });
    await sync(COMPANY_A, E1);
    await expect(
      owner.hse_document_acknowledgements.count({ where: { employee_id: E1, archived_at: null } })
    ).resolves.toBe(3);

    // Idempotente: otra pasada no cambia nada.
    const snapshot = await owner.hse_document_acknowledgements.findMany({
      where: { company_id: COMPANY_A },
      orderBy: { id: 'asc' },
      select: { id: true, status: true, archived_at: true },
    });
    await sync(COMPANY_A);
    await expect(
      owner.hse_document_acknowledgements.findMany({
        where: { company_id: COMPANY_A },
        orderBy: { id: 'asc' },
        select: { id: true, status: true, archived_at: true },
      })
    ).resolves.toEqual(snapshot);
  });

  it('la conciliación de una empresa no se puede pedir con el contexto de otra', async () => {
    await expect(
      asCtx(
        { companyId: COMPANY_B, userId: null, kind: 'job' },
        (tx) => tx.$executeRaw`SELECT public.hse_sync_acknowledgements(${COMPANY_A}::uuid)`
      )
    ).rejects.toThrow(/no es la del contexto/);
  });
});

function DOC_INPUT(key: keyof typeof DOC, companyId = COMPANY_A) {
  return { id: DOC[key].id, versionId: DOC[key].v1, companyId, title: `Documento ${key}` };
}
