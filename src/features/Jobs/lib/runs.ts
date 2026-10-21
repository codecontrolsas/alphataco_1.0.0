import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { prismaSystem as prisma } from '@/shared/lib/prisma-system';
import type { JobName } from './types';

/**
 * Bitácora y candado de idempotencia de los jobs, sobre `jobs_runs`.
 *
 * **El problema.** El cron puede reintentar, el contenedor puede reiniciarse y cualquiera con
 * el token puede llamar el endpoint a mano. Correr un job dos veces el mismo día no puede
 * mandar el correo dos veces.
 *
 * **La solución.** Antes de trabajar, el job "reclama" la corrida con un
 * `INSERT ... ON CONFLICT (job, run_key) DO UPDATE ... WHERE <la anterior falló o quedó
 * colgada> RETURNING id`. La unique de la base hace de candado: si el `RETURNING` no devuelve
 * fila, otra corrida ya hizo ese trabajo y este job la saltea. Es atómico —una sola sentencia,
 * sin lectura previa— así que dos corridas simultáneas no pueden reclamar la misma clave.
 *
 * **El grano es la empresa**, no la corrida: `run_key` es `<company_id>:<fecha AR>`. Si la
 * empresa A se envió bien y la B falló, el reintento sólo vuelve a procesar B. Con una clave
 * por corrida, el reintento habría reenviado el correo de A.
 *
 * **Reintentos.** Una fila en `error` o en `skipped` se puede volver a reclamar (el `DO UPDATE`
 * la pisa): la primera porque falló, la segunda porque no llegó a haber trabajo (sin parte
 * diario, sin destinatarios) y el motivo puede corregirse durante el día. Una en `running`
 * también, pero sólo pasada una hora: sin eso, un proceso que muere a mitad de camino dejaría
 * la clave trabada para siempre. Sólo `ok` es definitivo, que es justo lo que garantiza que un
 * correo ya enviado no se reenvíe.
 *
 * Nota: `jobs_runs` NO es un registro de correos enviados (`sent_emails`), que el usuario
 * decidió no reponer. Es la bitácora del job; guarda cuántos destinatarios y si hubo envío,
 * no el contenido ni las direcciones.
 */
const STALE_RUN_MINUTES = 60;

export interface ClaimedRun {
  id: string;
  /** Intento número N para esa clave. 1 = primera vez. */
  attempts: number;
}

/**
 * Intenta tomar la corrida `(job, runKey)`. Devuelve `null` si ya la hizo (o la está
 * haciendo) otra corrida.
 */
export async function claimRun(params: {
  job: JobName;
  runKey: string;
  companyId?: string | null;
  client?: Pick<Prisma.TransactionClient, '$queryRaw'>;
}): Promise<ClaimedRun | null> {
  const client = params.client ?? prisma;
  const companyId = params.companyId ?? null;

  const rows = await client.$queryRaw<Array<{ id: string; attempts: number }>>(Prisma.sql`
    INSERT INTO public.jobs_runs (job, run_key, company_id, status, started_at, attempts)
    VALUES (${params.job}, ${params.runKey}, ${companyId}::uuid, 'running', NOW(), 1)
    ON CONFLICT (job, run_key) DO UPDATE
      SET status = 'running',
          started_at = NOW(),
          finished_at = NULL,
          error = NULL,
          attempts = public.jobs_runs.attempts + 1
      WHERE public.jobs_runs.status IN ('error', 'skipped')
         OR (public.jobs_runs.status = 'running'
             AND public.jobs_runs.started_at < NOW() - ${`${STALE_RUN_MINUTES} minutes`}::interval)
    RETURNING id, attempts
  `);

  const row = rows[0];
  return row ? { id: row.id, attempts: Number(row.attempts) } : null;
}

/**
 * Abre la fila de BITÁCORA de una corrida completa. **No es un candado**: a diferencia de
 * `claimRun`, el `DO UPDATE` no lleva `WHERE`, así que siempre devuelve la fila.
 *
 * Existe por un agujero concreto: si el job lanza FUERA del bucle de empresas —la base caída
 * o el pool agotado, que es el modo de falla más probable y el que ocurre antes de que exista
 * ninguna fila por empresa— no quedaba ningún rastro. El `Logger` está silenciado salvo
 * `NEXT_PUBLIC_SHOW_LOGS=true` y el cron no tiene a quién preguntarle. Esta fila se escribe
 * ANTES de tocar `company`, así que ese caso también queda registrado.
 *
 * Que no sea candado es deliberado: si bloqueara, un segundo disparo del día no llegaría
 * siquiera a evaluar las empresas, y la decisión de saltear o no es de cada empresa.
 */
export async function recordRunStart(params: {
  job: JobName;
  runKey: string;
  client?: Pick<Prisma.TransactionClient, '$queryRaw'>;
}): Promise<ClaimedRun> {
  const client = params.client ?? prisma;

  const rows = await client.$queryRaw<Array<{ id: string; attempts: number }>>(Prisma.sql`
    INSERT INTO public.jobs_runs (job, run_key, company_id, status, started_at, attempts)
    VALUES (${params.job}, ${params.runKey}, NULL::uuid, 'running', NOW(), 1)
    ON CONFLICT (job, run_key) DO UPDATE
      SET status = 'running',
          started_at = NOW(),
          finished_at = NULL,
          error = NULL,
          attempts = public.jobs_runs.attempts + 1
    RETURNING id, attempts
  `);

  const row = rows[0];
  if (!row) throw new Error('No se pudo registrar la corrida en jobs_runs');
  return { id: row.id, attempts: Number(row.attempts) };
}

/**
 * Cierra una corrida reclamada. `error` y `skipped` dejan la clave libre para el próximo
 * intento; `ok` la cierra de forma definitiva.
 */
export async function finishRun(params: {
  id: string;
  status: 'ok' | 'error' | 'skipped';
  metadata?: Record<string, unknown>;
  error?: string;
}): Promise<void> {
  // `finished_at` lo calcula POSTGRES con NOW(), no JavaScript.
  //
  // `started_at` y `finished_at` salen del mismo reloj (el de Postgres; `claimRun` también usa
  // `NOW()`), así que la duración de la corrida no depende del reloj del proceso. Antes además
  // corregía un desvío: con la sesión en hora argentina, un `Date` de JS se guardaba 3 horas en
  // el futuro. Eso ya se resolvió de raíz con la sesión en UTC (`prisma-pg-config.ts`).
  const errorText = params.error ? params.error.slice(0, 2000) : null;
  const metadata = JSON.stringify(params.metadata ?? {});

  await prisma.$executeRaw(Prisma.sql`
    UPDATE public.jobs_runs
       SET status = ${params.status}::public.job_run_status,
           finished_at = NOW(),
           error = ${errorText},
           metadata = ${metadata}::jsonb
     WHERE id = ${params.id}::uuid
  `);
}

/** Última corrida registrada de un job. Para diagnóstico y para los tests. */
export async function lastRun(job: JobName, runKey: string) {
  return prisma.jobs_runs.findUnique({ where: { job_run_key: { job, run_key: runKey } } });
}
