import type { PortalEmployee } from '@/features/Portal/actions/perimeter';
import type { PrismaClient } from '@/generated/prisma/client';
import type { MailMessage } from '@/shared/lib/mail/transport';
import type { TenantContext } from '@/shared/lib/tenant-context';
import { ensureCity } from '@/test/db-fixtures';
import {
  asContext,
  callAsEmployee,
  createPublishedTraining,
  employeeContext,
  openExpiredAttempt,
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
 * Restos del ticket 804 bajo el rol REAL de la app (`alphataco_app`): evaluación en PDF, reporte de tiempos y avisos
 * por mail al publicar.
 *
 * - Abrir un material NO cuenta como leerlo (no destraba el examen); el empleado ve solo sus aperturas y no escribe directo.
 * - El reporte mide estudio (apertura → «Ya lo leí») y examen (inicio → cierre; un intento vencido se cierra en su
 *   `deadline_at`); sin marcas devuelve null, nunca 0.
 * - La hoja de evaluación del dashboard lleva el detalle por pregunta; la del portal NO, y un empleado no baja la ajena.
 * - Los avisos van solo a empleados activos con acceso al portal habilitado, uno por persona, y no se mandan si el
 *   portal está apagado para la empresa.
 *
 * Corre con `scripts/test-rls.sh`.
 */
const state = vi.hoisted(() => ({
  ctx: null as TenantContext | null,
  portal: null as unknown as PortalEmployee | null,
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
vi.mock('@/shared/lib/tenant-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant-db')>()),
  getTenantContextOrNull: async () => state.ctx,
}));
vi.mock('@/shared/lib/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant')>()),
  getActiveCompanyId: async () => {
    if (!state.ctx) throw new Error('sin empresa activa');
    return state.ctx.companyId;
  },
}));
vi.mock('@/features/Permissions/actions/permissions.server', () => ({
  checkPermissionServer: async () => true,
}));
vi.mock('@/features/Portal/actions/perimeter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/Portal/actions/perimeter')>()),
  requirePortalEmployee: async () => {
    if (!state.portal) throw new Error('Tu sesión venció. Volvé a iniciar sesión.');
    return state.portal;
  },
}));

vi.mock('@/features/Portal/lib/signature.server', () => ({
  checkSignaturePassword: async () => null,
  requestFingerprint: async () => ({ ip: '10.0.0.9', userAgent: 'vitest' }),
}));

const P = '7d000000-0000-4000-8000-';
const COMPANY_A = `${P}00000000000a`;
const COMPANY_B = `${P}00000000000b`;
const HSE_USER = `${P}0000000001aa`;
const E1_USER = `${P}0000000001e1`;
const E2_USER = `${P}0000000001e2`;
const E3_USER = `${P}0000000001e3`;
const E1 = `${P}0000000002e1`;
const E2 = `${P}0000000002e2`;
const E3 = `${P}0000000002e3`;
const E4 = `${P}0000000002e4`;
const MATERIAL = `${P}000000000301`;
const TRAINING = `${P}000000000401`;
const ATTEMPT = `${P}000000000501`;
const DOC = `${P}000000000601`;
const DOC_V1 = `${P}000000000611`;
const ROLE_HSE = '__rls_hse_tiempos_rol__';
const QUESTIONS: TestQuestion[] = [
  { id: `${P}000000000701`, points: 5, correctOptionId: `${P}000000000711`, wrongOptionId: `${P}000000000721` },
  { id: `${P}000000000702`, points: 5, correctOptionId: `${P}000000000712`, wrongOptionId: `${P}000000000722` },
];

let owner: PrismaClient;
const catalog = emptyCatalogRows();
const hseCtx: TenantContext = { companyId: COMPANY_A, userId: HSE_USER, kind: 'user' };
const ctx1 = employeeContext(COMPANY_A, E1, E1_USER);
const ctx2 = employeeContext(COMPANY_A, E2, E2_USER);

const portalEmployee = (employeeId: string, userId: string): PortalEmployee => ({
  userId,
  companyId: COMPANY_A,
  companyName: 'Empresa',
  employeeId,
  file: null,
  firstname: 'Empleado',
  lastname: 'Prueba',
  position: null,
  sector: null,
  picture: null,
  email: null,
  admissionDate: null,
  access: { method: 'temporary_password', grantedAt: new Date() },
  needsPasswordChange: false,
});

