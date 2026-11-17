import 'server-only';

import { refreshDocumentStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { notify } from '@/features/Notifications/lib/dispatch.server';
import { argentinaDate } from '@/shared/lib/argentina-time';
import type { SendMail } from '@/shared/lib/mail/transport';
import { prismaSystem as prisma } from '@/shared/lib/prisma-system';
import { collectThresholdExpiries, EXPIRY_THRESHOLDS } from '../lib/documents-threshold.server';
import { runJobForEachCompany } from '../lib/per-company';
import type { JobSummary } from '../lib/types';
import { renderDocumentsThresholdEmail } from '../templates/documents-threshold';

/**
 * Job diario de las 00:10 (hora argentina) — `GET /api/jobs/documents-status`.
 *
 * `employees.status` / `vehicles.status` son un CACHE del cumplimiento documental que escribe
 * únicamente el motor (`refreshDocumentStatus`). Los escritores de recursos lo refrescan en su
 * transacción, pero hay cambios que ningún escritor ve: el paso del tiempo (un documento que
 * vence a medianoche, el cambio de período mensual) o un camino que olvidó el hook. Este job
 * recalcula todos los recursos de cada empresa y escribe sólo lo que cambió.
 *
 * **Cómo leer `changed`.** Un `changed` > 0 se explica por la fecha (vencimientos del día, mes
 * nuevo). Si cambia sin que haya pasado nada de eso, hay un escritor sin hook: la métrica está
 * para detectarlo, por eso se informa por empresa y tipo de recurso en `metadata`.
 *
 * **Aviso por vencer (ticket 842).** Después del recálculo, avisa los documentos que vencen exactamente en 30, 15, 7
 * o 1 día (`documents.expiry_threshold`): un aviso por umbral y por día. La clave de deduplicación lleva la fecha y el
 * umbral, así que cada documento avisa una sola vez en cada umbral aunque el job se dispare dos veces.
 *
 * **Idempotencia.** Clave `<company_id>:<fecha AR>` en `jobs_runs`: la segunda corrida del día
 * se saltea (`ya procesada hoy`). El trabajo en sí también es idempotente: recalcular dos veces
 * da `changed: 0` la segunda.
 */
export interface DocumentsStatusJobDeps {
  date?: string;
  /** Fecha de evaluación del motor; por defecto, ahora. Para los tests. */
  now?: Date;
  sendMail?: SendMail;
}

const JOB = 'documents-status' as const;

export async function runDocumentsStatusJob(deps: DocumentsStatusJobDeps = {}): Promise<JobSummary> {
  const date = deps.date ?? argentinaDate();

  return runJobForEachCompany({
    job: JOB,
    date,
    work: async (company) => {
      const employees = await refreshDocumentStatus(prisma, 'Persona', { companyId: company.id }, deps.now);
      const equipment = await refreshDocumentStatus(prisma, 'Equipos', { companyId: company.id }, deps.now);

      const byThreshold = await collectThresholdExpiries(prisma, company.id, deps.now);
      const notices: Record<string, string> = {};
      for (const days of EXPIRY_THRESHOLDS) {
        const items = byThreshold.get(days) ?? [];
        if (items.length === 0) continue;
        // Un aviso que falla no deshace el recálculo (ya guardado): queda anotado en la corrida y sigue con el resto.
        const result = await notify(
          {
            event: 'documents.expiry_threshold',
            companyId: company.id,
            dedupeKey: `documents.expiry_threshold:${days}:${date}`,
            title: `${items.length} ${items.length === 1 ? 'documento vence' : 'documentos vencen'} ${days === 1 ? 'mañana' : `en ${days} días`}`,
            body: items
              .slice(0, 5)
              .map((i) => `${i.typeName} · ${i.resourceLabel}`)
              .join('\n'),
            href: '/dashboard/document?tab=cumplimiento-por-cliente&subtab=calendario',
            email: renderDocumentsThresholdEmail({ companyName: company.company_name, today: date, days, items }),
            metadata: { days, count: items.length },
          },
          { sendMail: deps.sendMail }
        ).catch((error: unknown) => ({ status: `error: ${error instanceof Error ? error.message : String(error)}` }));
        notices[`${days}d`] = `${items.length} documentos: ${result.status}`;
      }

      // Si un aviso falló, la corrida de la empresa queda fallida para reintentarse: el recálculo es idempotente y los
      // avisos ya registrados no se repiten (clave de deduplicación por umbral y día).
      const failedNotices = Object.entries(notices).filter(([, text]) => text.includes(': error:'));
      if (failedNotices.length > 0) {
        throw new Error(
          `No se pudieron registrar avisos por vencer: ${failedNotices.map(([k, v]) => `${k} ${v}`).join('; ')}`
        );
      }

      return {
        reason: `empleados: ${employees.changed}/${employees.evaluated} cambiaron; equipos: ${equipment.changed}/${equipment.evaluated} cambiaron`,
        metadata: { employees, equipment, changed: employees.changed + equipment.changed, notices },
      };
    },
  });
}
