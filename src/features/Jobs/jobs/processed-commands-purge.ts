import 'server-only';

import { prismaSystem } from '@/shared/lib/prisma-system';
import { callScalar } from '@/shared/lib/sql';
import { z } from 'zod';
import { argentinaDate } from '../lib/dates';
import { runGlobalStep, runJobWithBitacora } from '../lib/per-company';
import type { JobSummary } from '../lib/types';

/**
 * Job diario de las 03:15 (hora argentina) — `GET /api/jobs/processed-commands-purge`.
 *
 * Borra de `processed_commands` los comandos con más de 30 días (retención del reenvío idempotente: un cliente offline
 * no reintenta después de un mes). Es un paso global y no por empresa: la RLS impide a un job sin empresa borrar filas
 * de todas, por eso lo hace la función `SECURITY DEFINER` `purge_processed_commands`, que solo ejecuta el rol de sistema.
 */
const JOB = 'processed-commands-purge' as const;

const deletedSchema = z.coerce.number().int().nonnegative();

export async function runProcessedCommandsPurgeJob(deps: { date?: string } = {}): Promise<JobSummary> {
  const date = deps.date ?? argentinaDate();

  return runJobWithBitacora(JOB, date, async () => [
    await runGlobalStep({
      job: JOB,
      runKey: `purga:${date}`,
      label: 'Purga de comandos procesados',
      work: async () => {
        const deleted = await callScalar('purge_processed_commands', [], deletedSchema, prismaSystem);
        return { reason: `${deleted} comando(s) procesado(s) eliminado(s)`, metadata: { deleted } };
      },
    }),
  ]);
}
