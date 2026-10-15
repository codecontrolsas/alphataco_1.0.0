'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SectorCapacityCard } from '@/features/Mantenimiento/shared/components/SectorCapacityCard';
import { cn } from '@/lib/utils';
import { LayoutGrid, Map as MapIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimistic, useState, useSyncExternalStore, useTransition, type ReactNode } from 'react';
import type { WorkshopSectorWithCount } from '../actions.server';
import { WORKSHOP_SECTOR_PARAM } from '../workshop-view-filters';

// El plano trae el kit isométrico: se carga recién cuando se muestra, no con la pantalla.
const WorkshopPlan = dynamic(() => import('./iso/WorkshopPlan').then((module) => module.WorkshopPlan), {
  ssr: false,
  loading: () => <Skeleton className="aspect-[760/470] w-full rounded-xl" />,
});

type SectorsView = 'plan' | 'cards';

const DESKTOP_QUERY = '(min-width: 768px)';
const subscribeDesktop = (notify: () => void) => {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const getDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;

interface WorkshopSectorsGridProps {
  sectors: WorkshopSectorWithCount[];
  /** Sector con el que se renderizó el servidor (el de la URL, o el primero con trabajo abierto). */
  selectedSectorId: string;
  /** Tabla de OT del sector elegido, ya renderizada por el servidor. */
  children: ReactNode;
}

/**
 * Plano isométrico o grilla de tarjetas de sector (5 columnas, 3 en `xl` hacia abajo, 2 en móvil) que elige la tabla de OT de abajo.
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
  // Plano por defecto desde `md`; en móvil, tarjetas. Lo que elija la persona manda sobre el default.
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktop, () => true);
  const [chosenView, setChosenView] = useState<SectorsView | null>(null);
  const view: SectorsView = chosenView ?? (isDesktop ? 'plan' : 'cards');

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
      <div className="flex justify-end">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={(next) => {
            if (next === 'plan' || next === 'cards') setChosenView(next);
          }}
          aria-label="Forma de ver los sectores"
        >
          <ToggleGroupItem value="plan" aria-label="Plano del taller" className="gap-1.5 px-3">
            <MapIcon className="size-4" aria-hidden="true" />
            Plano
          </ToggleGroupItem>
          <ToggleGroupItem value="cards" aria-label="Tarjetas de sectores" className="gap-1.5 px-3">
            <LayoutGrid className="size-4" aria-hidden="true" />
            Tarjetas
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === 'plan' ? (
        <WorkshopPlan sectors={sectors} selectedSectorId={pressedSectorId} onSelectSector={selectSector} />
      ) : (
        <div
          role="group"
          aria-label="Sectores del taller"
          className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
        >
          {sectors.map((sector) => (
            <SectorCapacityCard
              key={sector.id}
              sector={sector}
              pressed={sector.id === pressedSectorId}
              onSelect={() => selectSector(sector.id)}
            />
          ))}
        </div>
      )}

      <div aria-busy={isPending} className={cn('transition-opacity', isPending && 'opacity-60')}>
        {children}
      </div>
    </div>
  );
}
