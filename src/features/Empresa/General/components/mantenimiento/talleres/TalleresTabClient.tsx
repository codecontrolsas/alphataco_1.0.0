'use client';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import type { TablePreferences } from '@/shared/components/common/DataTable';
import { Suspense } from 'react';
import type { Workshop } from '../../../actions/workshops.server';
import TalleresForm from './TalleresForm';
import TalleresTable from './TalleresTable';

interface TalleresTabClientProps {
  workshops: Promise<Workshop[]>;
  preferences: Promise<TablePreferences>;
}

export function TalleresTabClient({ workshops, preferences }: TalleresTabClientProps) {
  const { hasPermission } = usePermissions();

  // Verificar si tiene permisos de crear o editar
  const canCreateOrUpdate =
    hasPermission('configuracion', 'talleres', 'create') || hasPermission('configuracion', 'talleres', 'update');

  return (
    <div className="w-full">
      <ResizablePanelGroup className="min-h-[400px]" direction="horizontal">
        {canCreateOrUpdate && (
          <>
            <ResizablePanel defaultSize={30}>
              <TalleresForm />
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}

        <ResizablePanel defaultSize={canCreateOrUpdate ? 70 : 100}>
          <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
            <TalleresTable workshops={workshops} preferences={preferences} />
          </Suspense>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
