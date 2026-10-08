import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton con la misma banda y geometría que `PageHeader` (overline, título y una línea de meta). */
export function PageHeaderSkeleton() {
  return (
    <div className="-mt-4 ml-[calc(50%-50cqw)] w-[100cqw] border-b border-border-strong bg-card md:-mt-6">
      <div className="mx-auto max-w-(--page-max) space-y-1.5 px-4 py-4 md:px-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-3 w-40" />
      </div>
    </div>
  );
}
