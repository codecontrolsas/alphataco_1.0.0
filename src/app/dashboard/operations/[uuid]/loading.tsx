import { DailyReportDetailSkeleton } from '@/features/Operaciones/PartesDiarios/detail/fallback/DailyReportDetailSkeleton';
import { DailyReportHeaderSkeleton } from '@/features/Operaciones/PartesDiarios/detail/fallback/DailyReportHeaderSkeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <DailyReportHeaderSkeleton />
      <DailyReportDetailSkeleton />
    </div>
  );
}
