import { PortalPanel } from '@/features/Portal/components/layout/PortalPanel';
import { PortalShellSkeleton } from '@/features/Portal/fallback/PortalShellSkeleton';
import { Suspense } from 'react';

/** Panel del empleado: el perímetro (sesión + acceso habilitado + módulo) se resuelve en `PortalPanel`, dentro del Suspense. */
export default function PortalPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PortalShellSkeleton />}>
      <PortalPanel>{children}</PortalPanel>
    </Suspense>
  );
}
