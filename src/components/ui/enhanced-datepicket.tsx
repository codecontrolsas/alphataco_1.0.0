'use client';

import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import moment from 'moment';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const DATE_FORMAT = 'DD/MM/YYYY';

interface DatePickerProps extends Pick<React.ComponentProps<'input'>, 'id' | 'name' | 'aria-label'> {
  /** Fecha actual. Acepta Date o ISO string (compatibilidad con react-hook-form). */
  date?: Date | string;
  setDate?: (date: Date | undefined) => void;
  /** Fecha minima seleccionable/escribible (ej: hoy para vencimientos). Opcional. */
  minDate?: Date;
  /** Fecha maxima seleccionable/escribible (ej: ayer para partes ya ocurridos). Opcional. */
  maxDate?: Date;
  placeholder?: string;
  className?: string;
  /** Lo inyecta FormControl de shadcn para enlazar la descripcion y el error del campo. */
  'aria-describedby'?: string;
  /** Lo inyecta FormControl de shadcn cuando el campo tiene un error de validacion. */
  'aria-invalid'?: boolean;
}

/** Normaliza el valor entrante (Date | ISO string) a un Date valido o undefined. */
function normalizeDate(value?: Date | string): Date | undefined {
  if (!value) return undefined;
  const parsed = moment(value);
  return parsed.isValid() ? parsed.toDate() : undefined;
}

/**
 * Date picker con escritura directa: el usuario puede tipear la fecha en formato
 * DD/MM/YYYY o seleccionarla desde el calendario (boton con icono). Equivalente al
 * input nativo type="date" pero con componentes de shadcn/ui.
 */
export function EnhancedDatePicker({
  date,
  setDate,
  minDate,
  maxDate,
  placeholder = DATE_FORMAT,
  className,
  id,
  name,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: DatePickerProps) {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(() => normalizeDate(date));
  const [inputValue, setInputValue] = React.useState<string>(() => {
    const initial = normalizeDate(date);
    return initial ? moment(initial).format(DATE_FORMAT) : '';
  });
  const [inputError, setInputError] = React.useState('');
  const [calendarMonth, setCalendarMonth] = React.useState<Date>(() => normalizeDate(date) ?? new Date());
  const [isOpen, setIsOpen] = React.useState(false);

  const commitDate = (newDate: Date | undefined) => {
    setSelectedDate(newDate);
    setDate?.(newDate);
  };

  const handleInputChange = (raw: string) => {
    setInputValue(raw);

    if (raw === '') {
      setInputError('');
      commitDate(undefined);
      return;
    }

    const parsed = moment(raw, DATE_FORMAT, true);

    if (!parsed.isValid()) {
      setInputError('Formato invalido. Use DD/MM/YYYY');
      commitDate(undefined);
      return;
    }

    if (minDate && parsed.isBefore(moment(minDate), 'day')) {
      setInputError(`La fecha debe ser igual o posterior a ${moment(minDate).format(DATE_FORMAT)}`);
      commitDate(undefined);
      return;
    }

    if (maxDate && parsed.isAfter(moment(maxDate), 'day')) {
      setInputError(`La fecha debe ser igual o anterior a ${moment(maxDate).format(DATE_FORMAT)}`);
      commitDate(undefined);
      return;
    }

    setInputError('');
    setCalendarMonth(parsed.toDate());
    commitDate(parsed.toDate());
  };

  const handleCalendarSelect = (newDate: Date | undefined) => {
    if (!newDate) return;
    setInputValue(moment(newDate).format(DATE_FORMAT));
    setInputError('');
    commitDate(newDate);
    setIsOpen(false);
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex gap-2">
        <Input
          id={id}
          name={name}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid || !!inputError}
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          className={cn(inputError && 'border-destructive')}
        />
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label="Abrir calendario">
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="end">
            <Calendar
              mode="single"
              selected={selectedDate}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              onSelect={handleCalendarSelect}
              fromDate={minDate}
              toDate={maxDate}
              locale={es}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
      {/* Region viva siempre montada: si se insertara recien al fallar, el lector de pantalla no la anuncia. */}
      <p aria-live="polite" className={cn('text-destructive text-sm font-medium', !inputError && 'sr-only')}>
        {inputError}
      </p>
    </div>
  );
}
