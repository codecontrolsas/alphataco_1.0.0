'use client';

import { useQuery } from '@tanstack/react-query';
import { DETAIL_QUERY_PREFIX } from '../constants';
import { summarizeStatusCountMap } from '../../lib/status-progress';
import { getDailyReportDetailSingleFacet } from '../queries.server';

/**
 * Conteo de líneas por estado SIN filtros (el facet `status` sin params). Cuelga del prefijo
 * `['daily-report-detail', id, …]`, así que `invalidateDetail` lo refresca junto con la tabla.
 */
export function useDailyReportStatusSummary(dailyReportId: string) {
  return useQuery({
    queryKey: [DETAIL_QUERY_PREFIX, dailyReportId, 'status-summary'],
    queryFn: async () => {
      const result = await getDailyReportDetailSingleFacet(dailyReportId, 'status');
      return summarizeStatusCountMap(result?.counts);
    },
    staleTime: 30 * 1000,
  });
}
