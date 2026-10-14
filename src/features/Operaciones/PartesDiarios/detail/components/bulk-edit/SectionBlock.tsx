'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AlertTriangle, CalendarIcon, CheckCircle2, Info, Loader2 } from 'lucide-react';
import moment from 'moment';
import type { DailyReportDetailRow } from '../../types';
import type { SectionState, StatusOption } from './types';

interface SectionBlockProps {
  title: string;
  description: string;
  rows: DailyReportDetailRow[];
  options: StatusOption[];
  state: SectionState;
  setState: (next: SectionState) => void;
  isProcessed: boolean;
  isFlashing: boolean;
  isSaving: boolean;
  /** Hay otro guardado en curso: ningún bloque puede guardar a la vez. */
  isBusy: boolean;
  isValid: boolean;
  minRescheduleDate: Date;
  onSave: () => void;
}

export function SectionBlock({
  title,
  description,
  rows,
  options,
  state,
  setState,
  isProcessed,
  isFlashing,
  isSaving,
  isBusy,
  isValid,
  minRescheduleDate,
  onSave,
}: SectionBlockProps) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4 space-y-3 transition-colors w-full min-w-0',
        isProcessed && 'bg-ok-subtle/50 border-ok/40',
        isFlashing && 'ring-2 ring-ok'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm">{title}</h4>
            {isProcessed && (
              <Badge variant="outline" className="border-ok/40 bg-ok-subtle text-ok-subtle-foreground gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Procesado
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      {/* Lista compacta de filas — clip vertical con scroll interno; sin scroll horizontal */}
      <div
        className={cn(
          'w-full min-w-0 rounded border bg-muted/30 overflow-y-auto overflow-x-hidden',
          rows.length > 4 ? 'max-h-32' : ''
        )}
      >
        <ul className="w-full min-w-0 px-2.5 py-2 space-y-1">
          {rows.map((row) => {
            const completedLabel =
              row.completed_day && row.completed_night
                ? 'Ambos turnos'
                : row.completed_day
                  ? 'Diurno OK'
                  : row.completed_night
                    ? 'Nocturno OK'
                    : null;

            return (
              <li key={row.id} className="flex w-full min-w-0 items-center gap-2 text-xs">
                <span className="block min-w-0 flex-1 truncate font-medium text-foreground">
                  {row.customers?.name ?? '—'}
                </span>
                <span className="shrink-0 text-muted-foreground/60">→</span>
                <span className="block min-w-0 flex-1 truncate text-muted-foreground">
                  {row.customer_services?.service_name ?? '—'}
                </span>
                {completedLabel && (
                  <span className="shrink-0 text-[10px] italic text-muted-foreground">{completedLabel}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Form de la sección — deshabilitado si ya fue procesada */}
      <fieldset disabled={isProcessed} className={cn('space-y-3', isProcessed && 'opacity-50')}>
        {/* Estado */}
        <div className="space-y-1.5">
          <Label className="text-xs">Nuevo estado</Label>
          <Select
            value={state.status}
            onValueChange={(val) => setState({ ...state, status: val, cancelReason: '', rescheduleDate: undefined })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar estado..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Motivo de cancelación */}
        {state.status === 'cancelado' && (
          <div className="space-y-1.5">
            <Label className="text-xs">
              Motivo de cancelación <span className="text-danger" aria-hidden="true">*</span>
            </Label>
            <Input
              value={state.cancelReason}
              onChange={(e) => setState({ ...state, cancelReason: e.target.value })}
              placeholder="Ingrese el motivo de cancelación"
            />
          </div>
        )}

        {/* Fecha de reprogramación */}
        {state.status === 'reprogramado' && (
          <div className="space-y-1.5">
            <Label className="text-xs">
              Fecha de reprogramación <span className="text-danger" aria-hidden="true">*</span>
            </Label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              <span>La fecha debe ser hoy o posterior</span>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn('w-full justify-start font-normal', !state.rescheduleDate && 'text-muted-foreground')}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                  {state.rescheduleDate ? moment(state.rescheduleDate).format('DD/MM/YYYY') : 'Seleccionar fecha'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={state.rescheduleDate}
                  onSelect={(d) => setState({ ...state, rescheduleDate: d ?? undefined })}
                  disabled={(date) => date < minRescheduleDate}
                  captionLayout="dropdown"
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Botón guardar de la sección */}
        <div className="flex justify-end pt-1">
          <Button type="button" size="sm" onClick={onSave} disabled={!isValid || isSaving || isBusy || isProcessed}>
            {isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {isProcessed ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Procesado
              </span>
            ) : (
              `Guardar (${rows.length})`
            )}
          </Button>
        </div>
      </fieldset>

      {/* Nota informativa cuando no hay opciones de completar */}
      {options.every((o) => o.value !== 'completar_diurno' && o.value !== 'completar_nocturno') && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3" aria-hidden="true" />
          <span>Las opciones de completar diurno/nocturno no aplican a este grupo.</span>
        </div>
      )}
    </div>
  );
}
