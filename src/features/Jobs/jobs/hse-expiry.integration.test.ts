import type { PrismaClient } from '@/generated/prisma/client';
import { argentinaDate } from '@/shared/lib/argentina-time';
import type { MailMessage } from '@/shared/lib/mail/transport';
import { ensureCity } from '@/test/db-fixtures';
import {
  asContext,
  createPublishedTraining,
  employeeContext,
  passTraining,
  type TestQuestion,
} from '@/test/hse-fixtures';
import { createTestEmployee, createTestUser, dropTestUsers } from '@/test/permission-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import moment from 'moment';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Job `hse-expiry` (avisos de vencimiento de capacitaciones y documentos HSE) con los roles reales:
 * `npm run test:jobs`.
 *
 * Dos empresas con datos propios: cada empleado recibe UN correo solo con lo suyo. La idempotencia no se prueba solo
 * con el candado de `jobs_runs` (que saltea la misma fecha): al día siguiente la clave única
 * `(empleado, ítem, vencimiento, ventana)` impide repetir el aviso, y cuando el vencimiento pasa sale UNO nuevo
 * «vencido». La ventana es ≤ 30 días (el día 30 entra, el 31 no). El correo se inyecta (nunca SMTP real) y uno que
 * falla se reintenta en la corrida siguiente.
 *
 * La fecha de negocio es HOY (hora argentina): el reintento de correos mira los avisos creados en los 7 días previos a
 * la fecha de la corrida, así que una fecha lejana no los encontraría. El job recorre TODAS las empresas: en una base
 * de desarrollo con datos propios también genera sus avisos (idempotentes, como la corrida real); al final se borran
 * las filas de `jobs_runs` que abrió la suite, para no bloquear la corrida real del día.
 */
const DAY = argentinaDate();
const plus = (days: number) => moment(DAY, 'YYYY-MM-DD').add(days, 'days').format('YYYY-MM-DD');

const COMPANY_A = '7a100000-0000-4000-8000-00000000000a';
const COMPANY_B = '7a100000-0000-4000-8000-00000000000b';
const CREATOR = '7a100000-0000-4000-8000-0000000001aa';
const E1 = '7a100000-0000-4000-8000-0000000002e1';
const E2 = '7a100000-0000-4000-8000-0000000002e2';
const E3 = '7a100000-0000-4000-8000-0000000002e3';
const MAIL = { E1: 'e1@hse-expiry.test', E2: 'e2@hse-expiry.test', E3: 'e3@hse-expiry.test' };
const T_IN_30 = '7a100000-0000-4000-8000-000000000301';
const T_IN_31 = '7a100000-0000-4000-8000-000000000302';
const T_EXPIRED = '7a100000-0000-4000-8000-000000000303';
const T_B = '7a100000-0000-4000-8000-000000000304';
const DOC = '7a100000-0000-4000-8000-000000000401';
const DOC_V1 = '7a100000-0000-4000-8000-000000000402';

const question = (n: number): TestQuestion => ({
  id: `7a100000-0000-4000-8000-0000000005${n.toString().padStart(2, '0')}`,
  points: 1,
  correctOptionId: `7a100000-0000-4000-8000-0000000006${n.toString().padStart(2, '0')}`,
  wrongOptionId: `7a100000-0000-4000-8000-0000000007${n.toString().padStart(2, '0')}`,
});

let owner: PrismaClient;
let suiteStart = new Date();

/** Fija la vigencia de una aprobación (solo con `app.hse_grading`, como lo hacen las funciones del examen). */
async function setValidUntil(trainingId: string, employeeId: string, day: string) {
  await owner.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.hse_grading', 'on', true)`;
    await tx.hse_training_assignments.updateMany({
      where: { training_id: trainingId, employee_id: employeeId },
      data: { valid_until: new Date(`${day}T00:00:00Z`) },
    });
  });
}

async function cleanup(): Promise<void> {
  const companies = [COMPANY_A, COMPANY_B];
  await owner.jobs_runs.deleteMany({ where: { job: 'hse-expiry', started_at: { gte: suiteStart } } });
  await owner.hse_trainings.deleteMany({ where: { company_id: { in: companies } } });
  await owner.hse_documents.deleteMany({ where: { company_id: { in: companies } } });
  await owner.employees.deleteMany({ where: { company_id: { in: companies } } });
  await dropTestUsers(owner, [CREATOR]);
  await owner.company.deleteMany({ where: { id: { in: companies } } });
}

