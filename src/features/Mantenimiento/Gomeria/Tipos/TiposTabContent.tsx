import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { Suspense } from 'react';
import TiposList from './components/TiposList';
import { TiposSkeleton } from './fallback/TiposSkeleton';

export default async function TiposTabContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const permissionsMap = await getUserPermissionsMapServer();

  return (
    <SectionErrorBoundary title="No se pudieron cargar los tipos de cubierta">
      <Suspense fallback={<TiposSkeleton />}>
        <TiposList searchParams={searchParams} permissionsMap={permissionsMap} />
      </Suspense>
    </SectionErrorBoundary>
  );
}
