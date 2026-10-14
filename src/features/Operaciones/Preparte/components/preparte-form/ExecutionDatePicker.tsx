'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { FormLabel } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import type { ItemRow } from './types';

interface ExecutionDatePickerProps {
  row: ItemRow;
  isEditing: boolean;
  /** Hay errores de validación en los ítems: marca en rojo lo que falta. */
  hasItemErrors: boolean;
  onChange: (executionDate: ItemRow['executionDate']) => void;
}

/** Fecha de ejecución de una línea: un día al editar, un rango de días al crear. */
export function ExecutionDatePicker({ row, isEditing, hasItemErrors, onChange }: ExecutionDatePickerProps) {
  const isMissing = hasItemErrors && !row.executionDate?.from && !row.subject_to_availability;

  return (
    <div className="flex flex-col gap-2">
      <FormLabel className={cn('text-sm', isMissing && 'text-destructive')}>
        Fecha de Ejecución {isMissing && <span className="text-destructive">*</span>}
      </FormLabel>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={row.subject_to_availability}
            className={cn(
              'w-full justify-start text-left font-normal',
              !row.executionDate?.from && 'text-muted-foreground',
              row.subject_to_availability && 'opacity-50',
              isMissing && 'border-destructive'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {row.subject_to_availability ? (
              <span className="italic">Sujeto a disponibilidad operativa</span>
            ) : row.executionDate?.from ? (
              row.executionDate.to && row.executionDate.from.getTime() !== row.executionDate.to.getTime() ? (
                <>
                  {moment(row.executionDate.from).format('DD/MM/YYYY')} -{' '}
                  {moment(row.executionDate.to).format('DD/MM/YYYY')}
                </>
              ) : (
                moment(row.executionDate.from).locale('es').format('LL')
              )
            ) : (
              <span>Seleccionar fecha</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          {isEditing ? (
            <Calendar
              mode="single"
              selected={row.executionDate?.from}
              onSelect={(date) => {
                if (date) onChange({ from: date, to: date });
              }}
              initialFocus
            />
          ) : (
            <Calendar
              mode="range"
              selected={row.executionDate?.from ? (row.executionDate as { from: Date; to?: Date }) : undefined}
              fromDate={new Date()}
              onSelect={(range) => {
                if (range?.from && range?.to && range.from > range.to) return;
                onChange(range || undefined);
              }}
              initialFocus
              numberOfMonths={2}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
