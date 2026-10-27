import { HseTrainingListSkeleton } from '@/features/Portal/components/HseTrainingList';
import { HseTrainingView } from '@/features/Portal/components/HseTrainingView';
import { Suspense } from 'react';

export const metadata = { title: 'Capacitación' };

export default async function PortalTrainingPage({ params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = await params;
  return (
    <Suspense fallback={<HseTrainingListSkeleton label="Cargando la capacitación" />}>
      <HseTrainingView trainingId={trainingId} />
    </Suspense>
  );
}
