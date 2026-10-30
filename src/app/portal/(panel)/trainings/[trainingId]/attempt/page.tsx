import { HseExamView } from '@/features/Portal/components/trainings/HseExamView';
import { PortalExamSkeleton } from '@/features/Portal/fallback/PortalExamSkeleton';
import { Suspense } from 'react';

export const metadata = { title: 'Examen' };

export default async function PortalExamPage({ params }: { params: Promise<{ trainingId: string }> }) {
  const { trainingId } = await params;
  return (
    <Suspense fallback={<PortalExamSkeleton />}>
      <HseExamView trainingId={trainingId} />
    </Suspense>
  );
}