async function cleanup(): Promise<void> {
  const companies = [COMPANY_A, COMPANY_B];
  await owner.notification_events.deleteMany({ where: { company_id: { in: companies } } });
  await owner.hse_documents.deleteMany({ where: { company_id: { in: companies } } });
  await owner.hse_trainings.deleteMany({ where: { company_id: { in: companies } } });
  await owner.employee_portal_access.deleteMany({ where: { company_id: { in: companies } } });
  await owner.company_modules.deleteMany({ where: { company_id: { in: companies } } });
  await owner.employees.deleteMany({ where: { company_id: { in: companies } } });
  await owner.user_roles.deleteMany({ where: { user_id: HSE_USER } });
  await owner.roles.deleteMany({ where: { name: ROLE_HSE } });
  await dropTestUsers(owner, [HSE_USER, E1_USER, E2_USER, E3_USER]);
  await owner.company.deleteMany({ where: { id: { in: companies } } });
}

/**
 * Corre la acción con el contexto fijado por scope (`runInTenantScope`), como la API móvil. Sin esto el cliente
 * contextual resuelve el contexto con un import dinámico por consulta, y bajo `vi.mock` las consultas concurrentes de
 * un `Promise.all` (la lista y su `count`) corren sin contexto y la RLS devuelve cero filas. En la app no pasa.
 */
async function inScope<T>(ctx: TenantContext, fn: () => Promise<T>): Promise<T> {
  const { runInTenantScope } = await import('@/shared/lib/tenant-context');
  state.ctx = ctx;
  return runInTenantScope(ctx, fn);
}

const open = (ctx: TenantContext) =>
  asContext(ctx, (tx) => tx.$executeRaw`SELECT public.hse_mark_material_opened(${MATERIAL}::uuid)`);
const markRead = (ctx: TenantContext) =>
  asContext(ctx, (tx) => tx.$executeRaw`SELECT public.hse_mark_material_read(${MATERIAL}::uuid)`);

