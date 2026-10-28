import 'server-only';

import { readEnabledModules } from '@/features/Modules/server/modules.server';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prismaSystem as prisma } from '@/shared/lib/prisma-system';
import { callVoid } from '@/shared/lib/sql';
import {
  listCompanies,
  moduleOffReason,
  runForEachCompany,
  runGlobalStep,
  runJobWithBitacora,
} from '../lib/per-company';
import type { JobSummary, JobUnitOutcome } from '../lib/types';

/**
 * Job diario de las 00:30 (hora argentina) — `GET /api/jobs/daily-indicators`.
 *
 * **Qué hace.**
 * 1. Mantenimiento de estados (una vez, no por empresa) SOLO de las empresas con `operaciones` encendido (F3.3):
 *    - `actualizar_estado_daily_reports()` cierra los partes diarios con fecha pasada. Su
 *      llamador vivo (`after_dailyreportrows_update_optimized`) dejó de hacerlo hace tiempo:
 *      el propio comentario del trigger dice «el cierre ahora es responsabilidad exclusiva
 *      del cronjob». Ese cronjob era de Supabase y se fue con él, así que hasta P5 nadie
 *      cerraba los partes.
 *    - `marcar_prepartes_vencidos()` pasa a `vencido` los prepartes pendientes con fecha
 *      pasada. `prisma/sql/INVENTARIO.md` la marcaba como «llamador: job P5».
 * 2. Por cada empresa, `run_daily_indicators_for_company(company_id)`, que persiste los 11
 *    indicadores del día en `daily_indicators` con `save_to_table => true`.
 *
 * **De dónde saca los datos.** Todo es SQL ya portado en `prisma/sql/` (kpis, diagrams,
 * daily-report); el job no consulta tablas por su cuenta más allá de la lista de empresas.
 *
 * **Idempotencia.** Doble candado:
 * - `jobs_runs` por `<company_id>:<fecha AR>`: una segunda corrida del día ni siquiera entra.
 * - Y si entrara (fila en `error`, o alguien borrando la bitácora), los `INSERT` de
 *   `daily_indicators` son `ON CONFLICT (company_id, snapshot_date, source) DO UPDATE` —
 *   lo arregló la migración `20260923180000_daily_indicators_idempotent`, porque 4 de las 11
 *   funciones no lo tenían y la segunda corrida moría con una violación de unique que el
 *   `EXCEPTION WHEN OTHERS` del SQL se tragaba entera.
 * Los dos pasos de mantenimiento son idempotentes por construcción: filtran por `status` y
 * por fecha, así que la segunda pasada no matchea nada.
 *
 * **Multi-empresa.** `run_daily_indicators_for_company` recibe el `company_id` y todas sus
 * funciones filtran por él; cada fila de `daily_indicators` lleva la empresa en la clave. Los
 * dos pasos de mantenimiento son globales por definición (cierran partes y prepartes de
 * cualquier empresa) y no producen ninguna salida cruzada: escriben estados en las propias
 * filas, no agregan datos de varias empresas en un mismo lugar.
 *
 * **Actor de las escrituras automáticas.** Los dos pasos de mantenimiento se llaman con el
 * `prisma` global, SIN `withActor`, así que las filas de `dailyreportrows_history` que genere
 * el cierre de partes quedan con `changed_by = NULL`. Es una decisión, no un olvido
 * (`shared/lib/sql.ts` advierte explícitamente sobre esto): no hay usuario detrás de un job
 * del cron, e inventar uno —un "usuario sistema"— pondría en el historial un actor que no
 * existe y que alguien podría confundir con una persona. `NULL` es el dato honesto: «lo hizo
 * el sistema». Si en algún momento hace falta distinguir qué job lo hizo, el lugar es una
 * columna nueva del historial, no un `app.user_id` falso.
 *
 * Este job NO manda correos.
 */
export interface DailyIndicatorsDeps {
  /** Fecha de negocio (`YYYY-MM-DD`, hora argentina). Inyectable para los tests. */
  date?: string;
}

const JOB = 'daily-indicators' as const;

export async function runDailyIndicatorsJob(deps: DailyIndicatorsDeps = {}): Promise<JobSummary> {
  const date = deps.date ?? argentinaDate();

  // El `findMany` de empresas y todo lo demás va DENTRO de la bitácora: si la base está
  // caída, la fila `corrida:<fecha>` ya existe y el fallo queda registrado.
  return runJobWithBitacora(JOB, date, async () => {
    const units: JobUnitOutcome[] = [];

    const companies = await listCompanies();

    // El mantenimiento de partes y prepartes solo toca las empresas con `operaciones` encendido (F3.3). Si no se puede
    // leer el estado de una empresa, la corrida falla: no se asume «apagado» (dejaría partes sin cerrar en silencio).
    const operationsCompanyIds: string[] = [];
    for (const company of companies) {
      if ((await readEnabledModules(company.id)).has('operaciones')) operationsCompanyIds.push(company.id);
    }

    units.push(
      await runGlobalStep({
        job: JOB,
        runKey: `mantenimiento:${date}`,
        label: 'Mantenimiento de estados (partes y prepartes)',
        work: async () => {
          if (operationsCompanyIds.length === 0) {
            return { skipped: true, reason: moduleOffReason('operaciones') };
          }
          const scope = [{ uuidArray: operationsCompanyIds }];
          await callVoid('actualizar_estado_daily_reports', scope, prisma);
          await callVoid('marcar_prepartes_vencidos', scope, prisma);
          return {
            reason: `partes diarios cerrados y prepartes vencidos marcados (${operationsCompanyIds.length} empresa(s))`,
          };
        },
      })
    );

    units.push(
      ...(await runForEachCompany({
        job: JOB,
        date,
        companies,
        work: async (company) => {
          // Cliente de sistema: el job corre sin sesión ni empresa activa, y con el rol de la app la RLS
          // rechaza el INSERT de `daily_indicators` (`app_current_company_id()` queda en NULL).
          await callVoid('run_daily_indicators_for_company', [{ uuid: company.id }], prisma);

          const saved = await prisma.daily_indicators.count({
            where: { company_id: company.id, snapshot_date: new Date(`${date}T00:00:00Z`) },
          });

          return { reason: `${saved} indicador(es) persistidos`, metadata: { indicators: saved } };
        },
      }))
    );

    return units;
  });
}
