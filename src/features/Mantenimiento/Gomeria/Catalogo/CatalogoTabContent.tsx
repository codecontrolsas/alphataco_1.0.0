import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { Suspense } from 'react';
import TiresList from './TiresList';
import { CatalogoSkeleton } from './fallback/CatalogoSkeleton';

export default async function CatalogoTabContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const permissionsMap = await getUserPermissionsMapServer();

  return (
    <SectionErrorBoundary title="No se pudo cargar el catálogo de cubiertas">
      <Suspense fallback={<CatalogoSkeleton />}>
        <TiresList searchParams={searchParams} permissionsMap={permissionsMap} />
      </Suspense>
    </SectionErrorBoundary>
  );
}