const noticesOf = (employeeId: string) =>
  owner.hse_expiry_notices.findMany({
    where: { employee_id: employeeId },
    orderBy: [{ item_title: 'asc' }, { window: 'asc' }],
    select: { item_title: true, due_on: true, window: true, email_status: true },
  });

describe.skipIf(!RUN_RLS)('job hse-expiry (integración)', () => {
  const sent: MailMessage[] = [];
  /** Destinatarios cuyo envío falla en la próxima corrida (SMTP caído para esa dirección). */
  const failing = new Set<string>();
  const fakeSend = async (message: MailMessage) => {
    const to = String(message.to);
    if (failing.has(to)) return false;
    sent.push(message);
    return true;
  };
  const runJob = async (date: string) => {
    const { runHseExpiryJob } = await import('./hse-expiry');
    return runHseExpiryJob({ date, sendMail: fakeSend });
  };

  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    suiteStart = new Date();
    await cleanup();
    const city = await ensureCity(owner);
    await createTestCompany(owner, { id: COMPANY_A, name: '__hse_expiry_A__', cuit: 'HSE-EXPIRY-A', cityId: city.id });
    await createTestCompany(owner, { id: COMPANY_B, name: '__hse_expiry_B__', cuit: 'HSE-EXPIRY-B', cityId: city.id });
    await createTestUser(owner, { id: CREATOR, email: 'creador@hse-expiry.test', fullname: 'HSE' });
    await createTestEmployee(owner, {
      id: E1,
      companyId: COMPANY_A,
      seed: 7401,
      lastname: 'Uno',
      firstname: 'Ana',
      email: MAIL.E1,
    });
    await createTestEmployee(owner, {
      id: E2,
      companyId: COMPANY_A,
      seed: 7402,
      lastname: 'Dos',
      firstname: 'Beto',
      email: MAIL.E2,
    });
    await createTestEmployee(owner, {
      id: E3,
      companyId: COMPANY_B,
      seed: 7403,
      lastname: 'Tres',
      firstname: 'Ceci',
      email: MAIL.E3,
    });

    const trainings: [string, string, string, string[]][] = [
      [T_IN_30, COMPANY_A, 'Vence el día 30', [E1, E2]],
      [T_IN_31, COMPANY_A, 'Vence el día 31', [E1]],
      [T_EXPIRED, COMPANY_A, 'Ya vencida', [E1]],
      [T_B, COMPANY_B, 'De la otra empresa', [E3]],
    ];
    for (const [index, [id, companyId, title, employees]] of trainings.entries()) {
      const questions = [question(index + 1)];
      await createPublishedTraining(owner, { id, companyId, title, createdBy: CREATOR, validityMonths: 12, questions });
      for (const employeeId of employees) {
        await passTraining(employeeContext(companyId, employeeId, CREATOR), id, questions);
      }
    }
    await setValidUntil(T_IN_30, E1, plus(30));
    await setValidUntil(T_IN_30, E2, plus(30));
    await setValidUntil(T_IN_31, E1, plus(31));
    await setValidUntil(T_EXPIRED, E1, plus(-1));
    await setValidUntil(T_B, E3, plus(5));

    // Documento publicado que vence en 15 días: le aplica a toda la empresa A.
    await owner.hse_documents.create({
      data: { id: DOC, company_id: COMPANY_A, title: 'Procedimiento de altura', created_by: CREATOR },
    });
    await owner.hse_document_versions.create({
      data: {
        id: DOC_V1,
        company_id: COMPANY_A,
        document_id: DOC,
        version: 1,
        file_path: `${COMPANY_A}/documents/${DOC}/${DOC_V1}.pdf`,
        file_name: 'altura.pdf',
        file_size: 3,
        file_sha256: 'a'.repeat(64),
        expires_at: new Date(`${plus(15)}T00:00:00Z`),
        created_by: CREATOR,
      },
    });
    await owner.hse_document_targets.create({ data: { company_id: COMPANY_A, document_id: DOC, kind: 'all' } });
    await owner.hse_documents.update({ where: { id: DOC }, data: { status: 'published', current_version_id: DOC_V1 } });
    await owner.$executeRaw`SELECT public.hse_sync_acknowledgements(${COMPANY_A}::uuid)`;
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await owner.$disconnect();
  }, 60_000);

  it('avisa lo que vence en ≤ 30 días o ya venció, un correo por empleado y solo con lo suyo', async () => {
    failing.add(MAIL.E2);
    const summary = await runJob(DAY);
    expect(summary.units.find((u) => u.companyId === COMPANY_A)?.status).toBe('ok');
    expect(summary.units.find((u) => u.companyId === COMPANY_B)?.status).toBe('ok');

    const e1 = await noticesOf(E1);
    expect(e1.map((n) => [n.item_title, n.window])).toEqual([
      ['Procedimiento de altura', 'upcoming'],
      ['Vence el día 30', 'upcoming'],
      ['Ya vencida', 'expired'],
    ]);
    // El día 31 queda afuera de la ventana.
    expect(e1.map((n) => n.item_title)).not.toContain('Vence el día 31');
    expect(e1.every((n) => n.email_status === 'sent')).toBe(true);

    // Un correo por empleado, con sus avisos y nada de la otra empresa.
    const toE1 = sent.filter((m) => String(m.to) === MAIL.E1);
    expect(toE1).toHaveLength(1);
    expect(toE1[0]!.text).toContain('Ya vencida');
    expect(toE1[0]!.text).not.toContain('De la otra empresa');
    const toE3 = sent.filter((m) => String(m.to) === MAIL.E3);
    expect(toE3).toHaveLength(1);
    expect(toE3[0]!.text).toContain('De la otra empresa');
    expect(toE3[0]!.text).not.toContain('Vence el día 30');
    // El de E2 falló: queda para reintentar.
    expect((await noticesOf(E2)).map((n) => n.email_status)).toEqual(['failed', 'failed']);
  });

  it('la misma fecha no vuelve a correr; el día siguiente no repite avisos y reintenta el correo fallido', async () => {
    failing.clear();
    const before = sent.length;
    const same = await runJob(DAY);
    expect(same.units.find((u) => u.companyId === COMPANY_A)?.status).toBe('skipped');
    expect(sent.length).toBe(before);

    await runJob(plus(1));
    // Lo ya avisado no se repite; entra solo lo que cruzó el umbral (el del día 31 ahora está a 30 días).
    const e1 = await noticesOf(E1);
    expect(e1.map((n) => [n.item_title, n.window])).toEqual([
      ['Procedimiento de altura', 'upcoming'],
      ['Vence el día 30', 'upcoming'],
      ['Vence el día 31', 'upcoming'],
      ['Ya vencida', 'expired'],
    ]);
    const mails = sent.slice(before);
    expect(mails.map((m) => String(m.to)).sort()).toEqual([MAIL.E1, MAIL.E2].sort());
    const toE1 = mails.find((m) => String(m.to) === MAIL.E1)!;
    expect(toE1.text).toContain('Vence el día 31');
    expect(toE1.text).not.toContain('Ya vencida');
    // El reintento de E2 lleva sus dos avisos y quedan enviados.
    expect((await noticesOf(E2)).map((n) => n.email_status)).toEqual(['sent', 'sent']);
  });

  it('cuando el vencimiento pasa sale UN aviso nuevo «vencido» del mismo ítem', async () => {
    await runJob(plus(31));
    const e1 = await noticesOf(E1);
    const day30 = e1.filter((n) => n.item_title === 'Vence el día 30').map((n) => n.window);
    expect(day30).toEqual(['upcoming', 'expired']);
    // El del día 31 vence hoy: sigue «por vencer» (ya avisado, no se repite).
    expect(e1.filter((n) => n.item_title === 'Vence el día 31').map((n) => n.window)).toEqual(['upcoming']);
    // Al día siguiente vence: exactamente UN aviso nuevo, nada más se repite.
    const count = await owner.hse_expiry_notices.count({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
    await runJob(plus(32));
    await expect(
      owner.hse_expiry_notices.count({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } })
    ).resolves.toBe(count + 1);
    expect((await noticesOf(E1)).filter((n) => n.item_title === 'Vence el día 31').map((n) => n.window)).toEqual([
      'upcoming',
      'expired',
    ]);
  });

  it('el empleado ve solo sus avisos (RLS por empleado)', async () => {
    await expect(
      asContext(employeeContext(COMPANY_A, E1, CREATOR), (tx) => tx.hse_expiry_notices.count())
    ).resolves.toBe(await owner.hse_expiry_notices.count({ where: { employee_id: E1 } }));
    const seen = await asContext(employeeContext(COMPANY_A, E2, CREATOR), (tx) =>
      tx.hse_expiry_notices.findMany({ select: { employee_id: true } })
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((n) => n.employee_id === E2)).toBe(true);
  });
});
