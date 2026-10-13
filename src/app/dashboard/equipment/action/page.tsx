import { getVehicleById } from '@/features/Equipos/EquipoID/lib/actions/vehicle-actions';
import { VehicleHeaderSkeleton } from '@/features/Equipos/EquipoID/skeletons/vehicle-header-skeleton';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Card } from '@/components/ui/card';
import { getCostCenterOptions } from '@/features/Empresa/General/actions/cost-centers.server';
import { fetchAllContractorForVehicles } from '@/features/Equipos/EquipoID/actions/vehicle-actions';
import { EquipmentDocumentDetail } from '@/features/Equipos/EquipoID/components/equipment-document-detail';
import { VehicleChecklistsTabContent } from '@/features/Equipos/EquipoID/components/vehicle-checklists-tab-content';
import { VehicleForm } from '@/features/Equipos/EquipoID/components/vehicle-form';
import { VehicleHeader } from '@/features/Equipos/EquipoID/components/vehicle-header';
import { VehicleOperationsHistory } from '@/features/Equipos/EquipoID/components/vehicle-operations-history';
import VehicleQr from '@/features/Equipos/EquipoID/components/vehicle-qr';
import { VehicleTiresTab } from '@/features/Equipos/EquipoID/components/vehicle-tires/vehicle-tires-tab';
import {
  getHierarchicalPositions,
  getModelsByBrand,
  getSubTypesByType,
  getTypesOfVehicles,
  getVehicleBrands,
  getVehicleOwners,
  getVehicleTypes,
} from '@/features/Equipos/EquipoID/lib/actions/vehicle-catalog-actions';
import {
  getMaintenanceOrdersForEquipment,
  getRejectedRequestsForEquipment,
} from '@/features/Equipos/EquipoID/lib/actions/vehicle-operations-actions';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { Logger } from '@/lib/logger';
import BackButton from '@/shared/components/common/BackButton';

// Componentes de Otros Equipos
import {
  getOtherEquipmentById,
  getOtherEquipmentCertifications,
  getVehiclesForSelect,
} from '@/features/Equipos/OtherEquipment/actions/actionsServer';
import { OtherEquipmentCertifications } from '@/features/Equipos/OtherEquipment/components/OtherEquipmentCertifications';
import { OtherEquipmentForm } from '@/features/Equipos/OtherEquipment/components/OtherEquipmentForm';
import { OtherEquipmentHeader } from '@/features/Equipos/OtherEquipment/components/OtherEquipmentHeader';
import { OtherEquipmentQr } from '@/features/Equipos/OtherEquipment/components/OtherEquipmentQr';
import { OtherEquipmentHeaderSkeleton } from '@/features/Equipos/OtherEquipment/fallback/OtherEquipmentHeaderSkeleton';

const logger = new Logger('VehiclePage');

interface VehiclePageProps {
  searchParams: Promise<{ action?: 'new' | 'edit' | 'view'; id?: string; type?: string }>;
}

export type VehicleById = Awaited<ReturnType<typeof getVehicleById>> | null;
export type OtherEquipmentById = Awaited<ReturnType<typeof getOtherEquipmentById>> | null;

