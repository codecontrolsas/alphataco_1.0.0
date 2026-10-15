import { Suspense } from 'react';
import { MaintenanceOrdersSkeleton } from './fallback/MaintenanceOrdersSkeleton';
import { MaintenanceOrderList } from './table/MaintenanceOrderList';

/**
 * Tab de Órdenes de Mantenimiento - Taller
 *
 * Muestra las órdenes de mantenimiento con su progreso por sectores. Todo el fetching (tabla, tarjetas y
 * datos del wizard) vive dentro del Suspense, así el esqueleto se ve de inmediato.
 */
export function MaintenanceOrdersTabContent({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return (
    <Suspense fallback={<MaintenanceOrdersSkeleton />}>
      <MaintenanceOrderList searchParams={searchParams ?? {}} />
    </Suspense>
  );
}
