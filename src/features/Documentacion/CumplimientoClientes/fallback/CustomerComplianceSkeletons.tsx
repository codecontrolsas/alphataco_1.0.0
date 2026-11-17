import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function CustomerMatrixSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4" role="status" aria-label="Cargando la matriz por cliente">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-80 w-full" />
      </CardContent>
    </Card>
  );
}

export function PlannerSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4" role="status" aria-label="Cargando el simulador">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}
