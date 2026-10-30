import { PortalProfile } from '@/features/Portal/components/profile/PortalProfile';
import { PortalDetailSkeleton } from '@/features/Portal/fallback/PortalDetailSkeleton';
import { Suspense } from 'react';

export const metadata = { title: 'Mi perfil' };

export default function PortalProfilePage() {
  return (
    <Suspense fallback={<PortalDetailSkeleton label="Cargando tu perfil" />}>
      <PortalProfile />
    </Suspense>
  );
}