describe.skipIf(!RUN_RLS)('evaluación PDF, tiempos y avisos HSE bajo RLS (rol alphataco_app)', () => {
  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    const city = await ensureCity(owner);
    for (const [id, suffix] of [
      [COMPANY_A, 'A'],
      [COMPANY_B, 'B'],
    ] as const) {
      await createTestCompany(owner, {
        id,
        name: `__rls_hse_tiempos_${suffix}__`,
        cuit: `RLS-HSE-TIEMPOS-${suffix}`,
        cityId: city.id,
      });
    }
    await createTestEmployee(owner, {
      id: E1,
      companyId: COMPANY_A,
      seed: 7401,
      lastname: 'Uno',
      firstname: 'Ana',
      file: '7401',
    });
    await createTestEmployee(owner, {
      id: E2,
      companyId: COMPANY_A,
      seed: 7402,
      lastname: 'Dos',
      firstname: 'Beto',
      file: '7402',
      email: 'beto@legajo.test',
    });
    // Con acceso al portal pero de baja: no recibe avisos.
    await createTestEmployee(owner, {
      id: E3,
      companyId: COMPANY_A,
      seed: 7403,
      lastname: 'Tres',
      firstname: 'Cata',
      file: '7403',
      isActive: false,
    });
    await createTestEmployee(owner, {
      id: E4,
      companyId: COMPANY_B,
      seed: 7404,
      lastname: 'Cuatro',
      firstname: 'Dani',
      file: '7404',
    });
    await createTestUser(owner, { id: HSE_USER, email: 'hse@rls-hse-tiempos.test', fullname: 'Responsable HSE' });
    await owner.share_company_users.create({ data: { company_id: COMPANY_A, profile_id: HSE_USER } });
    // Rol con el aviso de rechazo de documento activo (campanita y mail), asignado al responsable de HSE.
    const role = await owner.roles.create({ data: { name: ROLE_HSE }, select: { id: true } });
    await owner.role_notifications.createMany({
      data: [
        { role_id: role.id, event_key: 'hse.document_rejected', channel: 'in_app' },
        { role_id: role.id, event_key: 'hse.document_rejected', channel: 'email' },
      ],
    });
    await owner.user_roles.create({ data: { user_id: HSE_USER, company_id: COMPANY_A, role_id: role.id } });
    await grantPermissions(owner, catalog, {
      userId: HSE_USER,
      companyId: COMPANY_A,
      keys: ['hse:capacitaciones:view', 'hse:capacitaciones:approve', 'hse:documentos-hse:view'],
    });
    await createTestUser(owner, {
      id: E1_USER,
      email: 'ana@rls-hse-tiempos.test',
      fullname: 'Ana Uno',
      employeeId: E1,
    });
    await createTestUser(owner, {
      id: E2_USER,
      email: 'beto@rls-hse-tiempos.test',
      fullname: 'Beto Dos',
      employeeId: E2,
    });
    await createTestUser(owner, {
      id: E3_USER,
      email: 'cata@rls-hse-tiempos.test',
      fullname: 'Cata Tres',
      employeeId: E3,
    });
    // E1 y E3 (de baja) tienen el acceso habilitado; E2 no.
    for (const [employeeId, credentialId] of [
      [E1, E1_USER],
      [E3, E3_USER],
    ] as const) {
      await owner.employee_portal_access.create({
        data: {
          company_id: COMPANY_A,
          employee_id: employeeId,
          credential_id: credentialId,
          status: 'enabled',
          method: 'temporary_password',
          granted_by: HSE_USER,
        },
      });
    }

    await createPublishedTraining(owner, {
      id: TRAINING,
      companyId: COMPANY_A,
      title: 'Trabajo en altura',
      createdBy: HSE_USER,
      validityMonths: 12,
      timeLimitMinutes: 15,
      questions: QUESTIONS,
      materialIds: [MATERIAL],
    });
    await owner.hse_documents.create({
      data: { id: DOC, company_id: COMPANY_A, title: 'Norma de altura <b>', created_by: HSE_USER },
    });
    await owner.hse_document_versions.create({
      data: {
        id: DOC_V1,
        company_id: COMPANY_A,
        document_id: DOC,
        version: 1,
        file_path: `${COMPANY_A}/documents/${DOC}/${DOC_V1}.pdf`,
        file_name: 'norma.pdf',
        file_size: 3,
        file_sha256: 'a'.repeat(64),
        created_by: HSE_USER,
      },
    });
    await owner.hse_document_targets.create({ data: { company_id: COMPANY_A, document_id: DOC, kind: 'all' } });
    await owner.hse_documents.update({ where: { id: DOC }, data: { current_version_id: DOC_V1, status: 'published' } });
    await owner.$executeRaw`SELECT public.hse_sync_acknowledgements(${COMPANY_A}::uuid, NULL::uuid, NULL::uuid)`;
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await dropCatalogRows(owner, catalog);
    await owner.$disconnect();
  });

  it('avisos de publicación: uno por empleado activo con acceso al portal habilitado, nunca a los demás', async () => {
    const { sendHsePublicationNotices } = await import('./lib/publication-notices.server');
    const sent: MailMessage[] = [];
    const sendMail = async (message: MailMessage) => {
      sent.push(message);
      return true;
    };

    const training = await sendHsePublicationNotices(
      { kind: 'training', companyId: COMPANY_A, trainingId: TRAINING },
      { sendMail }
    );
    // E1: sí. E2: sin acceso al portal. E3: con acceso pero de baja (ni siquiera tiene asignación vigente).
    expect(training).toMatchObject({ skipped: null, recipients: 1, sent: 1, failed: 0, withoutEmail: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toEqual(['ana@rls-hse-tiempos.test']);
    expect(sent[0]?.subject).toContain('Capacitación asignada');
    expect(sent[0]?.text).toContain(`/portal/trainings/${TRAINING}`);

    sent.length = 0;
    const document = await sendHsePublicationNotices(
      { kind: 'document', companyId: COMPANY_A, documentId: DOC, versionId: DOC_V1 },
      { sendMail }
    );
    expect(document).toMatchObject({ skipped: null, recipients: 1, sent: 1, withoutEmail: 1 });
    expect(sent[0]?.to).toEqual(['ana@rls-hse-tiempos.test']);
    // El título libre va escapado en el HTML.
    expect(sent[0]?.html).not.toContain('<b>');

    // Un mail que falla se cuenta, no lanza.
    const failing = await sendHsePublicationNotices(
      { kind: 'training', companyId: COMPANY_A, trainingId: TRAINING },
      { sendMail: async () => false }
    );
    expect(failing).toMatchObject({ recipients: 1, sent: 0, failed: 1 });
  });

  it('sin portal encendido para la empresa no se manda nada', async () => {
    const { sendHsePublicationNotices } = await import('./lib/publication-notices.server');
    await owner.company_modules.upsert({
      where: { company_id_module_key: { company_id: COMPANY_A, module_key: 'portal' } },
      create: { company_id: COMPANY_A, module_key: 'portal', enabled: false, changed_by: 'test', reason: 'test' },
      update: { enabled: false },
    });
    const sendMail = vi.fn(async () => true);
    try {
      const result = await sendHsePublicationNotices(
        { kind: 'training', companyId: COMPANY_A, trainingId: TRAINING },
        { sendMail }
      );
      expect(result.skipped).not.toBeNull();
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      await owner.company_modules.deleteMany({ where: { company_id: COMPANY_A, module_key: 'portal' } });
    }
  });

  it('abrir un material no es leerlo: no destraba el examen, y cada empleado ve solo sus aperturas', async () => {
    await open(ctx1);
    await open(ctx1); // idempotente: la primera apertura queda
    await expect(owner.hse_training_material_opens.count({ where: { employee_id: E1 } })).resolves.toBe(1);
    await expect(owner.hse_training_material_reads.count({ where: { employee_id: E1 } })).resolves.toBe(0);
    const started = await callAsEmployee<{ ok: boolean; reason?: string }>(
      ctx1,
      (tx) => tx.$queryRaw`SELECT public.hse_start_attempt(${TRAINING}::uuid) AS r`
    );
    expect(started).toMatchObject({ ok: false, reason: 'materials_pending' });

    await expect(asContext(ctx1, (tx) => tx.hse_training_material_opens.count())).resolves.toBe(1);
    await expect(asContext(ctx2, (tx) => tx.hse_training_material_opens.count())).resolves.toBe(0);
    await expect(asContext(hseCtx, (tx) => tx.hse_training_material_opens.count())).resolves.toBe(1);
    // Escribir directo no se puede (solo la función), ni siquiera la propia fila.
    await expect(
      asContext(ctx1, (tx) =>
        tx.hse_training_material_opens.updateMany({
          where: { employee_id: E1 },
          data: { first_opened_at: new Date(0) },
        })
      )
    ).resolves.toEqual({ count: 0 });
    // Un material de otra capacitación / inexistente no se puede abrir.
    await expect(
      asContext(ctx1, (tx) => tx.$executeRaw`SELECT public.hse_mark_material_opened(${DOC}::uuid)`)
    ).rejects.toThrow(/no está disponible/);
  });

  it('el reporte mide estudio (apertura → lectura) y examen (inicio → cierre); sin marcas es null, no 0', async () => {
    await markRead(ctx1);
    // Estudio: la apertura fue 10 minutos antes de la lectura.
    await owner.$executeRaw`
      UPDATE public.hse_training_material_opens o
      SET first_opened_at = r.read_at - interval '10 minutes'
      FROM public.hse_training_material_reads r
      WHERE o.material_id = r.material_id AND o.employee_id = r.employee_id AND o.employee_id = ${E1}::uuid`;
    // Examen: 15 minutos exactos (empezó hace 20, venció hace 5) y lo corrige el propio empleado.
    await openExpiredAttempt(owner, {
      attemptId: ATTEMPT,
      companyId: COMPANY_A,
      trainingId: TRAINING,
      employeeId: E1,
      questionIds: QUESTIONS.map((q) => q.id),
      maxPoints: 10,
    });
    await callAsEmployee(ctx1, (tx) => tx.$queryRaw`SELECT public.hse_grade_attempt(${ATTEMPT}::uuid) AS r`);
    // E2 solo leyó, sin abrir con la marca (como un legajo anterior al registro de aperturas).
    await asContext(ctx2, (tx) => tx.$executeRaw`SELECT public.hse_mark_material_read(${MATERIAL}::uuid)`);

    const { getHseTimesPaginated, getAllHseTimesForExport } = await import('./Times/TimesList/actions.server');
    const { data, total } = await inScope(hseCtx, () => getHseTimesPaginated({}));
    expect(total).toBe(2);
    const row1 = data.find((r) => r.employee.id === E1)!;
    const row2 = data.find((r) => r.employee.id === E2)!;
    expect(row1).toMatchObject({
      study_seconds: 600,
      study_measured: 1,
      study_total: 1,
      exam_attempts: 1,
      exam_last_seconds: 900,
      exam_total_seconds: 900,
    });
    expect(row2).toMatchObject({ study_seconds: null, study_measured: 0, exam_attempts: 0, exam_last_seconds: null });

    // Filtros del servidor: por capacitación, por legajo y por estado.
    await expect(inScope(hseCtx, () => getHseTimesPaginated({ training: TRAINING }))).resolves.toMatchObject({
      total: 2,
    });
    await expect(inScope(hseCtx, () => getHseTimesPaginated({ file: '7402' }))).resolves.toMatchObject({ total: 1 });
    await expect(
      inScope(hseCtx, () => getHseTimesPaginated({ training: '7d000000-0000-4000-8000-0000000009ff' }))
    ).resolves.toMatchObject({ total: 0 });
    const exported = await inScope(hseCtx, () => getAllHseTimesForExport({}));
    expect(exported.ok && exported.data.length).toBe(2);
  });

  it('la hoja de evaluación: el dashboard lleva el detalle por pregunta, el portal no, y la ajena no se baja', async () => {
    const { loadEvaluationData } = await import('./pdf/evaluation-pdf.server');
    const { getHseAttemptEvaluationPdf } = await import('./actions/trainings.server');
    const { getMyHseEvaluationPdf } = await import('@/features/Portal/actions/hse-evaluations.server');

    const dashboard = await inScope(hseCtx, () =>
      loadEvaluationData(ATTEMPT, { kind: 'dashboard', companyId: COMPANY_A })
    );
    expect(dashboard?.data.questions).toHaveLength(2);
    expect(dashboard?.data.questions?.every((q) => q.result === 'unanswered' && q.correct === 'Opción A')).toBe(true);
    expect(dashboard?.data.attempt).toMatchObject({ durationSeconds: 900, status: 'expired', passed: false });
    expect(dashboard?.data.employee).toMatchObject({ fullName: 'Uno Ana', file: '7401' });

    const pdf = await inScope(hseCtx, () => getHseAttemptEvaluationPdf(ATTEMPT));
    expect(pdf.ok).toBe(true);
    if (pdf.ok) {
      expect(Buffer.from(pdf.data.file.base64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.data.file.filename).toMatch(/^evaluacion-.*\.pdf$/);
    }
    await expect(inScope(hseCtx, () => getHseAttemptEvaluationPdf(`${P}0000000009aa`))).resolves.toMatchObject({
      ok: false,
    });

    // Portal: el dueño baja su constancia de resultado (sin detalle); otro empleado no la ve.
    state.portal = portalEmployee(E1, E1_USER);
    const own = await inScope(ctx1, () => getMyHseEvaluationPdf({ attemptId: ATTEMPT }));
    expect(own.ok).toBe(true);
    const portalData = await inScope(ctx1, () =>
      loadEvaluationData(ATTEMPT, {
        kind: 'portal',
        companyId: COMPANY_A,
        employee: { id: E1, firstname: 'Ana', lastname: 'Uno', file: '7401' },
      })
    );
    expect(portalData?.data.questions).toBeNull();

    state.portal = portalEmployee(E2, E2_USER);
    await expect(inScope(ctx2, () => getMyHseEvaluationPdf({ attemptId: ATTEMPT }))).resolves.toMatchObject({
      ok: false,
    });
    state.portal = null;
    await expect(inScope(ctx2, () => getMyHseEvaluationPdf({ attemptId: ATTEMPT }))).resolves.toMatchObject({
      ok: false,
    });
  });

  it('cuando un empleado rechaza un documento, HSE se entera por los roles con el aviso activo', async () => {
    const { respondHseDocument } = await import('@/features/Portal/actions/hse-documents.server');
    const ack = await owner.hse_document_acknowledgements.findFirstOrThrow({
      where: { employee_id: E1, document_id: DOC, archived_at: null, status: 'pending' },
      select: { id: true },
    });
    state.portal = portalEmployee(E1, E1_USER);
    // Un empleado no avisa sin motivo: el esquema lo exige antes de tocar nada.
    await expect(
      inScope(ctx1, () => respondHseDocument({ ackId: ack.id, decision: 'reject', reason: 'no' }))
    ).resolves.toMatchObject({ ok: false });
    await expect(owner.notification_events.count({ where: { company_id: COMPANY_A } })).resolves.toBe(0);

    const reason = 'La norma no contempla el trabajo nocturno';
    await expect(
      inScope(ctx1, () => respondHseDocument({ ackId: ack.id, decision: 'reject', reason }))
    ).resolves.toMatchObject({ ok: true, data: { status: 'rejected' } });
    const events = await owner.notification_events.findMany({
      where: { company_id: COMPANY_A, event_key: 'hse.document_rejected' },
      select: {
        title: true,
        body: true,
        href: true,
        dedupe_key: true,
        deliveries: { select: { user_id: true, in_app: true, email: true } },
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      body: reason,
      href: `/dashboard/hse/documents/${DOC}`,
      dedupe_key: `hse.document_rejected:${ack.id}`,
    });
    expect(events[0]?.title).toContain('rechazó');
    // Solo quien tiene el rol con el aviso Y el permiso de ver documentos HSE; el empleado no.
    expect(events[0]?.deliveries).toEqual([{ user_id: HSE_USER, in_app: true, email: true }]);
  });
});
