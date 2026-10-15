import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function DiagramsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Selector de vista */}
      <Skeleton className="h-10 w-full sm:w-80" />

      {/* Search form card */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Skeleton className="h-9 w-36" />
          </div>
        </CardContent>
      </Card>

      {/* Results placeholder */}
      <div className="p-6 rounded-lg border">
        <Skeleton className="h-5 w-80 mx-auto" />
      </div>
    </div>
  );
}
