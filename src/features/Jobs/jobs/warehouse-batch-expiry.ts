import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { sendMail, type SendMail } from '@/shared/lib/mail';
import { EXPIRING_WINDOW_DAYS } from '@/features/Warehouses/lib/batch-expiry';
import { findExpiringBatches } from '@/features/Warehouses/lib/expiring-batches';
import { argentinaDate } from '../lib/dates';
import { runForEachCompany, runJobWithBitacora } from '../lib/per-company';
import { getCompanyRecipients } from '../lib/recipients';
import type { JobSummary } from '../lib/types';
import { renderWarehouseBatchExpiryEmail } from '../templates/warehouse-batch-expiry';

/**
 * Job semanal de los lunes 08:05 (hora argentina) — `GET /api/jobs/warehouse-batch-expiry`.
 *
 * Por cada empresa busca los lotes CON SALDO vencidos o que vencen en los proximos 30 dias
 * (`findExpiringBatches`, la misma consulta que el aviso de Stock) y los manda a los
 * destinatarios de `notification_settings` (`stock_batch_expiry`).
 *
 * A diferencia del de documentos, sin nada que avisar NO manda correo: la empresa queda
 * `skipped`. Un "todo al dia" semanal de un almacen sin lotes seria ruido para la mayoria de
 * las empresas, que no controlan stock por lote.
 *
 * Idempotencia, bitacora y multi-empresa: igual que `documents-expiry` (clave
 * `<company_id>:<fecha AR>` en `jobs_runs`).
 */
export interface WarehouseBatchExpiryJobDeps {
  date?: string;
  sendMail?: SendMail;
}

const JOB = 'warehouse-batch-expiry' as const;

export async function runWarehouseBatchExpiryJob(deps: WarehouseBatchExpiryJobDeps = {}): Promise<JobSummary> {
  const date = deps.date ?? argentinaDate();
  const send = deps.sendMail ?? sendMail;

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
        const items = await findExpiringBatches(company.id, date);
        if (items.length === 0) {
          return { skipped: true, reason: 'sin lotes vencidos ni por vencer' };
        }

        const recipients = await getCompanyRecipients(company.id, 'stock_batch_expiry');
        if (recipients.length === 0) {
          return { skipped: true, reason: 'la empresa no tiene destinatarios configurados' };
        }

        const email = renderWarehouseBatchExpiryEmail({
          companyName: company.company_name,
          today: date,
          windowDays: EXPIRING_WINDOW_DAYS,
          items,
        });
        const emailSent = await send({ to: recipients, subject: email.subject, html: email.html, text: email.text });

        const expired = items.filter((i) => i.status === 'EXPIRED').length;
        return {
          reason: emailSent ? 'correo enviado' : 'correo NO enviado (SMTP sin configurar o error de envío)',
          recipients: recipients.length,
          emailSent,
          metadata: { expired, expiring: items.length - expired },
        };
      },
    });
  });
}
