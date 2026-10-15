import type { getVehicleById } from '@/features/Equipos/EquipoID/lib/actions/vehicle-actions';
import { getVehicleByIdCached } from '@/features/Equipos/EquipoID/lib/get-vehicle';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

import { getCostCenterOptions } from '@/features/Empresa/General/actions/cost-centers.server';
import { fetchAllContractorForVehicles } from '@/features/Equipos/EquipoID/actions/customer-catalog-actions';
import { EquipmentDocumentDetail } from '@/features/Equipos/EquipoID/components/equipment-document-detail';
import { VehicleTwinSkeleton } from '@/features/Equipos/EquipoID/components/iso/VehicleTwinLoader';
import { VehicleChecklistsTabContent } from '@/features/Equipos/EquipoID/components/vehicle-checklists-tab-content';
import { VehicleForm } from '@/features/Equipos/EquipoID/components/vehicle-form';
import { VehicleOperationsHistory } from '@/features/Equipos/EquipoID/components/vehicle-operations-history';
import VehicleQr from '@/features/Equipos/EquipoID/components/vehicle-qr';
import { VehicleTiresTab } from '@/features/Equipos/EquipoID/components/vehicle-tires/vehicle-tires-tab';
import { VehicleTwinSection } from '@/features/Equipos/EquipoID/components/vehicle-twin-section';
import { VehicleReadView } from '@/features/Equipos/EquipoID/components/view/VehicleReadView';
import {
  getHierarchicalPositions,
  getModelsByBrand,
  getSubTypesByType,
  getTypesOfVehicles,
  getVehicleBrands,
  getVehicleOwners,
  getVehicleTypes,
} from '@/features/Equipos/EquipoID/lib/actions/vehicle-catalog-actions';
import { getUserPermissionsMapServer } from '@/features/Permissions';
import { canViewServer } from '@/features/Permissions/actionsServer';
import { Logger } from '@/lib/logger';

// Componentes de Otros Equipos
import {
  getOtherEquipmentById,
  getOtherEquipmentCertifications,
  getVehiclesForSelect,
} from '@/features/Equipos/OtherEquipment/actions/actionsServer';
import { OtherEquipmentCertifications } from '@/features/Equipos/OtherEquipment/components/OtherEquipmentCertifications';
import { OtherEquipmentForm } from '@/features/Equipos/OtherEquipment/components/OtherEquipmentForm';
import { OtherEquipmentQr } from '@/features/Equipos/OtherEquipment/components/OtherEquipmentQr';
import { OtherEquipmentReadView } from '@/features/Equipos/OtherEquipment/components/view/OtherEquipmentReadView';

const logger = new Logger('VehiclePage');

interface VehiclePageProps {
  searchParams: Promise<{ action?: 'new' | 'edit' | 'view'; id?: string; type?: string }>;
}

export type VehicleById = Awaited<ReturnType<typeof getVehicleById>> | null;
export type OtherEquipmentById = Awaited<ReturnType<typeof getOtherEquipmentById>> | null;

/**
 * Marca una promesa como "manejada" sin consumirla: si rechaza antes de que el formulario la lea (o
 * nunca la lee, como en la ficha de lectura) no queda un rechazo sin manejar en el servidor, y
 * `use()` en el cliente igual recibe el error.
 */
function prefetch<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

