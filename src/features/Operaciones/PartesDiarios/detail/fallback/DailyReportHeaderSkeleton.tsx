import { Skeleton } from '@/components/ui/skeleton';
import { RecordHeader } from '@/shared/components/common/RecordHeader';

export function DailyReportHeaderSkeleton() {
  return (
    <RecordHeader
      identity={
        <div className="flex items-center gap-4" aria-hidden="true">
          <Skeleton className="size-14 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        </div>
      }
      actions={
        <>
          <div className="w-full space-y-2 sm:w-56" aria-hidden="true">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <Skeleton className="h-9 w-32" />
        </>
      }
    />
  );
}
