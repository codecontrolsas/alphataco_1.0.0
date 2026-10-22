import DocumentNav from '@/features/Documentacion/shared/components/DocumentNav';
import { PermissionGuardServer } from '@/features/Permissions/components/PermissionGuardServer';
import { ViewManagerServer } from '@/features/TabsManager/ViewManagerServer';
import { Suspense } from 'react';
import { MonthlyEquipmentDocumentsList } from './Mensuales/MonthlyEquipmentDocumentsList';
import { MonthlyEquipmentDocumentsSkeleton } from './Mensuales/fallback/MonthlyEquipmentDocumentsSkeleton';
import { EquipmentPermanentDocumentsList } from './Permanentes/EquipmentPermanentDocumentsList';
import { EquipmentPermanentDocumentsSkeleton } from './Permanentes/fallback/EquipmentPermanentDocumentsSkeleton';

export default async function DocumentosEquiposTabContent({
  searchParams,
  permissions,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
  permissions: Record<string, boolean>;
}) {
  return (
    <ViewManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultView="equipos-permanentes"
      permissions={permissions}
      ariaLabel="Documentos de equipos"
      actions={
        <PermissionGuardServer module="documentacion" tab="documentos-de-equipos" action="create">
          <DocumentNav onlyEquipment />
        </PermissionGuardServer>
      }
      views={[
        {
          value: 'equipos-permanentes',
          aliases: ['permanentes'],
          label: 'Permanentes',
          description: 'Documentos sin período, con o sin vencimiento',
          moduleSlug: 'documentacion',
          tabSlug: 'docs-equipos-permanentes',
          content: (
            <Suspense fallback={<EquipmentPermanentDocumentsSkeleton />}>
              <EquipmentPermanentDocumentsList searchParams={searchParams} />
            </Suspense>
          ),
        },
        {
          value: 'equipos-mensuales',
          aliases: ['mensuales'],
          label: 'Mensuales',
          description: 'Documentos que se presentan cada mes',
          moduleSlug: 'documentacion',
          tabSlug: 'docs-equipos-mensuales',
          content: (
            <Suspense fallback={<MonthlyEquipmentDocumentsSkeleton />}>
              <MonthlyEquipmentDocumentsList searchParams={searchParams} />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
