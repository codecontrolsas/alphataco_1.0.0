'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { CatalogCreateButton, CatalogFormSheet, useCatalogSheet } from '@/shared/components/common/CatalogFormSheet';
import type { TablePreferences } from '@/shared/components/common/DataTable/helpers';
import { Suspense, useCallback } from 'react';
import type { Workshop } from '../../../actions/workshops.server';
import TalleresForm from './TalleresForm';
import TalleresTable from './TalleresTable';
import { useTalleresStore } from './store/talleres.store';

interface TalleresTabClientProps {
  workshops: Promise<Workshop[]>;
  preferences: Promise<TablePreferences>;
}

/** Tabla de talleres a ancho completo; alta y edición en un Sheet. La superficie la pone quien monta la sección. */
export function TalleresTabClient({ workshops, preferences }: TalleresTabClientProps) {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('configuracion', 'talleres', 'create');
  const canUpdate = hasPermission('configuracion', 'talleres', 'update');

  // El form sigue leyendo el store de edición: el Sheet lo carga al abrir y lo limpia al cerrar.
  const setWorkshop = useTalleresStore((state) => state.setWorkshop);
  const clearWorkshop = useCallback(() => setWorkshop(null), [setWorkshop]);
  const sheet = useCatalogSheet<Workshop>({
    canCreate,
    canUpdate,
    onOpenEdit: setWorkshop,
    onOpenCreate: clearWorkshop,
    onClosed: clearWorkshop,
  });

  return (
    <>
      <Suspense fallback={<Skeleton className="h-[400px] w-full rounded-md" />}>
        <TalleresTable
          workshops={workshops}
          preferences={preferences}
          onEdit={sheet.openEdit}
          toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo taller" />}
        />
      </Suspense>
      <CatalogFormSheet
        sheet={sheet}
        getKey={(workshop) => workshop.id}
        title={{ create: 'Nuevo taller', edit: 'Editar taller' }}
        size="xl"
      >
        {() => <TalleresForm />}
      </CatalogFormSheet>
    </>
  );
}
