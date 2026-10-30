import { HseAttemptResult } from '@/features/Portal/components/trainings/HseAttemptResult';
import { PortalDetailSkeleton } from '@/features/Portal/fallback/PortalDetailSkeleton';
import { Suspense } from 'react';

export const metadata = { title: 'Resultado del examen' };

export default async function PortalAttemptResultPage({
  params,
}: {
  params: Promise<{ trainingId: string; attemptId: string }>;
}) {
  const { trainingId, attemptId } = await params;
  return (
    <Suspense fallback={<PortalDetailSkeleton label="Cargando el resultado" />}>
      <HseAttemptResult trainingId={trainingId} attemptId={attemptId} />
    </Suspense>
  );
}
