import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from '../form-types';

type StatusSectionProps = {
  form: UseFormReturn<DailyReportRowFormValues>;
  isCreating: boolean;
  currentStatus?: string;
  disabled?: boolean;
};

// Orden jerárquico de estados (de menor a mayor)
const statusOptions = [
  { value: 'sin_recursos_asignados', label: 'Sin recursos asignados', order: 1 },
  { value: 'pendiente', label: 'Pendiente', order: 2 },
  { value: 'ejecutado', label: 'Ejecutado', order: 3 },
  { value: 'en_certificacion', label: 'En certificación', order: 4 },
];

export function StatusSection({ form, isCreating, currentStatus, disabled }: StatusSectionProps) {
  const statusWatch = form.watch('status');

  // Deshabilitar el campo de estado si está en "sin_recursos_asignados"
  const isStatusDisabled = disabled || statusWatch === 'sin_recursos_asignados';

  // En modo creación, el estado es fijo "en_certificacion"
  if (isCreating) {
    return (
      <div className="space-y-4 rounded-lg dark:bg-slate-900 bg-slate-50 p-4 w-full">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Estado y Remito
        </h4>
        <div className="grid grid-cols-1 gap-4 w-full">
          {/* Estado fijo en creación */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Estado</label>
            <div className="px-3 py-2 bg-cert-subtle text-cert-subtle-foreground border rounded-md text-sm">
              En certificación (Estado inicial)
            </div>
          </div>

          {/* Número de remito - Opcional */}
          <FormField
            control={form.control}
            name="remit_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de Remito</FormLabel>
                <FormControl>
                  <Input placeholder="Ingrese el número de remito (opcional)" disabled={disabled} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    );
  }

  // En modo edición, mostrar selector de estado
  return (
    <div className="space-y-4 rounded-lg dark:bg-slate-900 bg-slate-50 p-4 w-full">
      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Settings className="h-4 w-4" />
        Estado y Remito
      </h4>
      <div className="grid grid-cols-1 gap-4 w-full">
        {/* Estado */}
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => {
            // Obtener el orden del estado actual
            const currentStatusOrder = statusOptions.find((s) => s.value === currentStatus)?.order || 0;

            // Filtrar solo estados superiores o iguales al actual
            const availableOptions = statusOptions.filter((option) => option.order >= currentStatusOrder);

            return (
              <FormItem>
                <FormLabel>Estado</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isStatusDisabled}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione un estado" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {availableOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {statusWatch === 'sin_recursos_asignados' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    El estado cambiará automáticamente a Pendiente cuando asigne recursos
                  </p>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {/* Número de remito - Solo si el estado es "en_certificacion" - Opcional */}
        {statusWatch === 'en_certificacion' && (
          <FormField
            control={form.control}
            name="remit_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de Remito</FormLabel>
                <FormControl>
                  <Input placeholder="Ingrese el número de remito (opcional)" disabled={disabled} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
    </div>
  );
}