export default async function VehiclePage({ searchParams }: VehiclePageProps) {
  const resolvedSearchParams = await searchParams;
  const id = resolvedSearchParams.id;
  const mode = resolvedSearchParams.action || 'view';
  const isOtherEquipment = resolvedSearchParams.type === 'other';

  // Mapa de permisos: lo usa la pestaña de cubiertas y el control de acceso a la pantalla según `mode`.
  const permissionsPromise = getUserPermissionsMapServer();

  // ─── OTROS EQUIPOS ────────────────────────────────────────────────────────

  if (isOtherEquipment) {
    const actualMode = mode === 'new' || !id ? 'new' : mode;

    // Acceso por modo: alta → `others`/create; edición → `detalle-otro-equipo`/update; lectura → view.
    const otherPermissions = await permissionsPromise;
    const allowed =
      actualMode === 'new'
        ? otherPermissions['equipos:others:create'] === true
        : actualMode === 'edit'
          ? otherPermissions['equipos:detalle-otro-equipo:update'] === true
          : await canViewServer('equipos', 'detalle-otro-equipo');
    if (!allowed) redirect('/dashboard/equipment');

    // Las certificaciones (tab Documentos) solo se muestran en la ficha en lectura, y el id ya está en la URL:
    // se piden junto con el equipo en vez de esperar a tenerlo. Si fallan solas, la ficha sigue existiendo.
    let equipment: OtherEquipmentById = null;
    let certificationsData: Awaited<ReturnType<typeof getOtherEquipmentCertifications>> = [];

    if (actualMode !== 'new') {
      const certificationsRequest =
        actualMode === 'view'
          ? getOtherEquipmentCertifications(id!).catch((error) => {
              logger.error('Error fetching other equipment certifications', { data: { error } });
              return [];
            })
          : Promise.resolve([]);
      try {
        [equipment, certificationsData] = await Promise.all([getOtherEquipmentById(id!), certificationsRequest]);
      } catch {
        notFound();
      }
    }

    const qrComponent =
      equipment?.id && equipment.type?.generates_qr ? (
        <OtherEquipmentQr
          equipmentId={equipment.id}
          equipmentLabel={equipment.serial_number || equipment.intern_number || equipment.id}
        />
      ) : null;

    // Lectura: ficha con secciones. Edición y alta: formulario completo en una página.
    if (actualMode === 'view' && equipment) {
      return (
        <OtherEquipmentReadView
          equipment={equipment}
          searchParams={resolvedSearchParams}
          permissions={otherPermissions}
          certificationsComponent={
            <OtherEquipmentCertifications equipmentId={equipment.id} initialData={certificationsData} />
          }
          qrComponent={qrComponent}
        />
      );
    }

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

    return (
      <div className="space-y-6">
        {/* key ligada al id: fuerza re-montaje al navegar entre equipos para que RHF reinicialice los defaultValues */}
        <OtherEquipmentForm
          key={equipment?.id ?? 'new'}
          equipmentId={equipment?.id}
          mode={actualMode as 'edit' | 'new'}
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
        />
      </div>
    );
  }

  // ─── VEHÍCULOS (comportamiento original) ──────────────────────────────────

  // `?id=new` sin `action` también es un alta; sin id, cualquier otro modo no tiene qué mostrar.
  const actualMode = mode === 'new' || id === 'new' ? 'new' : mode;
  if (actualMode !== 'new' && !id) notFound();

  // Todo lo que solo depende del id arranca junto con el vehículo. El historial de la ficha (órdenes,
  // rechazos, checklists) se pide paginado desde el cliente: no se precarga acá.
  const hierarchicalPositionsPromise = prefetch(getHierarchicalPositions());
  const vehicleRequest: Promise<VehicleById> =
    actualMode === 'new'
      ? Promise.resolve(null)
      : getVehicleByIdCached(id!).catch((error: unknown) => {
          logger.error('Error fetching vehicle', { data: { error } });
          notFound();
        });

  const [vehicle, permissions] = await Promise.all([vehicleRequest, permissionsPromise]);

  // Acceso por modo: alta → `vehicles`/create; edición → `detalle-equipo`/update. (La lectura ya la
  // valida `getVehicleById` con `view`.)
  const allowed =
    actualMode === 'new'
      ? permissions['equipos:vehicles:create'] === true
      : actualMode === 'edit'
        ? permissions['equipos:detalle-equipo:update'] === true
        : true;
  if (!allowed) redirect('/dashboard/equipment');

  // `vehicle.sector` guarda el id del sector: se resuelve el nombre una sola vez y la misma promesa
  // (ya resuelta) alimenta el formulario.
  const sectorName =
    actualMode === 'view' && vehicle?.sector
      ? (await hierarchicalPositionsPromise).find((position) => position.id === vehicle.sector)?.name
      : undefined;

  // Lectura: ficha con secciones. Edición y alta: formulario completo en una página.
  if (actualMode === 'view' && vehicle) {
    return (
      <VehicleReadView
        vehicle={vehicle}
        sectorName={sectorName}
        hierarchicalPositionsPromise={hierarchicalPositionsPromise}
        searchParams={resolvedSearchParams}
        permissions={permissions}
        summaryComponent={
          <Suspense fallback={<VehicleTwinSkeleton />}>
            <VehicleTwinSection vehicle={vehicle} permissions={permissions} />
          </Suspense>
        }
        documentsComponent={<EquipmentDocumentDetail equipmentId={vehicle.id} searchParams={resolvedSearchParams} />}
        checklistsComponent={<VehicleChecklistsTabContent equipmentId={vehicle.id} />}
        operationsComponent={<VehicleOperationsHistory equipmentId={vehicle.id} searchParams={resolvedSearchParams} />}
        tiresComponent={
          <VehicleTiresTab vehicleId={vehicle.id} permissionsMap={permissions} searchParams={resolvedSearchParams} />
        }
        qrComponent={<VehicleQr vehicle={vehicle} />}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* key ligada al id: fuerza re-montaje al navegar entre equipos para que RHF reinicialice los defaultValues */}
      <VehicleForm
        key={vehicle?.id ?? 'new'}
        vehicleId={vehicle?.id}
        mode={actualMode as 'edit' | 'new'}
        vehicle={vehicle}
        contractorsPromise={prefetch(fetchAllContractorForVehicles())}
        costCentersPromise={prefetch(getCostCenterOptions())}
        brandsPromise={prefetch(getVehicleBrands())}
        typesPromise={prefetch(getVehicleTypes('vehicle'))}
        ownersPromise={prefetch(getVehicleOwners())}
        subTypesPromise={prefetch(getSubTypesByType(vehicle?.type.id ?? ''))}
        modelsPromise={prefetch(getModelsByBrand(vehicle?.brand_vehicles?.id ?? 0))}
        typesOfVehiclesPromise={prefetch(getTypesOfVehicles())}
        hierarchicalPositionsPromise={hierarchicalPositionsPromise}
      />
    </div>
  );
}

export async function generateMetadata({ searchParams }: VehiclePageProps) {
  const resolvedSearchParams = await searchParams;
  const id = resolvedSearchParams.id;
  const mode = resolvedSearchParams.action || 'view';
  const isOtherEquipment = resolvedSearchParams.type === 'other';

  if (mode === 'new' || (id === 'new' && !isOtherEquipment)) {
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
    const vehicle = await getVehicleByIdCached(id!);
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
