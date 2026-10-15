'use client';

import { cn } from '@/lib/utils';
import { SectorCapacityCard } from '@/features/Mantenimiento/shared/components/SectorCapacityCard';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimistic, useTransition, type ReactNode } from 'react';
import type { WorkshopSectorWithCount } from '../actions.server';
import { WORKSHOP_SECTOR_PARAM } from '../workshop-view-filters';

interface WorkshopSectorsGridProps {
  sectors: WorkshopSectorWithCount[];
  /** Sector con el que se renderizó el servidor (el de la URL, o el primero con trabajo abierto). */
  selectedSectorId: string;
  /** Tabla de OT del sector elegido, ya renderizada por el servidor. */
  children: ReactNode;
}

/**
 * Grilla de tarjetas de sector (5 columnas, 3 en `xl` hacia abajo, 2 en móvil) que elige la tabla de OT de abajo.
 *
 * La tabla del sector es un Server Component: tocar una tarjeta escribe `?sector=<id>` en la URL (sin recargar
 * ni saltar de posición) y el servidor renderiza SOLO la tabla de ese sector, en vez de las de todos como hacía
 * el acordeón. La tarjeta se marca al instante (`useOptimistic`) y la tabla se atenúa mientras llega la nueva.
 */
export function WorkshopSectorsGrid({ sectors, selectedSectorId, children }: WorkshopSectorsGridProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [pressedSectorId, setPressedSectorId] = useOptimistic(selectedSectorId);

  const selectSector = (sectorId: string) => {
    if (sectorId === selectedSectorId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(WORKSHOP_SECTOR_PARAM, sectorId);
    startTransition(() => {
      setPressedSectorId(sectorId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Sectores del taller" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {sectors.map((sector) => (
          <SectorCapacityCard
            key={sector.id}
            sector={sector}
            pressed={sector.id === pressedSectorId}
            onSelect={() => selectSector(sector.id)}
          />
        ))}
      </div>

      <div aria-busy={isPending} className={cn('transition-opacity', isPending && 'opacity-60')}>
        {children}
      </div>
    </div>
  );
}
