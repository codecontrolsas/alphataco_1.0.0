'use client';

import { Skeleton } from '@/components/ui/skeleton';
import dynamic from 'next/dynamic';
import type { VehicleTwinData } from '../../lib/vehicle-twin';

// La figura (kit isométrico + geometría) se carga bajo demanda y solo en el cliente.
const VehicleTwin = dynamic(() => import('./VehicleTwin').then((m) => m.VehicleTwin), {
  ssr: false,
  loading: () => <VehicleTwinSkeleton />,
});

export function VehicleTwinSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3" aria-busy="true">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function VehicleTwinLoader({ data }: { data: VehicleTwinData }) {
  return <VehicleTwin data={data} />;
}
