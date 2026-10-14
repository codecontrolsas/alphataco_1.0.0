import { MonthlyEquipmentDocumentsList } from '@/features/Documentacion/DocumentosEquipos/Mensuales/MonthlyEquipmentDocumentsList';
import { MonthlyEquipmentDocumentsSkeleton } from '@/features/Documentacion/DocumentosEquipos/Mensuales/fallback/MonthlyEquipmentDocumentsSkeleton';
import { EquipmentPermanentDocumentsList } from '@/features/Documentacion/DocumentosEquipos/Permanentes/EquipmentPermanentDocumentsList';
import { EquipmentPermanentDocumentsSkeleton } from '@/features/Documentacion/DocumentosEquipos/Permanentes/fallback/EquipmentPermanentDocumentsSkeleton';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { TabsManagerServer } from '@/features/TabsManager';
import { Calendar, FileArchive } from 'lucide-react';
import { Suspense } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface EquipmentDocumentDetailProps {
  equipmentId: string;
  searchParams: Record<string, string | string[] | undefined>;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export async function EquipmentDocumentDetail({ equipmentId, searchParams }: EquipmentDocumentDetailProps) {
  // Obtener permisos (usa cache del layout, sin query adicional)
  const permissions = await getUserPermissionsMapServer();

  return (
    <TabsManagerServer
      paramName="subtab"
      searchParams={searchParams}
      defaultTab="permanentes"
      permissions={permissions}
      tabs={[
        {
          value: 'permanentes',
          label: (
            <span className="flex items-center gap-2">
              <FileArchive className="h-4 w-4" />
              Documentos Permanentes
            </span>
          ),
          moduleSlug: 'documentacion',
          tabSlug: 'docs-equipos-permanentes',
          content: (
            <div>
              <Suspense fallback={<EquipmentPermanentDocumentsSkeleton />}>
                <EquipmentPermanentDocumentsList searchParams={searchParams} equipmentId={equipmentId} />
              </Suspense>
            </div>
          ),
        },
        {
          value: 'mensuales',
          label: (
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Documentos Mensuales
            </span>
          ),
          moduleSlug: 'documentacion',
          tabSlug: 'docs-equipos-mensuales',
          content: (
            <div>
              <Suspense fallback={<MonthlyEquipmentDocumentsSkeleton />}>
                <MonthlyEquipmentDocumentsList searchParams={searchParams} equipmentId={equipmentId} />
              </Suspense>
            </div>
          ),
        },
      ]}
    />
  );
}
