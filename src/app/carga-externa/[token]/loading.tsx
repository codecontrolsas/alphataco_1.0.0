import { Skeleton } from '@/components/ui/skeleton';

/** Mientras se valida el link de carga externa (borde de Suspense de la ruta). */
export default function Loading() {
  return (
    <main
      className="bg-muted/40 flex min-h-dvh items-start justify-center px-4 py-10"
      role="status"
      aria-label="Cargando"
    >
      <div className="bg-card w-full max-w-lg space-y-4 rounded-xl border p-6">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </main>
  );
}
