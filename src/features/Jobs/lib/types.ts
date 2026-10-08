/** Nombres de job. Coinciden con el último segmento de la ruta y con `jobs_runs.job`. */
export const JOB_NAMES = ['documents-expiry', 'daily-report-deviations', 'daily-indicators', 'warehouse-batch-expiry'] as const;

export type JobName = (typeof JOB_NAMES)[number];

/** Qué pasó con UNA empresa (o con el paso global de mantenimiento) dentro de una corrida. */
export interface JobUnitOutcome {
  companyId: string | null;
  companyName: string;
  /**
   * - `ok`: se reclamó la corrida y se hizo el trabajo.
   * - `skipped`: no se reclamó (ya había corrido hoy) o no había nada para hacer
   *   (sin parte diario, sin destinatarios configurados).
   * - `error`: se reclamó y falló. Queda en `jobs_runs` con `status = 'error'` y es
   *   reintentable en la próxima corrida.
   */
  status: 'ok' | 'skipped' | 'error';
  /** Por qué se salteó o qué se hizo. Va al cuerpo de la respuesta y a `jobs_runs.metadata`. */
  reason?: string;
  /** Cuántas direcciones recibieron el correo de esta empresa. */
  recipients?: number;
  /** `true` si `sendMail` confirmó el envío (sin SMTP configurado es `false`, no es un error). */
  emailSent?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Resultado de una corrida completa. Es lo que el endpoint devuelve como JSON y lo que hace
 * visible el trabajo: el `Logger` del repo sólo emite con `NEXT_PUBLIC_SHOW_LOGS=true`, así
 * que el rastro que queda siempre son las filas de `jobs_runs` y este cuerpo.
 */
export interface JobSummary {
  job: JobName;
  /** Fecha de negocio en hora argentina (`YYYY-MM-DD`). */
  date: string;
  companies: number;
  processed: number;
  skipped: number;
  failed: number;
  emailsSent: number;
  recipients: number;
  units: JobUnitOutcome[];
}

export function summarize(job: JobName, date: string, units: JobUnitOutcome[]): JobSummary {
  return {
    job,
    date,
    companies: units.filter((unit) => unit.companyId !== null).length,
    processed: units.filter((unit) => unit.status === 'ok').length,
    skipped: units.filter((unit) => unit.status === 'skipped').length,
    failed: units.filter((unit) => unit.status === 'error').length,
    emailsSent: units.filter((unit) => unit.emailSent === true).length,
    recipients: units.reduce((total, unit) => total + (unit.recipients ?? 0), 0),
    units,
  };
}
