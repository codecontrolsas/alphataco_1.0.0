/**
 * Tipos inferidos de las server actions del detalle del parte diario.
 * NO definir tipos manualmente — siempre usar Awaited<ReturnType<typeof fn>>.
 */

import type { getDailyReportDetailForExport } from '../export.server';
import type {
  getDailyReportDetailPaginated,
  getDailyReportDetailSingleFacet,
  getDailyReportHeader,
} from '../queries.server';

// Un solo origen: `history.server.ts` (otro paquete lo toca); acá solo se re-exporta.
export type { DailyReportHistoryEntry } from '../history.server';

/** Datos de la cabecera del parte diario */
export type DailyReportHeaderData = Awaited<ReturnType<typeof getDailyReportHeader>>;

/** Fila individual del parte diario (con todas sus relaciones) */
export type DailyReportDetailRow = Awaited<ReturnType<typeof getDailyReportDetailPaginated>>['data'][number];

/** Fila del parte diario para exportación (misma shape que DailyReportDetailRow) */
export type DailyReportExportRow = Extract<
  Awaited<ReturnType<typeof getDailyReportDetailForExport>>,
  { ok: true }
>['data'][number];

/** Resultado de la faceta de una columna (`null` si la columna no es soportada o la consulta falló) */
export type DailyReportDetailFacetResult = Awaited<ReturnType<typeof getDailyReportDetailSingleFacet>>;
