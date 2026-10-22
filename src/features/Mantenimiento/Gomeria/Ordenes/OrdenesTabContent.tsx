import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { Suspense } from 'react';
import ServiceOrdersList from './ServiceOrdersList';
import { OrdenesSkeleton } from './fallback/OrdenesSkeleton';

export default async function OrdenesTabContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const permissionsMap = await getUserPermissionsMapServer();

  return (
    <SectionErrorBoundary title="No se pudieron cargar las órdenes de gomería">
      <Suspense fallback={<OrdenesSkeleton />}>
        <ServiceOrdersList searchParams={searchParams} permissionsMap={permissionsMap} />
      </Suspense>
    </SectionErrorBoundary>
  );
}
