import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function WorkDiagramTableSkeleton() {
  return (
    <Card>
      <CardContent>
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
          {/* Table rows */}
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-48" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
