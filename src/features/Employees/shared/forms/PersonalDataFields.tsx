'use client';

import type React from 'react';

import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { Upload, X } from 'lucide-react';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { toast } from 'sonner';
import { getAllCountryOptions } from '../../EmpleadoID/actions.server';
import type { PersonalDataValues } from '../schemas/person-data-schemas';

/** Lado mayor (px) al que se reduce la foto antes de guardarla. */
const MAX_PICTURE_SIDE = 640;

interface PersonalDataFieldsProps {
  /** Oculta el bloque de foto (el candidato no la carga). */
  hidePicture?: boolean;
  /** Foto ya guardada (solo para mostrarla): no es un valor del form, así que una foto vieja no se revalida al guardar. */
  currentPicture?: string | null;
}

/**
 * Campos de datos personales de una persona. Los consume tanto el legajo de empleado
 * como el candidato: toma el form del contexto (`<Form {...form}>` de shadcn ya es un
 * FormProvider), asi que ambos formularios comparten estos campos sin duplicar JSX.
 */
export function PersonalDataFields({ hidePicture = false, currentPicture = null }: PersonalDataFieldsProps) {
  const form = useFormContext<PersonalDataValues>();
  const [imagePreview, setImagePreview] = useState<string | null>(form.getValues('picture') || currentPicture || null);
  const pictureError = form.formState.errors.picture?.message;

  const { data: countries = [], isLoading: loadingCountries } = useQuery({
    queryKey: ['catalog', 'countries'],
    queryFn: () => getAllCountryOptions(),
    staleTime: 10 * 60 * 1000,
  });

  /**
   * Lee la imagen elegida, la reduce (lado mayor 640 px) y la guarda como JPEG: una foto de celular de varios MB
   * superaría el tope del schema (1,5 M caracteres) y, además, no hace falta esa resolución para un avatar.
   */
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error('La foto debe ser PNG, JPG o WEBP.');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_PICTURE_SIDE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        toast.error('No se pudo procesar la foto.');
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(objectUrl);
      setImagePreview(result);
      form.setValue('picture', result, { shouldDirty: true, shouldValidate: true });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      toast.error('No se pudo leer la foto.');
    };
    image.src = objectUrl;
  };

  const removeImage = () => {
    setImagePreview(null);
    form.setValue('picture', '', { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div className="space-y-6">
      {/* Foto del empleado */}
      {!hidePicture && (
        <div className="space-y-2">
          <FormLabel>Foto del empleado</FormLabel>
          <div className="flex items-center space-x-4">
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview || '/placeholder.svg'}
                  alt="Preview"
                  className="w-24 h-24 rounded-full object-cover border-2 border-border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                  onClick={removeImage}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="w-24 h-24 rounded-full  border-2 border-dashed border-input flex items-center justify-center">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="picture-upload" />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('picture-upload')?.click()}
              >
                {imagePreview ? 'Cambiar foto' : 'Subir foto'}
              </Button>
            </div>
          </div>
          {pictureError && (
            <p role="alert" className="text-destructive text-sm">
              {pictureError}. Quitá la foto o elegí otra.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 [&_button[role=combobox]]:w-full">
        {/* Nombre */}
        <FormField
          control={form.control}
          name="firstname"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre *</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Ingrese el nombre" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Apellido */}
        <FormField
          control={form.control}
          name="lastname"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Apellido *</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Ingrese el apellido" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tipo de documento */}
        <FormField
          control={form.control}
          name="document_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de documento *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione tipo de documento" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="DNI">DNI</SelectItem>
                  <SelectItem value="LC">LC</SelectItem>
                  <SelectItem value="LE">LE</SelectItem>
                  <SelectItem value="CI">CI</SelectItem>
                  <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Número de documento */}
        <FormField
          control={form.control}
          name="document_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de documento *</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Ingrese el número" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* CUIL */}
        <FormField
          control={form.control}
          name="cuil"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CUIL *</FormLabel>
              <FormControl>
                <Input {...field} placeholder="XX-XXXXXXXX-X" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Fecha de nacimiento */}
        <FormField
          control={form.control}
          name="born_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de nacimiento *</FormLabel>
              <FormControl>
                <Input {...field} type="date" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Nacionalidad */}
        <FormField
          control={form.control}
          name="nationality"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nacionalidad *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione la nacionalidad" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Argentina">Argentina</SelectItem>
                  <SelectItem value="Extranjero">Extranjero</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* País de nacimiento */}
        <FormField
          control={form.control}
          name="birthplace"
          render={({ field }) => (
            <FormItem>
              <FormLabel>País de nacimiento *</FormLabel>
              {loadingCountries ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione país de nacimiento" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {countries.map((country) => (
                      <SelectItem key={country.id} value={country.id}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Sexo */}
        <FormField
          control={form.control}
          name="gender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sexo *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione el sexo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Masculino">Masculino</SelectItem>
                  <SelectItem value="Femenino">Femenino</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Estado civil */}
        <FormField
          control={form.control}
          name="marital_status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado civil *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione estado civil" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Soltero">Soltero/a</SelectItem>
                  <SelectItem value="Casado">Casado/a</SelectItem>
                  <SelectItem value="Divorciado">Divorciado/a</SelectItem>
                  <SelectItem value="Viudo">Viudo/a</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Nivel de instrucción */}
        <FormField
          control={form.control}
          name="level_of_education"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nivel de instrucción *</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione nivel de instrucción" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Primario">Primario</SelectItem>
                  <SelectItem value="Secundario">Secundario</SelectItem>
                  <SelectItem value="Terciario">Terciario</SelectItem>
                  <SelectItem value="Universitario">Universitario</SelectItem>
                  <SelectItem value="PosGrado">Posgrado</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
