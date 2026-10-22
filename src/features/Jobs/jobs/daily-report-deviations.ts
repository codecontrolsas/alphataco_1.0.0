import 'server-only';

import { notify } from '@/features/Notifications/lib/dispatch.server';
import { deviationsResultSchema } from '@/features/Operaciones/PartesDiarios/schemas/deviations';
import { argentinaDate } from '@/shared/lib/argentina-time';
import type { SendMail } from '@/shared/lib/mail/transport';
import { prismaSystem as prisma } from '@/shared/lib/prisma-system';
import { callScalar } from '@/shared/lib/sql';
import { notifyOutcome, runJobForEachCompany } from '../lib/per-company';
import type { JobSummary } from '../lib/types';
import { renderDeviationsEmail } from '../templates/deviations';

/**
 * Job diario de las 07:00 (hora argentina) — `GET /api/jobs/daily-report-deviations`.
 *
 * Reemplaza a la edge function `send-deviations-email`, que recibía un `daily_report_id` por
 * el body (o buscaba «el primer parte activo de la fecha», sin mirar de qué empresa era) y
 * mandaba un único correo a una lista global.
 *
 * **Qué hace.** Por cada empresa: busca el parte diario activo de HOY de esa empresa, le pide
 * los desvíos a `get_daily_report_deviations(daily_report_id, fecha)` y, si hay, manda un
 * correo a los destinatarios de esa empresa.
 *
 * **De dónde saca los datos.** `dailyreport` (para resolver el parte de la empresa) y la
 * función SQL `get_daily_report_deviations` de `prisma/sql/daily-report.sql`, validada con
 * Zod. Los destinatarios salen de `notification_settings`.
 *
 * **Idempotencia.** La clave `<company_id>:<fecha AR>` de `jobs_runs` se reclama ANTES de
 * armar el correo; si ya se reclamó y cerró bien, la empresa se saltea. Correr el endpoint
 * dos veces el mismo día no manda el correo dos veces. Una empresa que falló queda en
 * `error` y sí se reintenta — sin reenviar el de las que ya salieron.
 *
 * **Multi-empresa.** Tres capas:
 * 1. El parte se busca con `company_id = <empresa>` (y `dailyreport` tiene unique
 *    `(date, company_id)`, así que hay a lo sumo uno por empresa y día).
 * 2. La función SQL se llama con el id de ESE parte: sus consultas parten de
 *    `dailyreportrows.daily_report_id`, que pertenece a una sola empresa.
 * 3. Los destinatarios se piden con el MISMO `company_id`, y se manda un `sendMail` por
 *    empresa. No hay ningún acumulador entre iteraciones.
 * Además el asunto y el encabezado del correo llevan el nombre de la empresa.
 */
export interface DeviationsJobDeps {
  date?: string;
  /** Emisor inyectable: los tests capturan el correo sin levantar un SMTP. */
  sendMail?: SendMail;
}

const JOB = 'daily-report-deviations' as const;

export async function runDailyReportDeviationsJob(deps: DeviationsJobDeps = {}): Promise<JobSummary> {
  const date = deps.date ?? argentinaDate();

  // Todo va DENTRO de la bitácora: si el `findMany` falla (base caída, pool agotado), la fila
  // `corrida:<fecha>` ya está abierta y el error queda registrado. Sin esto, el modo de falla
  // más probable no dejaba ninguna fila en `jobs_runs`.
  return runJobForEachCompany({
    job: JOB,
    date,
    work: async (company) => {
      const report = await prisma.dailyreport.findFirst({
        where: { company_id: company.id, date: new Date(`${date}T00:00:00Z`), is_active: true },
        select: { id: true },
      });

      if (!report) {
        // `skipped`, no `ok`: la clave queda reclamable por si el parte se crea más tarde.
        return { skipped: true, reason: 'sin parte diario activo para la fecha' };
      }

      const deviations = await callScalar(
        'get_daily_report_deviations',
        [{ uuid: report.id }, { date }],
        deviationsResultSchema,
        prisma
      );

      if (deviations.rows_with_deviations.length === 0) {
        // Sí es `ok`: el trabajo se hizo y el resultado es "no hay nada que informar".
        // Volver a mirarlo más tarde no cambiaría la decisión de no mandar el correo.
        return {
          reason: 'sin desvíos',
          metadata: { dailyReportId: report.id, rowsWithDeviations: 0 },
        };
      }

      const email = renderDeviationsEmail({
        companyName: company.company_name,
        reportDate: date,
        dailyReportId: report.id,
        data: deviations,
      });
      const rowsWithDeviations = deviations.rows_with_deviations.length;

      // Los destinatarios (roles con el aviso + lista fija) se resuelven recién acá, ya confirmado
      // que hay algo que informar. (Es el mismo orden que tenía la edge function.)
      const result = await notify(
        {
          event: 'operations.daily_report_deviations',
          companyId: company.id,
          dedupeKey: `operations.daily_report_deviations:${report.id}`,
          title: `Parte del ${date.split('-').reverse().join('/')}: ${rowsWithDeviations} servicios con desvíos`,
          href: `/dashboard/operations/${report.id}`,
          email,
          metadata: { dailyReportId: report.id, rowsWithDeviations },
        },
        { sendMail: deps.sendMail }
      );

      if (result.status === 'no_recipients') {
        // `skipped`: si un admin configura destinatarios a media mañana y redispara, la
        // empresa se reintenta. Con `ok` quedaba salteada hasta el día siguiente.
        return {
          skipped: true,
          reason: 'hay desvíos pero la empresa no tiene destinatarios (roles ni lista fija)',
          metadata: { dailyReportId: report.id, rowsWithDeviations },
        };
      }

      return {
        ...notifyOutcome(result),
        metadata: {
          dailyReportId: report.id,
          rowsWithDeviations: deviations.rows_with_deviations.length,
          summary: deviations.summary,
        },
      };
    },
  });
}
