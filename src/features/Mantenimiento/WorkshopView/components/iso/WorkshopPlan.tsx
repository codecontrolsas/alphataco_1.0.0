'use client';

import { cn } from '@/lib/utils';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { IsoFigure } from '@/shared/components/iso/IsoFigure';
import { useIsoSelect } from '@/shared/components/iso/use-iso-select';
import { Building2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import type { WorkshopSectorWithCount } from '../../actions.server';
import { buildWorkshopPlanSvg, countsOf, type PlanCounts } from './workshop-plan-geometry';

interface WorkshopPlanProps {
  sectors: WorkshopSectorWithCount[];
  selectedSectorId: string;
  onSelectSector: (sectorId: string) => void;
}

const LEGEND: Array<{ key: keyof PlanCounts; label: string; swatch: string; dashed?: boolean }> = [
  { key: 'active', label: 'En curso', swatch: 'bg-ok' },
  { key: 'pending', label: 'Pendientes de ingreso', swatch: 'bg-warn' },
  { key: 'paused', label: 'Pausadas (trabadas)', swatch: 'bg-danger' },
  { key: 'unassigned', label: 'Tareas sin OT', swatch: 'border border-dashed border-warn bg-warn/15', dashed: true },
];

/**
 * Plano isométrico del taller: una bahía por sector con sus OT abiertas como piezas y un semáforo de cupo.
 * Tocar una bahía (clic, Enter o Espacio) elige el sector; la tabla de OT de abajo sigue siendo el detalle.
 */
export function WorkshopPlan({ sectors, selectedSectorId, onSelectSector }: WorkshopPlanProps) {
  const figure = useMemo(() => {
    try {
      return buildWorkshopPlanSvg({ sectors, selectedSectorId });
    } catch {
      return null;
    }
  }, [sectors, selectedSectorId]);

  const totals = useMemo(() => {
    const sum: PlanCounts = { active: 0, paused: 0, pending: 0, unassigned: 0 };
    for (const sector of sectors) {
      const c = countsOf(sector);
      sum.active += c.active;
      sum.paused += c.paused;
      sum.pending += c.pending;
      sum.unassigned += c.unassigned;
    }
    return sum;
  }, [sectors]);

  const handlers = useIsoSelect(
    useCallback(
      (id: string | null) => {
        if (id) onSelectSector(id);
      },
      [onSelectSector]
    )
  );

  if (sectors.length === 0) {
    return (
      <StateBlock
        variant="empty"
        icon={Building2}
        title="Sin sectores para dibujar"
        description="No hay sectores de taller activos."
      />
    );
  }

  if (!figure) {
    return (
      <StateBlock
        variant="error"
        title="No se pudo dibujar el plano"
        description="Usá la vista de tarjetas para seguir trabajando con los sectores."
      />
    );
  }

  const selected = sectors.find((sector) => sector.id === selectedSectorId);

  return (
    <div className="space-y-3">
      <div
        {...handlers}
        role="group"
        aria-label="Plano del taller: elegí una bahía para ver sus órdenes de trabajo"
        className="bg-card overflow-hidden rounded-xl border p-2 md:p-4"
      >
        <IsoFigure svg={figure.svg} className="mx-auto max-w-[900px]" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Referencias del plano">
          {LEGEND.map((item) => (
            <li key={item.key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('size-3 rounded-[3px]', item.swatch)} />
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium tabular-nums">{totals[item.key]}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          Semáforo del poste: verde con cupo, ámbar casi lleno, rojo completo.
          {selected ? <span className="text-foreground"> Elegido: {selected.name}.</span> : null}
        </p>
      </div>
    </div>
  );
}
