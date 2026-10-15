'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { UseFormReturn } from 'react-hook-form';
import type { OtherEquipmentFormData } from '../OtherEquipmentForm';
import { DateField } from './DateField';

interface CertificationSectionProps {
  form: UseFormReturn<OtherEquipmentFormData>;
  readOnly: boolean;
}

/** Certificación del equipo: el check y, si la posee, vencimiento y número (obligatorios). */
export function CertificationSection({ form, readOnly }: CertificationSectionProps) {
  const hasCertification = form.watch('has_certification');

  /**
   * Al destildar "Posee certificación" se limpian los datos dependientes: quedarian
   * ocultos en pantalla pero seguirian viajando en el submit, y el usuario no
   * tendria forma de darse cuenta.
   */
  const handleHasCertificationChange = (checked: boolean) => {
    form.setValue('has_certification', checked);
    if (!checked) {
      form.setValue('certification_expiration_date', null);
      form.setValue('certification_number', null);
      form.clearErrors(['certification_expiration_date', 'certification_number']);
    }
  };

  return (
    <>
      {/* ── Certificación ───────────────────────────────────────────────── */}
      <FormField
        control={form.control}
        name="has_certification"
        render={({ field }) => (
          <FormItem className="md:col-span-2 flex flex-row items-start gap-3 rounded-md border p-4">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => handleHasCertificationChange(checked === true)}
                disabled={readOnly}
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel className="cursor-pointer">Posee certificación</FormLabel>
              <FormDescription>
                Al marcarlo se cargan la fecha de vencimiento y el número de certificación
              </FormDescription>
            </div>
          </FormItem>
        )}
      />

      {/* Fecha de vencimiento de la certificación — solo si posee certificación */}
      {hasCertification && (
        <FormField
          control={form.control}
          name="certification_expiration_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de Vencimiento de la Certificación</FormLabel>
              <FormControl>
                <DateField value={field.value} onChange={field.onChange} readOnly={readOnly} />
              </FormControl>
              <FormDescription>Fecha en la que vence la certificación</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Número de certificación — solo si posee certificación */}
      {hasCertification && (
        <FormField
          control={form.control}
          name="certification_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de Certificación</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  disabled={readOnly}
                  placeholder="Ingrese el número de certificación"
                />
              </FormControl>
              <FormDescription>Número identificador de la certificación</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </>
  );
}
