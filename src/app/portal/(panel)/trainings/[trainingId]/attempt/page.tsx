import { HseExamView } from '@/features/Portal/components/HseExamView';
import { HseTrainingListSkeleton } from '@/features/Portal/components/HseTrainingList';
import { Suspense } from 'react';

export const metadata = { title: 'Examen' };

export default async function PortalExamPage({ params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = await params;
  return (
    <Suspense fallback={<HseTrainingListSkeleton label="Cargando el examen" />}>
      <HseExamView trainingId={trainingId} />
    </Suspense>
  );
}
