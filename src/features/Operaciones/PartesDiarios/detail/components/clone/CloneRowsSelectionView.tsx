'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCalendarDate } from '@/shared/utils/calendar-date';
import { Info, X } from 'lucide-react';
import moment from 'moment';
import type { CloneRowsController } from './useCloneRows';

interface Props {
  controller: CloneRowsController;
  /** Fecha del parte en formato YYYY-MM-DD o ISO — se muestra en el título */
  reportDate: string;
}

const TYPE_OPTIONS = [
  { type: 'mensual', id: 'include-mensuales', label: 'Mensuales' },
  { type: 'adicional', id: 'include-adicionales', label: 'Adicionales' },
  { type: 'adicional_permanente', id: 'include-adicionales-permanentes', label: 'Adicionales permanentes' },
] as const;

/** Vista 1 del diálogo de clonado: fechas destino, tipos de registros, recursos a trasladar y navegación. */
export function CloneRowsSelectionView({ controller: c, reportDate }: Props) {
  return (
    <>
      <DialogHeader className="space-y-1.5">
        <DialogTitle>
          {c.isAllMode ? `Clonar líneas del ${formatCalendarDate(reportDate)}` : 'Clonar líneas seleccionadas'}
        </DialogTitle>
        <DialogDescription className="text-xs">
          {c.isAllMode
            ? 'Seleccioná las fechas destino y los tipos de registros a clonar.'
            : `Se clonarán ${c.rowCount} ${c.rowCount === 1 ? 'registro' : 'registros'} a las fechas que selecciones.`}
        </DialogDescription>
      </DialogHeader>

      <TooltipProvider delayDuration={150}>
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6">
          {/* ── Columna izquierda: Calendario + chips de fechas ─────────────── */}
          <div className="space-y-3">
            <Calendar
              mode="multiple"
              selected={c.selectedDates}
              onSelect={(dates: Date[] | undefined) => c.setSelectedDates(dates ?? [])}
              captionLayout="dropdown"
              disabled={(date) => moment(date).isBefore(moment().subtract(1, 'days'))}
              className="rounded-md border"
            />

            {c.selectedDates.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {c.selectedDates.map((date) => (
                  <Badge key={date.toISOString()} variant="secondary" className="gap-1 pl-2 pr-1">
                    {moment(date).format('DD/MM/YYYY')}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        c.removeDate(date);
                      }}
                      className="rounded-full hover:bg-muted-foreground/20 size-4 inline-flex items-center justify-center transition-colors"
                      aria-label={`Eliminar ${moment(date).format('DD/MM/YYYY')}`}
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Seleccioná una o más fechas en el calendario</p>
            )}
          </div>

          {/* ── Columna derecha: Opciones ──────────────────────────────────── */}
          <div className="flex flex-col gap-5">
            {/* Tipos de registros */}
            <section className="space-y-3">
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-medium">Tipos de registros</h4>
                {!c.isAllMode && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3.5 text-muted-foreground cursor-help" aria-label="Más información" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">Los tipos vienen de las filas seleccionadas y no se pueden cambiar.</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {c.isAllMode ? (
                <div className="space-y-2.5">
                  {TYPE_OPTIONS.map(({ type, id, label }) => (
                    <div key={type} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={c.includeType[type]}
                        disabled={!c.typeExists[type]}
                        onCheckedChange={(checked) => c.setIncludeType(type, checked === true)}
                      />
                      <Label
                        htmlFor={id}
                        className={cn('text-sm font-normal', !c.typeExists[type] && 'text-muted-foreground')}
                      >
                        {label} {!c.typeExists[type] && <span className="text-xs">(no hay)</span>}
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                // En modo "selected" se muestran los tipos detectados como chips informativos
                <div className="flex flex-wrap gap-1.5">
                  {TYPE_OPTIONS.filter(({ type }) => c.selectedTypes[type]).map(({ type, label }) => (
                    <Badge key={type} variant="outline" className="font-normal">
                      {label}
                    </Badge>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* Recursos a trasladar */}
            <section className="space-y-3">
              <h4 className="text-sm font-medium">Recursos a trasladar</h4>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="include-employees"
                    checked={c.includeEmployees}
                    onCheckedChange={(checked) => c.setIncludeEmployees(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 leading-none">
                    <Label htmlFor="include-employees" className="text-sm font-normal">
                      Personal
                    </Label>
                    <p className="text-xs text-muted-foreground">Copia los empleados asignados a las nuevas filas</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="include-equipment"
                    checked={c.includeEquipment}
                    onCheckedChange={(checked) => c.setIncludeEquipment(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-0.5 leading-none">
                    <Label htmlFor="include-equipment" className="text-sm font-normal">
                      Equipos
                    </Label>
                    <p className="text-xs text-muted-foreground">Copia los vehículos asignados a las nuevas filas</p>
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Navegación al finalizar */}
            <section>
              {c.selectedDates.length > 1 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex items-center gap-2 cursor-not-allowed">
                      <Checkbox id="navigate-after-clone" checked={false} disabled />
                      <Label htmlFor="navigate-after-clone" className="text-sm font-normal text-muted-foreground">
                        Ir a los registros clonados al finalizar
                      </Label>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Solo disponible al clonar a una sola fecha</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="navigate-after-clone"
                    checked={c.navigateAfterClone}
                    onCheckedChange={(checked) => c.setNavigateAfterClone(checked === true)}
                  />
                  <Label htmlFor="navigate-after-clone" className="text-sm font-normal">
                    Ir a los registros clonados al finalizar
                  </Label>
                </div>
              )}
            </section>
          </div>
        </div>
      </TooltipProvider>

      <DialogFooter className="gap-2 sm:gap-2 pt-2">
        <Button type="button" variant="outline" onClick={c.handleClose} disabled={c.isBusy}>
          Cancelar
        </Button>
        <Button type="button" onClick={c.handleSubmit} disabled={!c.canSubmit} className="min-w-32">
          {c.isCheckingConflicts
            ? 'Verificando...'
            : c.isCloning
              ? 'Clonando...'
              : c.plannedCount != null && c.plannedCount > 0
                ? `Clonar ${c.plannedCount} ${c.plannedCount === 1 ? 'línea' : 'líneas'}`
                : 'Clonar líneas'}
        </Button>
      </DialogFooter>
    </>
  );
}
