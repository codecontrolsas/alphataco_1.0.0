import { Skeleton } from '@/components/ui/skeleton';
import { PreparteSkeleton } from '@/features/Operaciones/Preparte/fallback/PreparteSkeleton';

/** Carga de Operaciones: título de sección y la vista por defecto (gestor de pedidos). */
export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <PreparteSkeleton />
    </div>
  );
}
