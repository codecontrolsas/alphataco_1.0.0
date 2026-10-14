'use client';
import { VehicleById } from '@/app/dashboard/equipment/action/page';
import { getCostCenterOptions } from '@/features/Empresa/General/actions/cost-centers.server';
import { TabsManagerClientSide } from '@/features/TabsManager/TabsManagerClientSide';
import type { TabDefinition } from '@/features/TabsManager/types';
import { Suspense } from 'react';
import { VehicleAssignmentView, VehicleBasicDataView } from './view/VehicleDataView';

interface VehicleTabsProps {
  vehicle: NonNullable<VehicleById>;
  costCentersPromise: ReturnType<typeof getCostCenterOptions>;
  hierarchicalPositionsPromise: Promise<Array<{ id: string; name: string }>>;
  documentsComponent?: React.ReactNode;
  qrComponent?: React.ReactNode;
  checklistsComponent?: React.ReactNode;
  operationsComponent?: React.ReactNode;
  tiresComponent?: React.ReactNode;
}

const TabLabel = ({ text }: { text: string }) => <span>{text}</span>;

/**
 * Pestañas de la ficha del vehículo en modo lectura. La edición y el alta no pasan por acá: usan
 * `form/VehicleEditLayout`, con el formulario completo en una sola página.
 */
export function VehicleTabs({
  vehicle,
  costCentersPromise,
  hierarchicalPositionsPromise,
  documentsComponent,
  qrComponent,
  checklistsComponent,
  operationsComponent,
  tiresComponent,
}: VehicleTabsProps) {
  const tabs = [
    {
      value: 'basicData',
      label: <TabLabel text="Datos del equipo" />,
      moduleSlug: 'equipos',
      tabSlug: 'datos-basicos',
      content: <VehicleBasicDataView vehicle={vehicle} />,
    },
    {
      value: 'assignmentData',
      label: <TabLabel text="Asignación" />,
      moduleSlug: 'equipos',
      tabSlug: 'asignacion',
      content: (
        <Suspense fallback={null}>
          <VehicleAssignmentView
            vehicle={vehicle}
            costCentersPromise={costCentersPromise}
            hierarchicalPositionsPromise={hierarchicalPositionsPromise}
          />
        </Suspense>
      ),
    },
    {
      value: 'documents',
      label: <TabLabel text="Documentación" />,
      // Hereda permisos de documentacion/documentos-de-equipos
      moduleSlug: 'documentacion',
      tabSlug: 'documentos-de-equipos',
      content: documentsComponent,
    },
    {
      value: 'checklists',
      label: <TabLabel text="Checklists" />,
      moduleSlug: 'equipos',
      tabSlug: 'checklist-equipo',
      content: checklistsComponent,
    },
    {
      value: 'operations',
      label: <TabLabel text="Mantenimiento" />,
      moduleSlug: 'equipos',
      tabSlug: 'historial-mantenimiento-equipo',
      content: operationsComponent,
    },
    {
      value: 'tires',
      label: <TabLabel text="Cubiertas" />,
      moduleSlug: 'equipos',
      tabSlug: 'cubiertas-equipo',
      content: tiresComponent ?? <div />,
    },
    {
      value: 'qr',
      label: <TabLabel text="Código QR" />,
      moduleSlug: 'equipos',
      tabSlug: 'qr-equipo',
      content: qrComponent,
    },
  ] satisfies TabDefinition[];

  return (
    <TabsManagerClientSide
      paramName="tab"
      defaultTab="basicData"
      variant="line"
      tabs={tabs}
      listClassName="h-11 w-full justify-start overflow-x-auto"
      triggerClassName="text-foreground/60 hover:text-foreground data-[state=active]:text-foreground flex-none px-4 font-medium transition-colors data-[state=active]:font-semibold data-[state=active]:shadow-none"
    />
  );
}
