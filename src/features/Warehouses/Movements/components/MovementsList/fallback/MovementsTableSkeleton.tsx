import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function MovementsTableSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
          <div className="rounded-md border">
            <div className="border-b p-3">
              <div className="flex gap-4">
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 flex-1" />
                ))}
              </div>
            </div>
            <div className="divide-y">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-3">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <Skeleton key={j} className="h-4 flex-1" />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
