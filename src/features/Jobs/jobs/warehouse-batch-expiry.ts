import 'server-only';

import { notify } from '@/features/Notifications/lib/dispatch.server';
import { EXPIRING_WINDOW_DAYS } from '@/features/Warehouses/lib/batch-expiry';
import { findExpiringBatches } from '@/features/Warehouses/lib/expiring-batches';
import { argentinaDate } from '@/shared/lib/argentina-time';
import type { SendMail } from '@/shared/lib/mail/transport';
import { listCompanies, notifyOutcome, runForEachCompany, runJobWithBitacora } from '../lib/per-company';
import type { JobSummary } from '../lib/types';
import { renderWarehouseBatchExpiryEmail } from '../templates/warehouse-batch-expiry';

/**
 * Job semanal de los lunes 08:05 (hora argentina) — `GET /api/jobs/warehouse-batch-expiry`.
 *
 * Por cada empresa busca los lotes CON SALDO vencidos o que vencen en los proximos 30 dias
 * (`findExpiringBatches`, la misma consulta que el aviso de Stock) y los avisa con `notify` (#786):
 * roles con el aviso activo más la lista fija de `notification_settings` (`stock_batch_expiry`).
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

  return runJobWithBitacora(JOB, date, async () => {
    const companies = await listCompanies();

    return runForEachCompany({
      job: JOB,
      date,
      companies,
      work: async (company) => {
        const items = await findExpiringBatches(company.id, date);
        if (items.length === 0) {
          return { skipped: true, reason: 'sin lotes vencidos ni por vencer' };
        }

        const email = renderWarehouseBatchExpiryEmail({
          companyName: company.company_name,
          today: date,
          windowDays: EXPIRING_WINDOW_DAYS,
          items,
        });
        const expired = items.filter((i) => i.status === 'EXPIRED').length;
        const result = await notify(
          {
            event: 'warehouses.batch_expiry',
            companyId: company.id,
            dedupeKey: `warehouses.batch_expiry:${date}`,
            title: `Lotes: ${expired} vencidos y ${items.length - expired} por vencer`,
            href: '/dashboard/warehouse?tab=stock',
            email,
          },
          { sendMail: deps.sendMail }
        );
        if (result.status === 'no_recipients') {
          return { skipped: true, reason: 'la empresa no tiene destinatarios (roles ni lista fija)' };
        }

        return { ...notifyOutcome(result), metadata: { expired, expiring: items.length - expired } };
      },
    });
  });
}
