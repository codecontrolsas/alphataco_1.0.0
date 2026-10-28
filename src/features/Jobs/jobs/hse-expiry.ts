import 'server-only';

import { isHseEnabled } from '@/features/Hse/lib/feature-gate';
import { notify } from '@/features/Notifications/lib/dispatch.server';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import type { SendMail } from '@/shared/lib/mail/transport';
import { sendMail as defaultSendMail } from '@/shared/lib/mail/transport';
import { prismaSystem } from '@/shared/lib/prisma-system';
import moment from 'moment';
import { runJobForEachCompany } from '../lib/per-company';
import type { JobSummary } from '../lib/types';
import {
  renderHseEmployeeExpiryEmail,
  renderHseExpirySummaryEmail,
  type HseEmployeeNoticeItem,
} from '../templates/hse-expiry';

/**
 * Job diario 07:20 (hora argentina) — `GET /api/jobs/hse-expiry`.
 *
 * 1. **Avisos al empleado**: por cada capacitación aprobada cuya vigencia vence en los próximos 30 días (o ya venció) y
 *    cada documento HSE vigente que le aplica cuyo vencimiento cae en esa ventana, registra un aviso en
 *    `hse_expiry_notices` (lo ve en el inicio del portal) y le manda UN mail con todos sus avisos nuevos (si hay SMTP
 *    y tiene correo). La clave única `(empleado, ítem, vencimiento, ventana)` hace idempotente al aviso: el mismo
 *    vencimiento avisa una vez "por vencer" y otra "vencido"; una aprobación nueva (otro vencimiento) vuelve a avisar.
 *    Los mails `pending`/`failed` se reintentan en cada corrida. Ventana por umbral (≤ 30 días), no por igualdad: un
 *    día sin corrida no saltea avisos.
 * 2. **Resumen a HSE** (los lunes): vencidos, por vencer y pendientes de la empresa, con `notify` (roles con el aviso
 *    `hse.expiry_weekly` activo y permiso de cumplimiento HSE). El empleado no tiene rol: por eso sus avisos van por la
 *    tabla propia y no por `notify` (`resolve_notification_recipients` solo resuelve miembros con rol).
 *
 * Corre con `prismaSystem` y la empresa SIEMPRE explícita en cada consulta: las tablas por empleado fallan cerradas
 * para el actor `job` (no tiene empleado ni permisos). Idempotencia de la corrida: clave `<empresa>:<fecha AR>`.
 */
const JOB = 'hse-expiry' as const;
export const HSE_EXPIRY_WINDOW_DAYS = 30;

const logger = new Logger('features/Jobs/hse-expiry');

const dateOnly = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (value: Date) => value.toISOString().slice(0, 10);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface HseExpiryJobDeps {
  date?: string;
  sendMail?: SendMail;
  /** Fuerza el resumen a HSE aunque no sea lunes (corridas manuales y pruebas). */
  forceSummary?: boolean;
}

type Candidate = {
  employeeId: string;
  kind: 'training' | 'document';
  itemId: string;
  title: string;
  dueOn: string;
  window: 'upcoming' | 'expired';
};

async function collectCandidates(companyId: string, today: string, limit: string) {
  const [trainings, acknowledgements] = await Promise.all([
    prismaSystem.hse_training_assignments.findMany({
      where: {
        company_id: companyId,
        archived_at: null,
        status: 'passed',
        valid_until: { not: null, lte: dateOnly(limit) },
        training: { status: 'published' },
        employee: { is_active: true },
      },
      select: {
        employee_id: true,
        valid_until: true,
        training: { select: { id: true, title: true } },
        employee: { select: { file: true, firstname: true, lastname: true } },
      },
    }),
    prismaSystem.hse_document_acknowledgements.findMany({
      where: {
        company_id: companyId,
        archived_at: null,
        document: { status: 'published' },
        version: { expires_at: { not: null, lte: dateOnly(limit) } },
        employee: { is_active: true },
      },
      select: {
        employee_id: true,
        version_id: true,
        document: { select: { id: true, title: true, current_version_id: true } },
        version: { select: { version: true, expires_at: true } },
      },
    }),
  ]);

  const candidates: Candidate[] = [];
  for (const t of trainings) {
    const dueOn = dayOf(t.valid_until as Date);
    candidates.push({
      employeeId: t.employee_id,
      kind: 'training',
      itemId: t.training.id,
      title: t.training.title,
      dueOn,
      window: dueOn < today ? 'expired' : 'upcoming',
    });
  }
  // Solo la versión VIGENTE del documento (una anterior archivada ya no cuenta).
  const currentAcks = acknowledgements.filter((a) => a.document.current_version_id === a.version_id);
  for (const a of currentAcks) {
    const dueOn = dayOf(a.version.expires_at as Date);
    candidates.push({
      employeeId: a.employee_id,
      kind: 'document',
      itemId: a.document.id,
      title: a.document.title,
      dueOn,
      window: dueOn < today ? 'expired' : 'upcoming',
    });
  }
  return { candidates, trainings, currentAcks };
}

