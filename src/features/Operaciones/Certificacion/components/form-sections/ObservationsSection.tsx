import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from '../form-types';

type ObservationsSectionProps = {
  form: UseFormReturn<DailyReportRowFormValues>;
  disabled?: boolean;
};

export function ObservationsSection({ form, disabled }: ObservationsSectionProps) {
  return (
    <div className="space-y-4 rounded-lg dark:bg-slate-900 bg-slate-50 p-4 w-full">
      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        Observaciones
      </h4>
      <FormField
        control={form.control}
        name="observations"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Observaciones</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Ingrese observaciones adicionales..."
                className="min-h-[100px] resize-none"
                disabled={disabled}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
