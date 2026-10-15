'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { useState } from 'react';
import { InfoTip } from '../shared/InfoTip';

interface Props {
  /** Equipos que nunca tuvieron un checklist cargado. */
  historicalCount: number;
  /** Equipos sin ningun checklist dentro del mes en curso. */
  monthCount: number;
}

/**
 * Tarjeta KPI con switch (ticket 685): alterna entre "equipos sin checklist
 * este mes" y "equipos sin checklist historico" sin ocupar dos tarjetas.
 */
export function ChecklistMissingCard({ historicalCount, monthCount }: Props) {
  const [showHistorical, setShowHistorical] = useState(false);
  const value = showHistorical ? historicalCount : monthCount;
  const scope = showHistorical ? 'histórico' : 'este mes';

  return (
    <MetricCard
      label={
        <span className="inline-flex items-center gap-1">
          Sin checklist
          <InfoTip label="Cómo se calcula «Sin checklist»">
            {showHistorical
              ? 'Equipos activos de la tabla de Equipos a los que nunca se les cargó un checklist.'
              : 'Equipos activos de la tabla de Equipos sin ningún checklist dentro del mes en curso (hora argentina).'}
          </InfoTip>
        </span>
      }
      value={value.toLocaleString('es-AR')}
      hint={
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">equipos ({scope})</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Label htmlFor="checklist-missing-switch" className="cursor-pointer text-xs font-normal">
              Ver histórico
            </Label>
            <Switch id="checklist-missing-switch" checked={showHistorical} onCheckedChange={setShowHistorical} />
          </span>
        </span>
      }
    />
  );
}