/** Correo del empleado: el de su acceso al portal (con el que entra) o, si no tiene, el del legajo. */
async function employeeEmails(companyId: string, employeeIds: string[]) {
  if (employeeIds.length === 0) return new Map<string, { email: string | null; name: string }>();
  const [employees, access] = await Promise.all([
    prismaSystem.employees.findMany({
      where: { company_id: companyId, id: { in: employeeIds } },
      select: { id: true, email: true, firstname: true },
    }),
    prismaSystem.employee_portal_access.findMany({
      where: { company_id: companyId, employee_id: { in: employeeIds }, status: 'enabled' },
      select: { employee_id: true, credential_id: true },
    }),
  ]);
  const users = access.length
    ? await prismaSystem.user.findMany({
        where: { id: { in: access.map((a) => a.credential_id) } },
        select: { id: true, email: true },
      })
    : [];
  const userEmail = new Map(users.map((u) => [u.id, u.email]));
  const accessEmail = new Map(access.map((a) => [a.employee_id, userEmail.get(a.credential_id) ?? null]));
  return new Map(
    employees.map((e) => {
      const email = [accessEmail.get(e.id), e.email].find((v): v is string => !!v && EMAIL_RE.test(v.trim())) ?? null;
      return [e.id, { email: email?.trim() ?? null, name: e.firstname }];
    })
  );
}

