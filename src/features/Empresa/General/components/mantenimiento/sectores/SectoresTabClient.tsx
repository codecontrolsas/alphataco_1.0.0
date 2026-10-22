'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { CatalogCreateButton, CatalogFormSheet, useCatalogSheet } from '@/shared/components/common/CatalogFormSheet';
import type { TablePreferences } from '@/shared/components/common/DataTable/helpers';
import { Suspense, useCallback } from 'react';
import type { WorkshopSector } from '../../../actions/workshops.server';
import SectoresForm from './SectoresForm';
import SectoresTable from './SectoresTable';
import { useSectoresStore } from './store/sectores.store';

interface SectoresTabClientProps {
  workshopSectors: Promise<WorkshopSector[]>;
  internalWorkshops: Promise<{ id: string; name: string }[]>;
  preferences: Promise<TablePreferences>;
}

/** Tabla de sectores a ancho completo; alta y edición en un Sheet. La superficie la pone quien monta la sección. */
export function SectoresTabClient({ workshopSectors, internalWorkshops, preferences }: SectoresTabClientProps) {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('configuracion', 'sectores_taller', 'create');
  const canUpdate = hasPermission('configuracion', 'sectores_taller', 'update');

  const setSector = useSectoresStore((state) => state.setSector);
  const clearSector = useCallback(() => setSector(null), [setSector]);
  const sheet = useCatalogSheet<WorkshopSector>({
    canCreate,
    canUpdate,
    onOpenEdit: setSector,
    onOpenCreate: clearSector,
    onClosed: clearSector,
  });

  return (
    <>
      <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
        <SectoresTable
          workshopSectors={workshopSectors}
          preferences={preferences}
          onEdit={sheet.openEdit}
          toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo sector" />}
        />
      </Suspense>
      <CatalogFormSheet
        sheet={sheet}
        getKey={(sector) => sector.id}
        title={{ create: 'Nuevo sector', edit: 'Editar sector' }}
        size="lg"
      >
        {() => (
          // El form lee la promesa de talleres con `use()`: su propio Suspense evita tumbar toda la sección.
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-md" />}>
            <SectoresForm internalWorkshops={internalWorkshops} />
          </Suspense>
        )}
      </CatalogFormSheet>
    </>
  );
}
