import 'server-only';

import { isHseEnabled } from '@/features/Hse/lib/feature-gate';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { callScalar } from '@/shared/lib/sql';
import { z } from 'zod';
import { runJobForEachCompany } from '../lib/per-company';
import type { JobSummary } from '../lib/types';

/**
 * Job de cada hora (minuto 7, hora argentina) — `GET /api/jobs/hse-expired-attempts`.
 *
 * Cierra y corrige los exámenes HSE cuyo tiempo límite venció y nadie envió (el empleado cerró la pestaña o se quedó sin
 * señal): `hse_close_expired_attempts` usa la MISMA corrección que el envío (`hse_grade_attempt`) con lo que el
 * empleado alcanzó a responder, así el resultado y los intentos restantes quedan al día aunque no vuelva a entrar. El
 * portal también los cierra al momento si el empleado vuelve: el job es la red para los que no vuelven.
 *
 * Corre con la empresa como contexto del cliente (`runForEachCompany`, actor `job`): la función controla que la
 * empresa sea la del contexto. **Idempotencia**: clave `<empresa>:<fecha AR>T<hora AR>` (una corrida por hora) y la
 * función no vuelve a tocar un intento cerrado. Con HSE apagado en la instancia no hace nada.
 */
const JOB = 'hse-expired-attempts' as const;

const closedSchema = z.coerce.number().int().nonnegative();

/** Hora argentina `HH` (00-23) del instante dado. */
function argentinaHour(at: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

export async function runHseExpiredAttemptsJob(deps: { now?: Date } = {}): Promise<JobSummary> {
  const now = deps.now ?? new Date();
  const slot = `${argentinaDate(now)}T${argentinaHour(now)}`;

  return runJobForEachCompany({
    job: JOB,
    date: slot,
    work: async (company) => {
      if (!(await isHseEnabled(company.id)))
        return { skipped: true, reason: 'HSE apagado en la instancia o en la empresa' };
      const closed = await callScalar('hse_close_expired_attempts', [{ uuid: company.id }], closedSchema);
      return { reason: `${closed} examen(es) vencido(s) cerrado(s)`, metadata: { closed } };
    },
  });
}
