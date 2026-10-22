import { Skeleton } from '@/components/ui/skeleton';
import { MaintenanceLoginCard } from '@/features/Mantenimiento/AnonymousLogin/MaintenanceLoginCard';
import { Suspense } from 'react';

export default function MaintenanceLoginPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-md" />}>
      <MaintenanceLoginCard />
    </Suspense>
  );
}
