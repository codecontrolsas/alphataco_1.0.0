import { cache } from 'react';
import { getDailyReportHeader } from '../queries.server';

/** Cabecera del parte deduplicada por request: la usan la cabecera, el aviso, la tabla y los metadatos. */
export const getCachedDailyReportHeader = cache(getDailyReportHeader);
