import 'server-only';

import { refreshDocumentStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { prisma } from '@/shared/lib/prisma';
import { argentinaDate } from '../lib/dates';
import { runForEachCompany, runJobWithBitacora } from '../lib/per-company';
import type { JobSummary } from '../lib/types';

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
 * **Idempotencia.** Clave `<company_id>:<fecha AR>` en `jobs_runs`: la segunda corrida del día
 * se saltea (`ya procesada hoy`). El trabajo en sí también es idempotente: recalcular dos veces
 * da `changed: 0` la segunda.
 */
export interface DocumentsStatusJobDeps {
  date?: string;
  /** Fecha de evaluación del motor; por defecto, ahora. Para los tests. */
  now?: Date;
}

const JOB = 'documents-status' as const;

export async function runDocumentsStatusJob(deps: DocumentsStatusJobDeps = {}): Promise<JobSummary> {
  const date = deps.date ?? argentinaDate();

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
        const employees = await refreshDocumentStatus(prisma, 'Persona', { companyId: company.id }, deps.now);
        const equipment = await refreshDocumentStatus(prisma, 'Equipos', { companyId: company.id }, deps.now);
        return {
          reason: `empleados: ${employees.changed}/${employees.evaluated} cambiaron; equipos: ${equipment.changed}/${equipment.evaluated} cambiaron`,
          metadata: { employees, equipment, changed: employees.changed + equipment.changed },
        };
      },
    });
  });
}
