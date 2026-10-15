'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedProgress } from '@/features/Operaciones/shared/components/SegmentedProgress';
import { useDailyReportStatusSummary } from '../hooks/useDailyReportStatusSummary';
import { buildProgressSegments } from '../../lib/status-progress';

/** Avance del parte: (ejecutadas + en certificación) de las líneas que efectivamente se deben ejecutar. */
export function DailyReportProgress({ dailyReportId }: { dailyReportId: string }) {
  const { data: summary, isLoading } = useDailyReportStatusSummary(dailyReportId);

  if (isLoading || !summary) {
    return (
      <div className="w-full space-y-2 sm:w-56" aria-hidden="true">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 sm:w-56">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Avance</span>
        <span
          className="text-foreground font-mono text-sm font-semibold tabular-nums"
          title="Ejecutadas y en certificación, sobre las líneas que no están canceladas ni reprogramadas"
        >
          {summary.progressTotal > 0 ? `${summary.progressDone} de ${summary.progressTotal} ejecutadas` : 'Sin líneas por ejecutar'}
        </span>
      </div>
      <SegmentedProgress segments={buildProgressSegments(summary)} total={summary.total} label="Avance del parte por estado de línea" />
    </div>
  );
}
