'use client';

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { MIN_APPROVAL_DESCRIPTION_LENGTH } from '@/features/Mantenimiento/constants/approval';
import { useFormContext } from 'react-hook-form';

/**
 * Descripción obligatoria de lo que se aprueba.
 *
 * Se persiste en `maintenance_orders.description` y es lo que el taller lee en la
 * columna "Descripción" del paso 1, para saber qué hay que hacer sin tener que
 * abrir el detalle de la orden.
 */
export function ApprovalDescriptionField({ disabled }: { disabled: boolean }) {
  const { control, watch } = useFormContext<{ description: string }>();
  const length = watch('description').trim().length;

  return (
    <FormField
      control={control}
      name="description"
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            Descripción para el taller <span className="text-destructive">*</span>
          </FormLabel>
          <FormControl>
            <Textarea
              {...field}
              placeholder={`Describa qué se aprueba y qué hay que hacer (mínimo ${MIN_APPROVAL_DESCRIPTION_LENGTH} caracteres)`}
              rows={3}
              disabled={disabled}
            />
          </FormControl>
          <div className="flex items-start justify-between gap-2">
            <FormDescription>El taller usa este texto para planificar el trabajo.</FormDescription>
            {length < MIN_APPROVAL_DESCRIPTION_LENGTH && (
              <span className="text-muted-foreground text-sm tabular-nums">
                {length}/{MIN_APPROVAL_DESCRIPTION_LENGTH}
              </span>
            )}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
