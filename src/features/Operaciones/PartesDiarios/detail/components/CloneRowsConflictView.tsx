'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { dailyReportTypeServiceLabels } from '@/shared/utils/mappers';
import { AlertTriangle, ArrowLeft, Calendar as CalendarIcon, Copy } from 'lucide-react';
import { useState } from 'react';
import moment from 'moment';
import 'moment/locale/es';
import type { CloneConflictRow, CloneConflictsByDate } from '../clone.server';

moment.locale('es');

interface Props {
  conflicts: CloneConflictsByDate;
  isCloning: boolean;
  onBack: () => void;
  onSkipAndClone: () => void;
  onCloneAnyway: () => void;
  /** Líneas a clonar sin excluir nada (filas de origen × fechas destino). Si falta, el botón no muestra conteo. */
  plannedCount?: number;
}

type ConflictResolution = 'skip' | 'duplicate';

export function CloneRowsConflictView({
  conflicts,
  isCloning,
  onBack,
  onSkipAndClone,
  onCloneAnyway,
  plannedCount,
}: Props) {
  const sortedDates = Object.keys(conflicts.conflicts).sort();
  const [resolution, setResolution] = useState<ConflictResolution>('skip');

  // Cantidad real que se va a clonar según la opción elegida
  const skippedCount = Object.values(conflicts.skipMap).reduce((total, ids) => total + ids.length, 0);
  const cloneCount =
    plannedCount == null ? null : resolution === 'skip' ? Math.max(0, plannedCount - skippedCount) : plannedCount;
  const submitLabel = isCloning
    ? 'Clonando...'
    : cloneCount === 0
      ? 'No hay líneas para clonar'
      : cloneCount == null
      ? 'Clonar líneas'
      : `Clonar ${cloneCount} ${cloneCount === 1 ? 'línea' : 'líneas'}`;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        role="alert"
        className="bg-danger-subtle text-danger-subtle-foreground border-danger/30 flex min-w-0 items-start gap-3 rounded-md border p-3"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">Ya clonaste estos registros antes</p>
          <p className="text-xs">
            Encontramos <span className="font-semibold">{conflicts.totalCount}</span>{' '}
            {conflicts.totalCount === 1 ? 'registro ya clonado' : 'registros ya clonados'} desde tu selección a las
            fechas destino. Revisalos antes de continuar.
          </p>
        </div>
      </div>

      <div className="-mr-2 max-h-[40vh] min-w-0 overflow-y-auto pr-2">
        <div className="space-y-4">
          {sortedDates.map((dateKey) => {
            const items = conflicts.conflicts[dateKey];
            const formattedDate = moment(dateKey).format('dddd D [de] MMMM, YYYY');
            return (
              <section key={dateKey} className="min-w-0 space-y-2">
                <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-background/95 px-1 py-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                  <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <h4 className="truncate text-sm font-medium capitalize">{formattedDate}</h4>
                  <Badge variant="secondary" className="ml-1 shrink-0 px-1.5 py-0 text-[10px] font-medium">
                    {items.length} {items.length === 1 ? 'duplicado' : 'duplicados'}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <ConflictCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <RadioGroup
        value={resolution}
        onValueChange={(value) => setResolution(value as ConflictResolution)}
        disabled={isCloning}
        aria-label="Qué hacer con las líneas que ya existen"
        className="gap-2"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="skip" id="clone-conflict-skip" />
          <Label htmlFor="clone-conflict-skip" className="text-sm font-normal">
            Omitir las que existen
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="duplicate" id="clone-conflict-duplicate" />
          <Label htmlFor="clone-conflict-duplicate" className="text-sm font-normal">
            Duplicarlas igual
          </Label>
        </div>
      </RadioGroup>

      <div className="flex flex-col-reverse flex-wrap gap-2 border-t pt-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isCloning}>
          <ArrowLeft className="mr-1.5 size-3.5" aria-hidden="true" />
          Volver a la selección
        </Button>
        <Button
          type="button"
          onClick={resolution === 'skip' ? onSkipAndClone : onCloneAnyway}
          disabled={isCloning || cloneCount === 0}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function ConflictCard({ item }: { item: CloneConflictRow }) {
  const lineParts = [item.customerName, item.serviceName, item.itemName].filter(Boolean).join(' · ');
  const meta = [
    item.sectorName,
    item.areaName,
    item.workingDay,
    item.startTime && item.endTime ? `${item.startTime}–${item.endTime}` : null,
    item.typeService ? dailyReportTypeServiceLabels[item.typeService] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const clonedAtText = item.clonedAt ? moment(item.clonedAt).format('DD/MM HH:mm') : null;

  return (
    <div className="min-w-0 overflow-hidden rounded-md border bg-muted/30 p-2.5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className={cn('truncate text-sm font-medium', !lineParts && 'italic text-muted-foreground')}>
            {lineParts || 'Sin información de cliente/servicio'}
          </p>
          {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
          {item.description && <p className="line-clamp-1 text-xs italic text-muted-foreground">{item.description}</p>}
        </div>
        {clonedAtText && (
          <div className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-muted-foreground">
            <Copy className="size-3" aria-hidden="true" />
            <span>Clonada {clonedAtText}</span>
          </div>
        )}
      </div>
    </div>
  );
}
