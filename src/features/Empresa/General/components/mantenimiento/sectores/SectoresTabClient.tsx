'use client';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import type { TablePreferences } from '@/shared/components/common/DataTable';
import { Suspense } from 'react';
import type { WorkshopSector } from '../../../actions/workshops.server';
import SectoresForm from './SectoresForm';
import SectoresTable from './SectoresTable';

interface SectoresTabClientProps {
  workshopSectors: Promise<WorkshopSector[]>;
  internalWorkshops: Promise<{ id: string; name: string }[]>;
  preferences: Promise<TablePreferences>;
}

export function SectoresTabClient({ workshopSectors, internalWorkshops, preferences }: SectoresTabClientProps) {
  const { hasPermission } = usePermissions();

  // Verificar si tiene permisos de crear o editar
  const canCreateOrUpdate =
    hasPermission('configuracion', 'sectores_taller', 'create') ||
    hasPermission('configuracion', 'sectores_taller', 'update');

  return (
    <div className="w-full">
      <ResizablePanelGroup className="min-h-[400px]" direction="horizontal">
        {canCreateOrUpdate && (
          <>
            <ResizablePanel defaultSize={30}>
              <SectoresForm internalWorkshops={internalWorkshops} />
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}

        <ResizablePanel defaultSize={canCreateOrUpdate ? 70 : 100}>
          <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
            <SectoresTable workshopSectors={workshopSectors} preferences={preferences} />
          </Suspense>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
