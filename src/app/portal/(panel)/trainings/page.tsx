import { HseTrainingList, HseTrainingListSkeleton } from '@/features/Portal/components/HseTrainingList';
import { PortalPageHeader } from '@/features/Portal/components/PortalPageHeader';
import { Suspense } from 'react';

export const metadata = { title: 'Mis capacitaciones' };

export default function PortalTrainingsPage() {
  return (
    <>
      <PortalPageHeader
        title="Mis capacitaciones"
        description="Leé el material y rendí el examen de cada capacitación que te asignaron."
      />
      <Suspense fallback={<HseTrainingListSkeleton />}>
        <HseTrainingList />
      </Suspense>
    </>
  );
}
