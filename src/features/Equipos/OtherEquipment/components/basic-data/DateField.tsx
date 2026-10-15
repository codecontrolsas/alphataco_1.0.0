'use client';

import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Input } from '@/components/ui/input';
import moment from 'moment';

interface DateFieldProps {
  value: Date | null | undefined;
  onChange: (value: Date | null) => void;
  readOnly?: boolean;
  /** Fecha máxima seleccionable/escribible. */
  maxDate?: Date;
  /** Lo inyecta `FormControl` (enlaza la descripción y el error del campo). */
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/**
 * Fecha individual con escritura directa (DD/MM/YYYY) o calendario. En solo lectura muestra el
 * valor formateado en un input deshabilitado.
 */
export function DateField({ value, onChange, readOnly = false, maxDate, ...aria }: DateFieldProps) {
  if (readOnly) {
    return <Input disabled value={value ? moment(value).format('DD/MM/YYYY') : ''} {...aria} />;
  }
  return (
    <EnhancedDatePicker
      date={value ?? undefined}
      setDate={(date) => onChange(date ?? null)}
      maxDate={maxDate}
      {...aria}
    />
  );
}
