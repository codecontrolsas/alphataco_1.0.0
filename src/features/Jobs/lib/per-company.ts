import 'server-only';

import type { NotifyResult } from '@/features/Notifications/lib/dispatch.server';
import { Logger } from '@/lib/logger';
import { prismaSystem } from '@/shared/lib/prisma-system';
import { claimRun, finishRun, recordRunStart } from './runs';
import { summarize, type JobName, type JobSummary, type JobUnitOutcome } from './types';

const logger = new Logger('features/Jobs/per-company');

/** Lo que devuelve el trabajo de una empresa. Se guarda en `jobs_runs.metadata`. */
export interface CompanyWorkResult {
  /** Qué se hizo (o por qué no se hizo nada). Texto corto, va a la respuesta del endpoint. */
  reason?: string;
  /**
   * `true` cuando NO hubo trabajo que hacer: la empresa no tiene parte diario del día, o no
   * tiene destinatarios configurados. La corrida queda registrada como `skipped` y la clave
   * vuelve a ser reclamable, así un disparo posterior del mismo día la reintenta si el motivo
   * se corrigió. Marcarla `ok` la dejaría salteada hasta el día siguiente.
   */
  skipped?: boolean;
  recipients?: number;
  emailSent?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CompanyRef {
  id: string;
  company_name: string;
}

/** Todas las empresas, ordenadas por nombre: la lista sobre la que corren los jobs por empresa. */
export function listCompanies(): Promise<CompanyRef[]> {
  return prismaSystem.company.findMany({
    select: { id: true, company_name: true },
    orderBy: { company_name: 'asc' },
  });
}

/**
 * Resultado de una empresa a partir de un `notify` que SÍ tenía destinatarios: motivo, cantidad
 * de destinatarios (correos + avisos en la app) y si el correo salió.
 */
export function notifyOutcome(result: Exclude<NotifyResult, { status: 'no_recipients' }>): CompanyWorkResult {
  return {
    reason: result.emailSent ? 'correo enviado' : 'correo NO enviado (SMTP sin configurar o error de envío)',
    recipients: result.status === 'sent' ? result.emailRecipients + result.inApp : 0,
    emailSent: result.emailSent,
  };
}

/** `finishRun` nunca debe tumbar el bucle: un fallo de contabilidad no es un fallo del job. */
async function finishQuietly(params: Parameters<typeof finishRun>[0]): Promise<boolean> {
  try {
    await finishRun(params);
    return true;
  } catch (error) {
    logger.error('No se pudo cerrar la fila de jobs_runs', { data: { id: params.id, error } });
    return false;
  }
}

/**
 * Recorre las empresas aplicando el mismo trabajo a cada una, con el ciclo completo de
 * reclamo → trabajo → cierre sobre `jobs_runs`.
 *
 * Es el corazón de las dos garantías que pide P5:
 *
 * - **Idempotencia**: la clave `<companyId>:<fecha>` se reclama antes de trabajar. Si ya se
 *   reclamó hoy y terminó en `ok`, `claimRun` devuelve `null` y la empresa se saltea sin
 *   mandar nada. Correr el endpoint dos veces el mismo día no duplica correos.
 * - **Aislamiento entre empresas**: cada iteración es independiente y tiene su propia fila.
 *   Un error en una empresa no corta el bucle ni contamina a las demás, y sólo esa empresa
 *   queda reintentable. El `work` recibe UNA empresa: no hay ningún punto donde se acumulen
 *   datos de varias.
 *
 * **Dónde termina el `try`.** El `finishRun` del camino feliz va FUERA de él a propósito: si
 * el correo ya salió y la escritura de la bitácora falla, tratarlo como un fallo del trabajo
 * dejaría la clave reclamable y el próximo disparo REENVIARÍA el correo. Entre perder una
 * fila de contabilidad y mandar el correo dos veces, se pierde la fila (queda en el log y en
 * la respuesta del endpoint, y la corrida se reporta como `error` para que el handler
 * devuelva 500).
 *
 * El error se persiste en `jobs_runs` y se propaga al resumen para que el endpoint devuelva
 * 500 — el `Logger` está silenciado salvo `NEXT_PUBLIC_SHOW_LOGS=true`, así que loguear no
 * alcanza como rastro.
 */
export async function runForEachCompany(params: {
  job: JobName;
  date: string;
  companies: readonly CompanyRef[];
  work: (company: CompanyRef) => Promise<CompanyWorkResult>;
}): Promise<JobUnitOutcome[]> {
  const outcomes: JobUnitOutcome[] = [];

  for (const company of params.companies) {
    const runKey = `${company.id}:${params.date}`;
    const claim = await claimRun({ job: params.job, runKey, companyId: company.id });

    if (!claim) {
      outcomes.push({
        companyId: company.id,
        companyName: company.company_name,
        status: 'skipped',
        reason: 'ya procesada hoy',
      });
      continue;
    }

    let result: CompanyWorkResult;
    try {
      result = await params.work(company);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      logger.error('Falló el job para una empresa', {
        data: { job: params.job, companyId: company.id, error },
      });

      await finishQuietly({
        id: claim.id,
        status: 'error',
        error: message,
        metadata: { attempt: claim.attempts },
      });

      outcomes.push({
        companyId: company.id,
        companyName: company.company_name,
        status: 'error',
        error: message,
      });
      continue;
    }

    const status = result.skipped ? 'skipped' : 'ok';
    const metadata = {
      ...(result.metadata ?? {}),
      reason: result.reason,
      recipients: result.recipients ?? 0,
      emailSent: result.emailSent ?? false,
      attempt: claim.attempts,
    };

    const recorded = await finishQuietly({ id: claim.id, status, metadata });

    outcomes.push({
      companyId: company.id,
      companyName: company.company_name,
      // El trabajo salió bien; si falló SOLO la contabilidad se reporta `error` para que el
      // endpoint devuelva 500 y alguien lo mire — sin volver a reclamar la clave.
      status: recorded ? status : 'error',
      reason: result.reason,
      recipients: result.recipients ?? 0,
      emailSent: result.emailSent ?? false,
      error: recorded ? undefined : 'el trabajo terminó pero no se pudo cerrar la fila de jobs_runs',
      metadata: result.metadata,
    });
  }

  return outcomes;
}

/**
 * Igual que `runForEachCompany` pero para un paso global (sin empresa), como el mantenimiento
 * de estados del job diario.
 */
export async function runGlobalStep(params: {
  job: JobName;
  runKey: string;
  label: string;
  work: () => Promise<CompanyWorkResult>;
}): Promise<JobUnitOutcome> {
  const claim = await claimRun({ job: params.job, runKey: params.runKey, companyId: null });

  if (!claim) {
    return { companyId: null, companyName: params.label, status: 'skipped', reason: 'ya procesado hoy' };
  }

  let result: CompanyWorkResult;
  try {
    result = await params.work();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    logger.error('Falló un paso global del job', { data: { job: params.job, runKey: params.runKey, error } });
    await finishQuietly({ id: claim.id, status: 'error', error: message, metadata: { attempt: claim.attempts } });
    return { companyId: null, companyName: params.label, status: 'error', error: message };
  }

  const status = result.skipped ? 'skipped' : 'ok';
  const recorded = await finishQuietly({
    id: claim.id,
    status,
    metadata: { ...(result.metadata ?? {}), attempt: claim.attempts },
  });

  return {
    companyId: null,
    companyName: params.label,
    status: recorded ? status : 'error',
    reason: result.reason,
    error: recorded ? undefined : 'el paso terminó pero no se pudo cerrar la fila de jobs_runs',
    metadata: result.metadata,
  };
}

/**
 * Envuelve la corrida COMPLETA de un job en una fila de bitácora `corrida:<fecha>`.
 *
 * Sin esto, todo lo que pasa antes del primer `claimRun` —empezando por el `findMany` de
 * empresas— ocurría fuera de `jobs_runs`: si la base estaba caída, el endpoint devolvía 500,
 * el logger estaba silenciado y no quedaba NINGUNA fila. El rastro era cero justo para el
 * modo de falla más probable.
 *
 * La fila se abre antes de tocar nada y se cierra con el resumen (o con el error). **No es un
 * candado**: `recordRunStart` siempre devuelve fila, así que un segundo disparo del día entra
 * igual y son las claves por empresa las que deciden qué se saltea.
 */
export async function runJobWithBitacora(
  job: JobName,
  date: string,
  work: () => Promise<JobUnitOutcome[]>
): Promise<JobSummary> {
  const run = await recordRunStart({ job, runKey: `corrida:${date}` });

  let units: JobUnitOutcome[];
  try {
    units = await work();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    logger.error('La corrida del job abortó', { data: { job, date, error } });
    await finishQuietly({ id: run.id, status: 'error', error: message, metadata: { attempt: run.attempts } });
    throw error;
  }

  const summary = summarize(job, date, units);
  await finishQuietly({
    id: run.id,
    // Si alguna empresa falló, la corrida entera queda en `error`: es lo que hace visible el
    // fallo parcial al mirar la tabla, sin tener que cruzar las filas por empresa.
    status: summary.failed > 0 ? 'error' : 'ok',
    error: summary.failed > 0 ? `${summary.failed} empresa(s) con error` : undefined,
    metadata: {
      attempt: run.attempts,
      companies: summary.companies,
      processed: summary.processed,
      skipped: summary.skipped,
      failed: summary.failed,
      emailsSent: summary.emailsSent,
      recipients: summary.recipients,
    },
  });

  return summary;
}
