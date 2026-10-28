import type { JobName } from './types';

/**
 * Agenda de los jobs: ESPEJO de `docker/cron/crontab` (hora del contenedor: America/Argentina/Buenos_Aires).
 * Si se cambia una línea del crontab hay que cambiarla acá, y al revés: la sala de control de TaskApp
 * usa `maxAgeHours` para decidir si un job está atrasado.
 *
 * `maxAgeHours`: 26 para los diarios (un día más 2 h de margen), 176 para los semanales (7 días más 8 h) y 2 para el
 * de cada hora.
 */
export const JOB_SCHEDULE: Record<JobName, { cron: string; maxAgeHours: number }> = {
  'documents-expiry': { cron: '0 8 * * 1', maxAgeHours: 176 },
  'warehouse-batch-expiry': { cron: '5 8 * * 1', maxAgeHours: 176 },
  'daily-report-deviations': { cron: '0 7 * * *', maxAgeHours: 26 },
  'daily-indicators': { cron: '30 0 * * *', maxAgeHours: 26 },
  'documents-status': { cron: '10 0 * * *', maxAgeHours: 26 },
  'processed-commands-purge': { cron: '15 3 * * *', maxAgeHours: 26 },
  // Cada hora: 2 h de margen.
  'hse-expired-attempts': { cron: '7 * * * *', maxAgeHours: 2 },
  // Diario 07:20: avisos de vencimiento al empleado; el resumen a HSE sale solo los lunes.
  'hse-expiry': { cron: '20 7 * * *', maxAgeHours: 26 },
};
