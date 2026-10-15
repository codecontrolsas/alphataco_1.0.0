import { Skeleton } from '@/components/ui/skeleton';

export function MarcasSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-[400px] w-full rounded-md" />
    </div>
  );
}
