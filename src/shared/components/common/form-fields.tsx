'use client';

import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import moment from 'moment';
import type { ComponentProps, ReactNode } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

type FieldBase<T extends FieldValues, N extends FieldPath<T>> = {
  control: Control<T>;
  name: N;
  label: ReactNode;
  /** Clases del contenedor del campo (por ejemplo, para ocupar dos columnas de la grilla). */
  itemClassName?: string;
};

type InputControlProps = Omit<
  ComponentProps<typeof Input>,
  'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'ref'
>;
type TextareaControlProps = Omit<
  ComponentProps<typeof Textarea>,
  'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'ref'
>;

/** Campo de formulario de una línea: etiqueta, `Input` conectado a react-hook-form y mensaje de error. */
export function InputFormField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  itemClassName,
  ...inputProps
}: FieldBase<T, N> & InputControlProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={itemClassName}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...inputProps} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Igual que `InputFormField`, con `Textarea`. */
export function TextareaFormField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  itemClassName,
  ...textareaProps
}: FieldBase<T, N> & TextareaControlProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={itemClassName}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea {...textareaProps} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Campo de fecha (`YYYY-MM-DD` como texto en el formulario) con escritura directa y calendario.
 * `description` es un texto de ayuda debajo del selector.
 */
export function DateFormField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  itemClassName,
  description,
  placeholder = 'DD/MM/AAAA',
  minDate,
  maxDate,
}: FieldBase<T, N> & {
  description?: ReactNode;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={itemClassName}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <EnhancedDatePicker
              date={field.value ? moment(field.value, 'YYYY-MM-DD').toDate() : undefined}
              setDate={(d) => field.onChange(d ? moment(d).format('YYYY-MM-DD') : '')}
              placeholder={placeholder}
              minDate={minDate}
              maxDate={maxDate}
            />
          </FormControl>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
