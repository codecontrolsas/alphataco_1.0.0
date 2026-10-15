import { getUserPermissionsMapServer } from '@/features/Permissions';
import { SectionErrorBoundary } from '@/shared/components/common/SectionErrorBoundary';
import { Suspense } from 'react';
import TemplatesList from './TemplatesList';
import { PlantillasSkeleton } from './fallback/PlantillasSkeleton';

export default async function PlantillasTabContent({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const permissionsMap = await getUserPermissionsMapServer();

  return (
    <div className="space-y-6">
      <SectionErrorBoundary title="No se pudieron cargar las plantillas">
        <Suspense fallback={<PlantillasSkeleton />}>
          <TemplatesList searchParams={searchParams} permissionsMap={permissionsMap} />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}
