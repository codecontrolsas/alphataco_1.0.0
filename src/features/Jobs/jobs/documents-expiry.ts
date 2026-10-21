import 'server-only';

import { notify } from '@/features/Notifications/lib/dispatch.server';
import type { SendMail } from '@/shared/lib/mail';
import { prismaSystem as prisma } from '@/shared/lib/prisma-system';
import { argentinaDate } from '../lib/dates';
import { buildDocumentsExpirySummary } from '../lib/documents-expiry-summary.server';
import { runForEachCompany, runJobWithBitacora } from '../lib/per-company';
import type { JobSummary } from '../lib/types';
import { renderDocumentsExpiryEmail } from '../templates/documents-expiry';

/**
 * Job semanal de los lunes 08:00 (hora argentina) — `GET /api/jobs/documents-expiry`.
 *
 * Reemplaza a la edge function `send-documents-expiry-email` y al `cron.schedule` de Supabase
 * (`weekly-documents-expiry-email`, `0 11 * * 1` UTC = el mismo momento).
 *
 * **Qué hace.** Por cada empresa calcula el resumen con el motor de cumplimiento
 * (`buildDocumentsExpirySummary`: vencidos, por vencer y faltantes sobre los requisitos que le
 * aplican a cada recurso) y lo manda a los destinatarios de esa empresa. Se manda SIEMPRE, incluso sin novedades: la plantilla
 * tiene un estado «Todo al día» explícito, y era el comportamiento de la edge function.
 *
 * **Parámetros de negocio.** `days_ahead = 7` y `detail_limit = 20`, los mismos con los que
 * el `cron.schedule` de Supabase llamaba a la función. `detail_limit` acota las filas del
 * detalle por grupo (los totales siempre son completos).
 *
 * **Idempotencia.** Clave `<company_id>:<fecha AR>` en `jobs_runs`, reclamada antes de
 * consultar. Correr el endpoint dos veces el mismo lunes manda un solo correo por empresa.
 * Ojo con el grano: la clave es por DÍA, así que correrlo un martes a mano sí manda otro
 * correo — es deliberado, un disparo manual fuera del horario del cron es una decisión
 * humana, no un reintento.
 *
 * **Multi-empresa.** El resumen se arma siempre para UNA empresa (recursos, tipos y documentos
 * filtrados por `company_id`). Lo entrega `notify` (#786): campanita y mail a los usuarios de la
 * empresa cuyos roles tienen el aviso activo, más la lista fija de la empresa (`notification_settings`).
 */
export interface DocumentsExpiryJobDeps {
  date?: string;
  daysAhead?: number;
  detailLimit?: number;
  sendMail?: SendMail;
}

const JOB = 'documents-expiry' as const;

/** Los valores con los que el cron de Supabase llamaba a la edge function. */
export const DEFAULT_DAYS_AHEAD = 7;
export const DEFAULT_DETAIL_LIMIT = 20;

export async function runDocumentsExpiryJob(deps: DocumentsExpiryJobDeps = {}): Promise<JobSummary> {
  const date = deps.date ?? argentinaDate();
  const daysAhead = deps.daysAhead ?? DEFAULT_DAYS_AHEAD;
  const detailLimit = deps.detailLimit ?? DEFAULT_DETAIL_LIMIT;

  // Todo va DENTRO de la bitácora: si el `findMany` falla (base caída, pool agotado), la fila
  // `corrida:<fecha>` ya está abierta y el error queda registrado.
  return runJobWithBitacora(JOB, date, async () => {
    const companies = await prisma.company.findMany({
      select: { id: true, company_name: true },
      orderBy: { company_name: 'asc' },
    });

    return runForEachCompany({
      job: JOB,
      date,
      companies,
      work: async (company) => {
        const summary = await buildDocumentsExpirySummary(prisma, {
          companyId: company.id,
          daysAhead,
          detailLimit,
        });

        const email = renderDocumentsExpiryEmail({ companyName: company.company_name, data: summary });
        const expired =
          summary.expired_counts.employees + summary.expired_counts.equipment + summary.expired_counts.company;
        const expiringSoon =
          summary.expiring_soon.employees.total +
          summary.expiring_soon.equipment.total +
          summary.expiring_soon.company.total;

        const result = await notify(
          {
            event: 'documents.expiry_weekly',
            companyId: company.id,
            dedupeKey: `documents.expiry_weekly:${date}`,
            title: `Vencimientos de la semana: ${expired} vencidos y ${expiringSoon} por vencer`,
            href: '/dashboard/document',
            email,
            metadata: { daysAhead },
          },
          { sendMail: deps.sendMail }
        );

        if (result.status === 'no_recipients') {
          // `skipped`: la clave queda reclamable para el mismo día, así cargar destinatarios y
          // redisparar alcanza. Con `ok` la empresa quedaba afuera hasta el lunes siguiente.
          return { skipped: true, reason: 'la empresa no tiene destinatarios (roles ni lista fija)' };
        }
        const emailSent = result.emailSent;
        const recipientCount = result.status === 'sent' ? result.emailRecipients + result.inApp : 0;

        const totals = {
          expiringSoon,
          expired,
          pending: summary.pending_counts.employees + summary.pending_counts.equipment + summary.pending_counts.company,
        };

        return {
          reason: emailSent ? 'correo enviado' : 'correo NO enviado (SMTP sin configurar o error de envío)',
          recipients: recipientCount,
          emailSent,
          metadata: { daysAhead, totals },
        };
      },
    });
  });
}