export default async function VehiclePage({ searchParams }: VehiclePageProps) {
  const resolvedSearchParams = await searchParams;
  const id = resolvedSearchParams.id;
  const mode = resolvedSearchParams.action || 'view';
  const isOtherEquipment = resolvedSearchParams.type === 'other';

  const permissions = await getUserPermissionsMapServer();

  // ─── OTROS EQUIPOS ────────────────────────────────────────────────────────

  if (isOtherEquipment) {
    let equipment: OtherEquipmentById = null;

    if (mode !== 'new') {
      try {
        equipment = await getOtherEquipmentById(id!);
      } catch {
        notFound();
      }
    }

    const actualMode = mode === 'new' || !id ? 'new' : mode;

    // Catálogos compartidos con vehículos
    const brandsPromise = getVehicleBrands();
    const typesPromise = getVehicleTypes('other_equipment');
    const ownersPromise = getVehicleOwners();
    const modelsPromise = getModelsByBrand(equipment?.brand_vehicles?.id ?? 0);
    const subTypesPromise = getSubTypesByType(equipment?.type?.id ?? '');
    const contractorsPromise = fetchAllContractorForVehicles();
    const costCentersPromise = getCostCenterOptions();
    const hierarchicalPositionsPromise = getHierarchicalPositions();
    const vehiclesPromise = getVehiclesForSelect();

    // Certificaciones (solo cuando hay equipo)
    const certificationsData = equipment?.id ? await getOtherEquipmentCertifications(equipment.id) : [];

    return (
      <div className="p-6 space-y-6">
        <Card className="p-4">
          {/* Header del equipo */}
          {actualMode !== 'new' ? (
            <Suspense fallback={<OtherEquipmentHeaderSkeleton />}>
              <OtherEquipmentHeader mode={actualMode as 'view' | 'edit'} equipment={equipment!} />
            </Suspense>
          ) : (
            <div className="flex justify-end p-4 pb-0">
              <BackButton />
            </div>
          )}

          {/* Formulario del equipo */}
          {/* key ligada al id: fuerza re-montaje al navegar entre equipos para que RHF reinicialice los defaultValues */}
          <OtherEquipmentForm
            key={equipment?.id ?? 'new'}
            equipmentId={equipment?.id}
            mode={actualMode as 'view' | 'edit' | 'new'}
            equipment={equipment}
            brandsPromise={brandsPromise}
            modelsPromise={modelsPromise}
            typesPromise={typesPromise}
            subTypesPromise={subTypesPromise}
            ownersPromise={ownersPromise}
            contractorsPromise={contractorsPromise}
            costCentersPromise={costCentersPromise}
            hierarchicalPositionsPromise={hierarchicalPositionsPromise}
            vehiclesPromise={vehiclesPromise}
            certificationsComponent={
              equipment?.id ? (
                <OtherEquipmentCertifications equipmentId={equipment.id} initialData={certificationsData} />
              ) : null
            }
            qrComponent={
              equipment?.id && equipment.type?.generates_qr ? (
                <OtherEquipmentQr
                  equipmentId={equipment.id}
                  equipmentLabel={equipment.serial_number || equipment.intern_number || equipment.id}
                />
              ) : null
            }
          />
        </Card>
      </div>
    );
  }

  // ─── VEHÍCULOS (comportamiento original) ──────────────────────────────────

  let vehicle: null | VehicleById = null;

  if (mode !== 'new') {
    try {
      vehicle = await getVehicleById(id!);
    } catch (error) {
      logger.error('Error fetching vehicle', { data: { error } });
      notFound();
    }
  }

  // Pre-fetch maintenance orders + rejected requests for the operations tab
  const [initialOrders, initialRejectedRequests] = vehicle?.id
    ? await Promise.all([getMaintenanceOrdersForEquipment(vehicle.id), getRejectedRequestsForEquipment(vehicle.id)])
    : [[], []];

  const actualMode = id === 'new' ? 'new' : mode;

  // `vehicle.sector` guarda el id del sector: se resuelve el nombre una sola vez y la misma promesa
  // (ya resuelta) alimenta el formulario.
  const hierarchicalPositionsPromise = getHierarchicalPositions();
  const sectorName =
    actualMode === 'view' && vehicle?.sector
      ? (await hierarchicalPositionsPromise).find((position) => position.id === vehicle.sector)?.name
      : undefined;

  return (
    <div className="space-y-6">
      {/* La cabecera es de la ficha en lectura; edición y alta traen su propio título. */}
      {actualMode === 'view' && vehicle && (
        <Suspense fallback={<VehicleHeaderSkeleton />}>
          <VehicleHeader vehicle={vehicle} sectorName={sectorName} />
        </Suspense>
      )}

      {/* Vehicle Form */}
      {/* key ligada al id: fuerza re-montaje al navegar entre equipos para que RHF reinicialice los defaultValues */}
      <VehicleForm
        key={vehicle?.id ?? 'new'}
        vehicleId={vehicle?.id}
        mode={mode}
        vehicle={vehicle}
        contractorsPromise={fetchAllContractorForVehicles()}
        costCentersPromise={getCostCenterOptions()}
        brandsPromise={getVehicleBrands()}
        typesPromise={getVehicleTypes('vehicle')}
        ownersPromise={getVehicleOwners()}
        subTypesPromise={getSubTypesByType(vehicle?.type.id!)}
        modelsPromise={getModelsByBrand(vehicle?.brand_vehicles?.id!)}
        typesOfVehiclesPromise={getTypesOfVehicles()}
        hierarchicalPositionsPromise={hierarchicalPositionsPromise}
        documentsComponent={
          <EquipmentDocumentDetail equipmentId={vehicle?.id || ''} searchParams={resolvedSearchParams} />
        }
        qrComponent={<VehicleQr vehicle={vehicle} />}
        checklistsComponent={<VehicleChecklistsTabContent equipmentId={vehicle?.id || ''} />}
        operationsComponent={
          <VehicleOperationsHistory
            equipmentId={vehicle?.id || ''}
            initialData={initialOrders}
            initialRejectedRequests={initialRejectedRequests}
          />
        }
        tiresComponent={
          vehicle?.id ? (
            <VehicleTiresTab vehicleId={vehicle.id} permissionsMap={permissions} searchParams={resolvedSearchParams} />
          ) : undefined
        }
      />
    </div>
  );
}

export async function generateMetadata({ searchParams }: VehiclePageProps) {
  const resolvedSearchParams = await searchParams;
  const id = resolvedSearchParams.id;
  const mode = resolvedSearchParams.action || 'view';
  const isOtherEquipment = resolvedSearchParams.type === 'other';

  if (mode === 'new') {
    return {
      title: isOtherEquipment ? 'Nuevo Otro Equipo' : 'Nuevo Equipo',
      description: isOtherEquipment ? 'Crear un nuevo equipo (otros)' : 'Crear un nuevo equipo',
    };
  }

  if (isOtherEquipment) {
    try {
      const equipment = await getOtherEquipmentById(id!);
      return {
        title: `Equipo - ${equipment.serial_number || equipment.intern_number || 'Sin identificador'}`,
        description: `Detalles del equipo: ${equipment.type?.name || ''}`,
      };
    } catch {
      return { title: 'Equipo no encontrado', description: 'El equipo solicitado no existe' };
    }
  }

  try {
    const vehicle = await getVehicleById(id!);
    return {
      title: `Equipo - ${vehicle.domain || vehicle.serie}`,
      description: `Detalles del equipo ${vehicle.brand} ${vehicle.model}`,
    };
  } catch {
    return {
      title: 'Equipo no encontrado',
      description: 'El equipo solicitado no existe',
    };
  }
}
