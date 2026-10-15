'use client';

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { DiagramFormValues } from '@/features/Employees/Diagrams/schemas/diagram-form-schema';
import type { Control } from 'react-hook-form';

/** Comentario general de la carga y el interruptor para personalizarlo por día. */
export function DiagramCommentFields({
  control,
  customizeComments,
}: {
  control: Control<DiagramFormValues>;
  customizeComments: boolean;
}) {
  return (
    <div className="flex flex-col space-y-3">
      <FormField
        control={control}
        name="comments"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Comentarios (opcional)</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Ej: certificado médico presentado"
                className="min-h-20"
                {...field}
                value={field.value ?? ''}
              />
            </FormControl>
            <FormDescription>Se guarda en todos los días del rango, salvo los que personalices.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="customize_comments"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-2 space-y-0">
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel className="cursor-pointer font-normal">Personalizar comentario por día</FormLabel>
          </FormItem>
        )}
      />
      {customizeComments && (
        <p className="text-muted-foreground text-xs">
          Cada día quedó con el comentario general y podés cambiar solo los que necesites, en la columna “Comentario” de
          la derecha.
        </p>
      )}
    </div>
  );
}
