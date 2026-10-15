import { Card, CardContent } from '@/components/ui/card';
import { StateBlock } from '@/shared/components/common/StateBlock';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { Building2 } from 'lucide-react';
import { Suspense } from 'react';
import { WorkshopSectorTasksList } from './WorkshopSectorTasksTable/WorkshopSectorTasksList';
import { WorkshopSectorTasksSkeleton } from './WorkshopSectorTasksTable/fallback/WorkshopSectorTasksSkeleton';
import { getWorkshopSectorsWithCounts, type WorkshopSectorWithCount } from './actions.server';
import { WorkshopSectorsGrid } from './components/WorkshopSectorsGrid';
import { WORKSHOP_SECTOR_PARAM } from './workshop-view-filters';

interface WorkshopViewTabContentProps {
  searchParams: Record<string, string | string[] | undefined>;
}

/** Sector a mostrar: el de la URL si existe; si no, el primero con trabajo abierto (o el primero a secas). */
function resolveSelectedSector(sectors: WorkshopSectorWithCount[], requestedId: string | undefined) {
  const requested = requestedId ? sectors.find((sector) => sector.id === requestedId) : undefined;
  if (requested) return requested;
  const hasOpenWork = (sector: WorkshopSectorWithCount) =>
    Object.values(sector.statusCounts).some((count) => count > 0);
  return sectors.find(hasOpenWork) ?? sectors[0];
}

/** Línea de apoyo de la tarjeta de la tabla: cupos ocupados y tareas del sector que todavía no tienen OT. */
function describeSector(sector: WorkshopSectorWithCount): string {
  const parts: string[] = [];
  if (sector.workshopName) parts.push(sector.workshopName);
  if (sector.maxCapacity == null) {
    parts.push('Sin cupo configurado');
  } else {
    parts.push(
      `${sector.occupiedSlots} de ${sector.maxCapacity} cupos ocupados${sector.isOverCapacity ? ' (cupo excedido)' : ''}`
    );
  }
  if (sector.unassignedTaskCount > 0) {
    parts.push(
      `${sector.unassignedTaskCount} ${sector.unassignedTaskCount === 1 ? 'tarea asignada sin OT generada' : 'tareas asignadas sin OT generada'}`
    );
  }
  return `${parts.join(' · ')}. Las órdenes que ya están en el taller van primero.`;
}

/**
 * Vista Taller (COD-394) — grilla de sectores del taller y la tabla de OT del sector elegido.
 *
 * Arquitectura:
 *  - Una sola llamada trae todos los sectores activos con su cupo y el conteo de
 *    ÓRDENES DE TRABAJO abiertas por estado (ticket 678: antes contaba tareas).
 *  - Cada sector es una tarjeta (`SectorCapacityCard`) que filtra la tabla de abajo.
 *  - Se renderiza UNA sola tabla, la del sector elegido (`?sector=<id>`), en su propio Suspense
 *    keyed por sector: al cambiar de tarjeta las tarjetas siguen en pantalla y solo la tabla se vuelve a pedir.
 */
export async function WorkshopViewTabContent({ searchParams }: WorkshopViewTabContentProps) {
  const sectors = await getWorkshopSectorsWithCounts();

  if (sectors.length === 0) {
    return (
      <Card>
        <CardContent>
          <StateBlock
            variant="empty"
            icon={Building2}
            title="Sin sectores para mostrar"
            description="No hay sectores de taller activos o no se pudieron cargar. Si esperabas verlos, recargá la página."
          />
        </CardContent>
      </Card>
    );
  }

  const requestedParam = searchParams[WORKSHOP_SECTOR_PARAM];
  const selected = resolveSelectedSector(sectors, typeof requestedParam === 'string' ? requestedParam : undefined);

  return (
    <WorkshopSectorsGrid sectors={sectors} selectedSectorId={selected.id}>
      <Suspense key={selected.id} fallback={<WorkshopSectorTasksSkeleton />}>
        <WorkshopSectorTasksList
          sectorId={selected.id}
          searchParams={searchParams as DataTableSearchParams}
          title={`${selected.name} · órdenes de trabajo`}
          description={describeSector(selected)}
        />
      </Suspense>
    </WorkshopSectorsGrid>
  );
}