export async function runHseExpiryJob(deps: HseExpiryJobDeps = {}): Promise<JobSummary> {
  const date = deps.date ?? argentinaDate();
  const send = deps.sendMail ?? defaultSendMail;
  const limit = moment(date, 'YYYY-MM-DD').add(HSE_EXPIRY_WINDOW_DAYS, 'days').format('YYYY-MM-DD');
  const isMonday = moment(date, 'YYYY-MM-DD').isoWeekday() === 1;

  return runJobForEachCompany({
    job: JOB,
    date,
    work: async (company) => {
      if (!isHseEnabled()) return { skipped: true, reason: 'HSE apagado en la instancia' };

      const { candidates, trainings, currentAcks } = await collectCandidates(company.id, date, limit);
      const contacts = await employeeEmails(company.id, [...new Set(candidates.map((c) => c.employeeId))]);

      // 1. Avisos (idempotentes por la clave única).
      const created = candidates.length
        ? (
            await prismaSystem.hse_expiry_notices.createMany({
              data: candidates.map((c) => {
                const email = contacts.get(c.employeeId)?.email ?? null;
                return {
                  company_id: company.id,
                  employee_id: c.employeeId,
                  item_kind: c.kind,
                  item_id: c.itemId,
                  item_title: c.title,
                  due_on: dateOnly(c.dueOn),
                  window: c.window,
                  email_to: email,
                  email_status: email ? 'pending' : 'none',
                };
              }),
              skipDuplicates: true,
            })
          ).count
        : 0;

      // 2. Mails pendientes o fallidos (los nuevos y los de corridas anteriores), uno por empleado.
      const toSend = await prismaSystem.hse_expiry_notices.findMany({
        where: { company_id: company.id, email_status: { in: ['pending', 'failed'] }, email_to: { not: null } },
        orderBy: [{ employee_id: 'asc' }, { due_on: 'asc' }],
        select: {
          id: true,
          employee_id: true,
          email_to: true,
          item_kind: true,
          item_title: true,
          due_on: true,
          window: true,
        },
      });
      const byEmployee = new Map<string, typeof toSend>();
      for (const n of toSend) byEmployee.set(n.employee_id, [...(byEmployee.get(n.employee_id) ?? []), n]);
      let emailsSent = 0;
      let emailsFailed = 0;
      for (const [employeeId, notices] of byEmployee) {
        const to = notices[0]?.email_to;
        if (!to) continue;
        const items: HseEmployeeNoticeItem[] = notices.map((n) => ({
          kind: n.item_kind,
          title: n.item_title,
          dueOn: dayOf(n.due_on),
          window: n.window,
        }));
        const email = renderHseEmployeeExpiryEmail({
          companyName: company.company_name,
          employeeName: contacts.get(employeeId)?.name ?? '',
          today: date,
          items,
        });
        const sent = await send({ to: [to], subject: email.subject, html: email.html, text: email.text });
        await prismaSystem.hse_expiry_notices.updateMany({
          where: { id: { in: notices.map((n) => n.id) } },
          data: { email_status: sent ? 'sent' : 'failed', emailed_at: sent ? new Date() : null },
        });
        if (sent) emailsSent += 1;
        else emailsFailed += 1;
      }

      // 3. Resumen semanal a HSE.
      let summary: 'sent' | 'no_recipients' | 'duplicate' | 'not_today' = 'not_today';
      let summaryEmailSent = false;
      if (isMonday || deps.forceSummary) {
        const [pendingAcks, pendingTrainings, passed, signed] = await Promise.all([
          prismaSystem.hse_document_acknowledgements.count({
            where: { company_id: company.id, archived_at: null, status: 'pending', document: { status: 'published' } },
          }),
          prismaSystem.hse_training_assignments.count({
            where: {
              company_id: company.id,
              archived_at: null,
              status: { in: ['pending', 'in_progress', 'failed'] },
              training: { status: 'published' },
            },
          }),
          prismaSystem.hse_training_assignments.findMany({
            where: {
              company_id: company.id,
              archived_at: null,
              status: 'passed',
              passed_attempt_id: { not: null },
              training: { status: 'published' },
            },
            select: { passed_attempt_id: true },
          }),
          prismaSystem.hse_training_certificates.findMany({
            where: { company_id: company.id, voided_at: null },
            select: { attempt_id: true },
          }),
        ]);
        const signedSet = new Set(signed.map((s) => s.attempt_id));
        const pendingSignatures = passed.filter(
          (p) => p.passed_attempt_id && !signedSet.has(p.passed_attempt_id)
        ).length;
        const documents = new Map<string, { title: string; version: number; dueOn: string; expired: boolean }>();
        for (const a of currentAcks) {
          const dueOn = dayOf(a.version.expires_at as Date);
          documents.set(a.document.id, {
            title: a.document.title,
            version: a.version.version,
            dueOn,
            expired: dueOn < date,
          });
        }
        const trainingRows = trainings
          .map((t) => {
            const dueOn = dayOf(t.valid_until as Date);
            return {
              file: t.employee.file,
              employee: `${t.employee.lastname} ${t.employee.firstname}`.trim(),
              title: t.training.title,
              dueOn,
              expired: dueOn < date,
            };
          })
          .sort((x, y) => x.dueOn.localeCompare(y.dueOn));
        const expiredCount = trainingRows.filter((t) => t.expired).length;
        const email = renderHseExpirySummaryEmail({
          companyName: company.company_name,
          today: date,
          windowDays: HSE_EXPIRY_WINDOW_DAYS,
          trainings: trainingRows,
          documents: [...documents.values()].sort((x, y) => x.dueOn.localeCompare(y.dueOn)),
          pending: { acknowledgements: pendingAcks, trainings: pendingTrainings, signatures: pendingSignatures },
        });
        const result = await notify(
          {
            event: 'hse.expiry_weekly',
            companyId: company.id,
            dedupeKey: `hse.expiry_weekly:${date}`,
            title: `HSE: ${expiredCount} capacitaciones vencidas, ${trainingRows.length - expiredCount} por vencer y ${pendingSignatures} constancias sin firmar`,
            href: '/dashboard/hse?tab=cumplimiento',
            email,
          },
          { sendMail: deps.sendMail }
        );
        summary = result.status;
        summaryEmailSent = result.status === 'no_recipients' ? false : result.emailSent;
      }

      if (created === 0 && byEmployee.size === 0 && summary !== 'sent') {
        return {
          skipped: summary === 'not_today' || summary === 'no_recipients',
          reason: `sin avisos nuevos${summary === 'no_recipients' ? '; el resumen no tiene destinatarios' : ''}`,
          metadata: { candidates: candidates.length, summary },
        };
      }
      logger.info('Avisos HSE generados', {
        data: { companyId: company.id, created, emailsSent, emailsFailed, summary },
      });
      return {
        reason: `${created} aviso(s) nuevo(s), ${emailsSent} correo(s) a empleados${emailsFailed ? `, ${emailsFailed} con error` : ''}; resumen: ${summary}`,
        recipients: emailsSent,
        emailSent: emailsSent > 0 || summaryEmailSent,
        metadata: { candidates: candidates.length, created, emailsSent, emailsFailed, summary },
      };
    },
  });
}
