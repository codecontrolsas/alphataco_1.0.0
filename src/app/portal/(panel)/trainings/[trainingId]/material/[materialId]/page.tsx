import { HseMaterialView } from '@/features/Portal/components/trainings/HseMaterialView';
import { PortalDetailSkeleton } from '@/features/Portal/fallback/PortalDetailSkeleton';
import { Suspense } from 'react';

export const metadata = { title: 'Material' };

export default async function PortalMaterialPage({
  params,
}: {
  params: Promise<{ trainingId: string; materialId: string }>;
}) {
  const { trainingId, materialId } = await params;
  return (
    <Suspense fallback={<PortalDetailSkeleton label="Cargando el material" />}>
      <HseMaterialView trainingId={trainingId} materialId={materialId} />
    </Suspense>
  );
}
