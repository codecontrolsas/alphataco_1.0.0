import { MonthlyEquipmentDocumentsList } from '@/features/Documentacion/DocumentosEquipos/Mensuales/MonthlyEquipmentDocumentsList';
import { MonthlyEquipmentDocumentsSkeleton } from '@/features/Documentacion/DocumentosEquipos/Mensuales/fallback/MonthlyEquipmentDocumentsSkeleton';
import { EquipmentPermanentDocumentsList } from '@/features/Documentacion/DocumentosEquipos/Permanentes/EquipmentPermanentDocumentsList';
import { EquipmentPermanentDocumentsSkeleton } from '@/features/Documentacion/DocumentosEquipos/Permanentes/fallback/EquipmentPermanentDocumentsSkeleton';
import { getUserPermissionsMapServer } from '@/features/Permissions/actions/permissions.server';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { Suspense } from 'react';

interface EquipmentDocumentDetailProps {
  equipmentId: string;
  searchParams: Record<string, string | string[] | undefined>;
}

/**
 * Documentación del equipo dentro de su ficha: permanentes o mensuales (`?subtab=`), sin perder la
 * ficha ni la sección (`action`, `id`, `type`, `tab`) al cambiar de vista.
 */
export async function EquipmentDocumentDetail({ equipmentId, searchParams }: EquipmentDocumentDetailProps) {
  const permissions = await getUserPermissionsMapServer();

  return (
    <ViewManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultView="permanentes"
      permissions={permissions}
      preserveParams={['action', 'id', 'type', 'tab']}
      ariaLabel="Tipo de documentación"
      views={[
        {
          value: 'permanentes',
          label: 'Permanentes',
          description: 'Documentos de presentación única',
          moduleSlug: 'documentacion',
          tabSlug: 'docs-equipos-permanentes',
          content: (
            <Suspense fallback={<EquipmentPermanentDocumentsSkeleton />}>
              <EquipmentPermanentDocumentsList searchParams={searchParams} equipmentId={equipmentId} />
            </Suspense>
          ),
        },
        {
          value: 'mensuales',
          label: 'Mensuales',
          description: 'Documentos que se presentan por período',
          moduleSlug: 'documentacion',
          tabSlug: 'docs-equipos-mensuales',
          content: (
            <Suspense fallback={<MonthlyEquipmentDocumentsSkeleton />}>
              <MonthlyEquipmentDocumentsList searchParams={searchParams} equipmentId={equipmentId} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
