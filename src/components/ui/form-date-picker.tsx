'use client';

import { useState } from 'react';
import type { Control, FieldPathByValue, FieldValues } from 'react-hook-form';

import { DatePicker, type DatePickerProps } from '@/components/ui/date-picker';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  DATE_FORMAT_GRANULARITY,
  fromPickerDate,
  toPickerDate,
  type DateEmptyValue,
  type DateFieldFormat,
  type DateFieldValue,
} from '@/shared/utils/date-adapters';

export type FormDatePickerProps<T extends FieldValues> = {
  control: Control<T>;
  /** RHF tipa que el campo guarde una fecha o un string. */
  name: FieldPathByValue<T, DateFieldValue>;
  /** Tipo de valor que el form guarda hoy (ver `date-adapters.ts`). Define también la granularidad. */
  format: DateFieldFormat;
  /** Lo que el campo guarda vacío. Por defecto, el vacío de hoy de cada formato (`DEFAULT_EMPTY_VALUE`). */
  emptyValue?: DateEmptyValue;
  label: string;
  description?: string;
  /** Solo el `*` visual: la obligatoriedad sigue en el schema Zod. */
  required?: boolean;
  className?: string;
} & Pick<DatePickerProps, 'min' | 'max' | 'isDateDisabled' | 'yearRange' | 'disabled' | 'placeholder'>;

/**
 * Campo de fecha de un form de RHF. El `DatePicker` trabaja con `Date | null` y el adaptador lo traduce al tipo
 * que el form ya guarda, así migrar un campo no cambia el payload. `FormControl` le pasa al input real el `id`,
 * `aria-invalid` y `aria-describedby`.
 */
export function FormDatePicker<T extends FieldValues>(props: FormDatePickerProps<T>) {
  const { control, name, format, emptyValue, label, description, required, className, ...pickerProps } = props;
  // `emptyValue={undefined}` explícito se respeta; sin la prop, se usa el vacío de hoy del formato.
  const emptyOptions = 'emptyValue' in props ? { emptyValue } : undefined;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {required ? (
              <span aria-hidden="true" className="text-danger-text">
                *
              </span>
            ) : null}
          </FormLabel>
          <FormControl>
            <ResettableDatePicker
              isTouched={fieldState.isTouched}
              {...pickerProps}
              ref={field.ref}
              name={field.name}
              granularity={DATE_FORMAT_GRANULARITY[format]}
              required={required}
              value={toPickerDate(field.value, format)}
              onChange={(date) => field.onChange(fromPickerDate(date, format, emptyOptions))}
              onBlur={field.onBlur}
              disabled={pickerProps.disabled ?? field.disabled}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * `touched` solo vuelve a `false` con `form.reset()` / `resetField()`: esa transición es la señal de reset que
 * `DatePicker` no puede deducir cuando el valor reseteado es el mismo que tenía (ajuste en render, sin efecto).
 */
function ResettableDatePicker({ isTouched, ...props }: DatePickerProps & { isTouched: boolean }) {
  const [prevTouched, setPrevTouched] = useState(isTouched);
  const [resetKey, setResetKey] = useState(0);
  if (isTouched !== prevTouched) {
    setPrevTouched(isTouched);
    if (!isTouched) setResetKey((key) => key + 1);
  }
  return <DatePicker {...props} resetKey={resetKey} />;
}
