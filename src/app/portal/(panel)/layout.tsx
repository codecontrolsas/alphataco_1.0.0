import { PortalPanel } from '@/features/Portal/components/PortalPanel';
import { PortalPanelSkeleton } from '@/features/Portal/components/PortalPanelSkeleton';
import { Suspense } from 'react';

/** Panel del empleado: el perímetro (sesión + acceso habilitado) se resuelve en `PortalPanel`, dentro del Suspense. */
export default function PortalPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PortalPanelSkeleton />}>
      <PortalPanel>{children}</PortalPanel>
    </Suspense>
  );
}
