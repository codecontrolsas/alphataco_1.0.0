import { Skeleton } from '@/components/ui/skeleton';
import { MaintenanceLoginCard } from '@/features/Mantenimiento/AnonymousLogin/MaintenanceLoginCard';
import { requireInstanceRoute } from '@/features/Modules/server/public-routes.server';
import { Suspense } from 'react';

/** El QR sirve a tres claves: sin ninguna encendida en la instancia, la ruta no existe (la empresa se conoce con el equipo). */
async function MaintenanceInstanceGate() {
  await requireInstanceRoute('/maintenance');
  return <MaintenanceLoginCard />;
}

export default function MaintenanceLoginPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-md" />}>
      <MaintenanceInstanceGate />
    </Suspense>
  );
}
