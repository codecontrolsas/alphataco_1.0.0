import { Skeleton } from '@/components/ui/skeleton';

/** Lugar del plano isométrico mientras se carga su código. */
export function OrgChartPlanSkeleton() {
  return <Skeleton className="hidden aspect-[16/10] w-full rounded-xl lg:block" />;
}

/** Skeleton del organigrama completo (plano + árbol) mientras carga el Server Component. */
export function OrgChartSkeleton() {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]" aria-busy="true">
      <OrgChartPlanSkeleton />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-2 rounded-lg border p-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
