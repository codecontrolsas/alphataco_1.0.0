'use client';

import { Badge } from '@/components/ui/badge';
import { dailyReportStatusLabels, dailyReportStatusTones } from '@/shared/utils/mappers';
import { useDailyReportStatusSummary } from '../hooks/useDailyReportStatusSummary';

interface Props {
  dailyReportId: string;
  /** Estado del parte (abierto / cerrado…): viene de la cabecera, que ya está en el servidor. */
  reportStatus: string | null;
}

/** Estado del parte y, si los hay, cuántas líneas están pendientes o sin recursos. */
export function DailyReportStatusPills({ dailyReportId, reportStatus }: Props) {
  const { data: summary } = useDailyReportStatusSummary(dailyReportId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {reportStatus ? (
        <Badge variant={dailyReportStatusTones[reportStatus] ?? 'default'}>
          {dailyReportStatusLabels[reportStatus] ?? reportStatus}
        </Badge>
      ) : null}
      {summary && summary.pending > 0 ? (
        <Badge variant="warning" className="tabular-nums">
          {summary.pending} {summary.pending === 1 ? 'pendiente' : 'pendientes'}
        </Badge>
      ) : null}
      {summary && summary.withoutResources > 0 ? (
        <Badge variant="destructive" className="tabular-nums">
          {summary.withoutResources} sin recursos
        </Badge>
      ) : null}
    </div>
  );
}
