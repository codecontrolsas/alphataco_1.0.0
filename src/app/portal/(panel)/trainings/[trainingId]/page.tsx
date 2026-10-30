import { HseTrainingView } from '@/features/Portal/components/trainings/HseTrainingView';
import { PortalDetailSkeleton } from '@/features/Portal/fallback/PortalDetailSkeleton';
import { Suspense } from 'react';

export const metadata = { title: 'Capacitación' };

export default async function PortalTrainingPage({ params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = await params;
  return (
    <Suspense fallback={<PortalDetailSkeleton label="Cargando la capacitación" />}>
      <HseTrainingView trainingId={trainingId} />
    </Suspense>
  );
}
