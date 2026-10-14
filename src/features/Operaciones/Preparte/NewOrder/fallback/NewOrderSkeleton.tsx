import { Skeleton } from '@/components/ui/skeleton';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { SplitLayout } from '@/shared/components/common/SplitLayout';

/** Esqueleto de la pantalla de nuevo pedido: cabecera, cuatro secciones y el panel de resumen. */
export function NewOrderSkeleton() {
  return (
    <div className="space-y-6 px-4 pt-4 pb-6 sm:px-6" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <SplitLayout
        main={
          <>
            {Array.from({ length: 4 }).map((_, index) => (
              <SectionCard key={index} title={<Skeleton className="h-5 w-44" />}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </SectionCard>
            ))}
          </>
        }
        aside={
          <>
            <SectionCard title="Resumen">
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </SectionCard>
            <SectionCard title="Antes de guardar">
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </SectionCard>
          </>
        }
      />
    </div>
  );
}
