import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { InputFormField } from '@/shared/components/common/form-fields';
import { CalendarIcon } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import type { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from '../form-types';

type DateTimeSectionProps = {
  form: UseFormReturn<DailyReportRowFormValues>;
  isCreating: boolean;
  disabled?: boolean;
};

const workingDayOptions = [
  { label: 'Jornada 8 horas', value: 'jornada 8 horas' },
  { label: 'Jornada 12 horas', value: 'jornada 12 horas' },
  { label: 'Jornada 24 horas', value: 'jornada 24 horas' },
  { label: 'Por horario', value: 'por horario' },
];

export function DateTimeSection({ form, isCreating, disabled }: DateTimeSectionProps) {
  const workingDayWatch = form.watch('working_day');

  return (
    <div className="space-y-4 rounded-lg dark:bg-slate-900 bg-slate-50 p-4 w-full">
      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <CalendarIcon className="h-4 w-4" />
        Fechas y Horarios
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {/* Campo de Fecha - Solo visible en modo creación */}
        {isCreating && (
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Fecha del Parte Diario *</FormLabel>
                <FormControl>
                  <EnhancedDatePicker
                    date={field.value}
                    setDate={field.onChange}
                    maxDate={moment().subtract(1, 'day').startOf('day').toDate()}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Tipo de jornada */}
        <FormField
          control={form.control}
          name="working_day"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Jornada</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex flex-col space-y-1"
                  disabled={disabled}
                >
                  {workingDayOptions.map((option) => (
                    <FormItem key={option.value} className="flex items-center space-x-3 space-y-0">
                      <FormControl>
                        <RadioGroupItem value={option.value} disabled={disabled} />
                      </FormControl>
                      <FormLabel className="font-normal">{option.label}</FormLabel>
                    </FormItem>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Horas - Solo si es "por horario" */}
        {workingDayWatch === 'por horario' && (
          <div className="flex flex-col gap-4">
            <InputFormField
              control={form.control}
              name="start_time"
              label="Hora de inicio"
              type="time"
              disabled={disabled}
            />
            <InputFormField
              control={form.control}
              name="end_time"
              label="Hora de fin"
              type="time"
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </div>
  );
}
