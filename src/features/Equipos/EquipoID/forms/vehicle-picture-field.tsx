'use client';

import { Button } from '@/components/ui/button';
import { FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Upload, X } from 'lucide-react';
import { useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { VEHICLE_PICTURE_MAX_BYTES, type VehicleFormValues } from '../schemas/vehicle';

interface VehiclePictureFieldProps {
  form: UseFormReturn<VehicleFormValues>;
}

/**
 * Foto del equipo. Se guarda como data URL en el formulario (decisión de producto pendiente:
 * migrar a storage), por eso se valida acá —tipo imagen y tope de tamaño— antes de aceptarla.
 */
export function VehiclePictureField({ form }: VehiclePictureFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Permite volver a elegir el mismo archivo después de un rechazo
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('El archivo seleccionado no es una imagen');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = typeof e.target?.result === 'string' ? e.target.result : null;
      if (!result) return;
      if (result.length > VEHICLE_PICTURE_MAX_BYTES) {
        toast.error('La foto es demasiado pesada (máximo 1,5 MB). Elegí una más liviana.');
        return;
      }
      form.setValue('picture', result, { shouldDirty: true, shouldValidate: true });
    };
    reader.readAsDataURL(file);
  };

  return (
    <FormField
      control={form.control}
      name="picture"
      render={({ field }) => (
        <FormItem className="space-y-2">
          <FormLabel>Foto del equipo</FormLabel>
          <div className="flex items-center space-x-4">
            {field.value ? (
              <div className="relative">
                <img
                  src={field.value}
                  alt="Vista previa de la foto del equipo"
                  className="border-border size-24 rounded border-2 object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute -top-2 -right-2 size-6 rounded-full p-0"
                  aria-label="Quitar la foto"
                  onClick={() => form.setValue('picture', null, { shouldDirty: true, shouldValidate: true })}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <div className="border-border flex size-24 items-center justify-center rounded border-2 border-dashed">
                <Upload className="text-muted-foreground size-8" />
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              aria-label="Elegir la foto del equipo"
            />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              {field.value ? 'Cambiar foto' : 'Subir foto'}
            </Button>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
