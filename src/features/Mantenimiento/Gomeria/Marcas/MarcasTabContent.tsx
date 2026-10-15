import { getUserPermissionsMapServer } from '@/features/Permissions';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { Suspense } from 'react';
import MarcasList from './components/MarcasList';
import { MarcasSkeleton } from './fallback/MarcasSkeleton';

export default async function MarcasTabContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const permissionsMap = await getUserPermissionsMapServer();

  return (
    <SectionErrorBoundary title="No se pudieron cargar las marcas">
      <Suspense fallback={<MarcasSkeleton />}>
        <MarcasList searchParams={searchParams} permissionsMap={permissionsMap} />
      </Suspense>
    </SectionErrorBoundary>
  );
}
