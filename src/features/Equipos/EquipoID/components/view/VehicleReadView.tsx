import type { VehicleById } from '@/app/dashboard/equipment/action/page';
import { getCostCenterOptions } from '@/features/Empresa/General/actions/cost-centers.server';
import { EquipmentBreadcrumb } from '@/features/Equipos/components/EquipmentBreadcrumb';
import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import { RecordSectionsServer } from '@/features/TabsManager/RecordSectionsServer';
import { Boxes, ClipboardCheck, FileText, LayoutDashboard, QrCode, Truck, Wrench } from 'lucide-react';
import { Suspense } from 'react';
import { VehicleHeader } from '../vehicle-header';
import { VehicleAssignmentView, VehicleBasicDataView } from './VehicleDataView';

/**
 * Pide los centros de costo recién cuando la sección "Equipo" está activa (el contenido de las otras
 * secciones no se renderiza), en vez de dispararlos con cada ficha.
 */
function VehicleAssignmentSection({
  vehicle,
  hierarchicalPositionsPromise,
}: {
  vehicle: NonNullable<VehicleById>;
  hierarchicalPositionsPromise: Promise<Array<{ id: string; name: string }>>;
}) {
  return (
    <VehicleAssignmentView
      vehicle={vehicle}
      costCentersPromise={getCostCenterOptions()}
      hierarchicalPositionsPromise={hierarchicalPositionsPromise}
    />
  );
}

interface VehicleReadViewProps {
  vehicle: NonNullable<VehicleById>;
  sectorName?: string;
  hierarchicalPositionsPromise: Promise<Array<{ id: string; name: string }>>;
  searchParams: Record<string, string | string[] | undefined>;
  permissions: Record<string, boolean>;
  summaryComponent: React.ReactNode;
  documentsComponent: React.ReactNode;
  checklistsComponent: React.ReactNode;
  operationsComponent: React.ReactNode;
  tiresComponent: React.ReactNode;
  qrComponent: React.ReactNode;
}

/**
 * Ficha del vehículo en lectura: ruta de vuelta al listado, cabecera con dominio e interno y acciones,
 * e índice de secciones (`?tab=`) a la izquierda. Solo se arma la sección activa.
 *
 * `aliases`: los valores de `?tab=` de la ficha anterior (`basicData`, `assignmentData`) caen en "Equipo";
 * el resto de los valores (`documents`, `checklists`, `operations`, `tires`, `qr`) se conservan.
 */
export function VehicleReadView({
  vehicle,
  sectorName,
  hierarchicalPositionsPromise,
  searchParams,
  permissions,
  summaryComponent,
  documentsComponent,
  checklistsComponent,
  operationsComponent,
  tiresComponent,
  qrComponent,
}: VehicleReadViewProps) {
  const isTabVisible = createTabVisibilityChecker(permissions);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <EquipmentBreadcrumb
        kind="vehicle"
        isActive={vehicle.is_active ?? true}
        identifier={vehicle.domain || vehicle.serie}
      />

      <VehicleHeader vehicle={vehicle} sectorName={sectorName} />

      <RecordSectionsServer<'equipos' | 'documentacion' | 'mantenimiento'>
        paramName="tab"
        searchParams={searchParams}
        permissions={permissions}
        defaultSection="resumen"
        preserveParams={['action', 'id', 'type']}
        ariaLabel="Secciones del equipo"
        sections={[
          {
            value: 'resumen',
            label: 'Resumen',
            description: 'Estado del equipo de un vistazo',
            icon: <LayoutDashboard aria-hidden="true" />,
            content: summaryComponent,
          },
          {
            value: 'equipo',
            aliases: ['basicData', 'assignmentData'],
            label: 'Equipo',
            description: 'Identificación, contrato y asignación',
            icon: <Truck aria-hidden="true" />,
            visibleWhenAny: [
              { moduleSlug: 'equipos', tabSlug: 'datos-basicos' },
              { moduleSlug: 'equipos', tabSlug: 'asignacion' },
            ],
            content: (
              <div className="space-y-6">
                {isTabVisible('equipos', 'datos-basicos') && <VehicleBasicDataView vehicle={vehicle} />}
                {isTabVisible('equipos', 'asignacion') && (
                  <Suspense fallback={null}>
                    <VehicleAssignmentSection
                      vehicle={vehicle}
                      hierarchicalPositionsPromise={hierarchicalPositionsPromise}
                    />
                  </Suspense>
                )}
              </div>
            ),
          },
          {
            value: 'documents',
            label: 'Documentación',
            description: 'Permanentes y mensuales',
            icon: <FileText aria-hidden="true" />,
            // Hereda permisos de documentacion/documentos-de-equipos
            moduleSlug: 'documentacion',
            tabSlug: 'documentos-de-equipos',
            content: documentsComponent,
          },
          {
            value: 'checklists',
            label: 'Checklists',
            description: 'Inspecciones realizadas',
            icon: <ClipboardCheck aria-hidden="true" />,
            moduleSlug: 'equipos',
            tabSlug: 'checklist-equipo',
            content: checklistsComponent,
          },
          {
            value: 'operations',
            label: 'Mantenimiento',
            description: 'Órdenes y solicitudes rechazadas',
            icon: <Wrench aria-hidden="true" />,
            moduleSlug: 'equipos',
            tabSlug: 'historial-mantenimiento-equipo',
            content: operationsComponent,
          },
          {
            value: 'tires',
            label: 'Cubiertas',
            description: 'Diagrama y órdenes de gomería',
            icon: <Boxes aria-hidden="true" />,
            moduleSlug: 'equipos',
            tabSlug: 'cubiertas-equipo',
            content: tiresComponent,
          },
          {
            value: 'qr',
            label: 'Código QR',
            description: 'Identificación del equipo',
            icon: <QrCode aria-hidden="true" />,
            moduleSlug: 'equipos',
            tabSlug: 'qr-equipo',
            content: qrComponent,
          },
        ]}
      />
    </div>
  );
}
