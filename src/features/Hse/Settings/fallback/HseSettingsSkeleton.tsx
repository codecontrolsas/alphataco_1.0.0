import { Skeleton } from '@/components/ui/skeleton';

export function HseSettingsSkeleton() {
  return (
    <div className="max-w-2xl space-y-3 rounded-xl border p-6" aria-busy="true" aria-label="Cargando configuración">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
