import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tag } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from '../form-types';

type TypeServiceSectionProps = {
  form: UseFormReturn<DailyReportRowFormValues>;
  disabled?: boolean;
};

/**
 * Selector de tipo de servicio (mensual / adicional / adicional permanente).
 * Es obligatorio al crear una línea para evitar filas sin tipo, que descuadran
 * los reportes de servicios por cliente.
 */
export function TypeServiceSection({ form, disabled = false }: TypeServiceSectionProps) {
  return (
    <div className="space-y-4 rounded-lg dark:bg-slate-900 bg-slate-50 p-4 w-full">
      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Tag className="h-4 w-4" />
        Tipo de servicio
      </h4>
      <FormField
        control={form.control}
        name="type_service"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormControl>
              <RadioGroup
                onValueChange={field.onChange}
                value={field.value ?? ''}
                disabled={disabled}
                className="flex flex-col space-y-1"
              >
                <FormItem className="flex items-center space-x-3 space-y-0">
                  <FormControl>
                    <RadioGroupItem value="mensual" />
                  </FormControl>
                  <FormLabel className="font-normal">Mensual</FormLabel>
                </FormItem>
                <FormItem className="flex items-center space-x-3 space-y-0">
                  <FormControl>
                    <RadioGroupItem value="adicional" />
                  </FormControl>
                  <FormLabel className="font-normal">Adicional</FormLabel>
                </FormItem>
                <FormItem className="flex items-center space-x-3 space-y-0">
                  <FormControl>
                    <RadioGroupItem value="adicional_permanente" />
                  </FormControl>
                  <FormLabel className="font-normal">Adicional Permanente</FormLabel>
                </FormItem>
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
