
import type { getDailyReportDetailPaginated } from '../queries.server';

// Un solo origen: `history.server.ts` (otro paquete lo toca); acá solo se re-exporta.
export type { DailyReportHistoryEntry } from '../history.server';

/** Fila individual del parte diario (con todas sus relaciones) */
export type DailyReportDetailRow = Awaited<ReturnType<typeof getDailyReportDetailPaginated>>['data'][number];
