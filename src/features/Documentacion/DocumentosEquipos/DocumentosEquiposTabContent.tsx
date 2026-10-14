import DocumentNav from '@/features/Documentacion/shared/components/DocumentNav';
import { PermissionGuardServer } from '@/features/Permissions';
import { TabsManagerServer } from '@/features/TabsManager';
import { Calendar, FileArchive } from 'lucide-react';
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
    <div>
      {/* Subtítulo y botón de carga; el botón se apila debajo en pantallas chicas */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">Documentación de vehículos y equipamiento, con su estado y vencimiento.</p>
        <PermissionGuardServer module="documentacion" tab="documentos-de-equipos" action="create">
          <DocumentNav onlyEquipment />
        </PermissionGuardServer>
      </div>
      <TabsManagerServer
        paramName="subtab"
        searchParams={searchParams}
        defaultTab="equipos-permanentes"
        permissions={permissions}
        tabs={[
          {
            value: 'equipos-permanentes',
            label: (
              <span className="flex items-center gap-2">
                <FileArchive className="h-4 w-4" />
                Permanentes
              </span>
            ),
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
            label: (
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Mensuales
              </span>
            ),
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
    </div>
  );
}
