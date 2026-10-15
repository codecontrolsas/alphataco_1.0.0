'use client';

import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { argentinaDate } from '@/shared/lib/argentina-time';
import moment from 'moment';
import { type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export const terminationSchema = z.object({
  reason_for_termination: z
    .string({ required_error: 'El motivo de baja es requerido.' })
    .min(1, 'El motivo de baja es requerido.'),
  termination_date: z
    .date({ required_error: 'La fecha de baja es requerida.' })
    // El día elegido (en local, tal como lo ve el usuario) no puede ser posterior al "hoy" argentino.
    .refine((date) => moment(date).format('YYYY-MM-DD') <= argentinaDate(), 'La fecha de baja no puede ser futura.'),
});

export type TerminationFormValues = z.infer<typeof terminationSchema>;

export const TERMINATION_REASONS = [
  'Despido sin causa',
  'Renuncia',
  'Despido con causa',
  'Acuerdo de partes',
  'Fin de contrato',
  'Fallecimiento',
] as const;

interface TerminationFormFieldsProps {
  form: UseFormReturn<TerminationFormValues>;
}

export function TerminationFormFields({ form }: TerminationFormFieldsProps) {
  // Tope: el "hoy" argentino como medianoche local (el picker compara por día).
  const maxDate = moment(argentinaDate(), 'YYYY-MM-DD').toDate();

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="reason_for_termination"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Motivo de baja</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná el motivo" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {TERMINATION_REASONS.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {reason}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>Elegí el motivo por el que se da de baja.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="termination_date"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Fecha de baja</FormLabel>
            <FormControl>
              <EnhancedDatePicker date={field.value} setDate={field.onChange} maxDate={maxDate} />
            </FormControl>
            <FormDescription>Fecha en la que se dio de baja (DD/MM/AAAA).</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
