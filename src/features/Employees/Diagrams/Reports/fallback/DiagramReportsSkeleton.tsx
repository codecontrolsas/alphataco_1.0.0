import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function DiagramReportsSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-6 w-48" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-full max-w-64" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-28" />
          </div>
          {/* Table header */}
          <div className="rounded-md border">
            <div className="border-b bg-muted/50 px-4 py-3">
              <div className="grid grid-cols-8 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-4" />
                ))}
              </div>
            </div>
            {/* Table rows */}
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="border-b px-4 py-3 last:border-0">
                <div className="grid grid-cols-8 gap-4">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <Skeleton key={j} className="h-4" style={{ width: j === 0 ? '16px' : '100%' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
