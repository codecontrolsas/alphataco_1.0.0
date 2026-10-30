import { PortalHome } from '@/features/Portal/components/home/PortalHome';
import { PortalDetailSkeleton } from '@/features/Portal/fallback/PortalDetailSkeleton';
import { Suspense } from 'react';

export const metadata = { title: 'Inicio' };

export default function PortalHomePage() {
  return (
    <Suspense fallback={<PortalDetailSkeleton label="Cargando tu inicio" />}>
      <PortalHome />
    </Suspense>
  );
}
