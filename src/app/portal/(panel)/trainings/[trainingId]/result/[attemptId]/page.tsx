import { HseAttemptResult } from '@/features/Portal/components/HseAttemptResult';
import { HseTrainingListSkeleton } from '@/features/Portal/components/HseTrainingList';
import { Suspense } from 'react';

export const metadata = { title: 'Resultado del examen' };

export default async function PortalAttemptResultPage({
  params,
}: {
  params: Promise<{ trainingId: string; attemptId: string }>;
}) {
  const { trainingId, attemptId } = await params;
  return (
    <Suspense fallback={<HseTrainingListSkeleton label="Cargando el resultado" />}>
      <HseAttemptResult trainingId={trainingId} attemptId={attemptId} />
    </Suspense>
  );
}
