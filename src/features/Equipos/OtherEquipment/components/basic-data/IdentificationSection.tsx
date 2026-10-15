'use client';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import {
  getModelsByBrand,
  getSubTypesByType,
  getVehicleBrands,
  getVehicleTypes,
} from '@/features/Equipos/EquipoID/lib/actions/vehicle-catalog-actions';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { Check, ChevronsUpDown } from 'lucide-react';
import { use, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { OtherEquipmentFormData } from '../OtherEquipmentForm';

const logger = new Logger('OtherEquipmentIdentificationSection');

interface IdentificationSectionProps {
  form: UseFormReturn<OtherEquipmentFormData>;
  readOnly: boolean;
  brandsPromise: ReturnType<typeof getVehicleBrands>;
  modelsPromise: ReturnType<typeof getModelsByBrand>;
  typesPromise: ReturnType<typeof getVehicleTypes>;
  subTypesPromise: ReturnType<typeof getSubTypesByType>;
}

/** Qué es el equipo y cómo se identifica: tipo, subtipo, marca, modelo, series, año, horómetro, placa y composición. */
export function IdentificationSection({
  form,
  readOnly,
  brandsPromise,
  modelsPromise,
  typesPromise,
  subTypesPromise,
}: IdentificationSectionProps) {
  const brands = use(brandsPromise);
  const modelsInitial = use(modelsPromise);
  const types = use(typesPromise);
  const subTypesInitial = use(subTypesPromise);

  const [models, setModels] = useState<typeof modelsInitial>(modelsInitial);
  const [subTypes, setSubTypes] = useState<typeof subTypesInitial>(subTypesInitial);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingSubTypes, setLoadingSubTypes] = useState(false);

  // Año máximo en hora argentina (el navegador puede estar en otra zona)
  const currentYear = Number(argentinaDate().slice(0, 4));

  const handleBrandChange = async (brandId: string) => {
    form.setValue('brand_id', brandId);
    form.setValue('model_id', null);

    const selectedBrand = brands.find((b) => b.id.toString() === brandId);
    if (selectedBrand) {
      setLoadingModels(true);
      try {
        const modelsData = await getModelsByBrand(selectedBrand.id);
        setModels(modelsData);
      } catch (error) {
        logger.error('Error al cargar modelos por marca', { data: { error } });
        toast.error('No se pudieron cargar los modelos de la marca');
      } finally {
        setLoadingModels(false);
      }
    }
  };

  const handleTypeChange = async (typeId: string) => {
    form.setValue('type_id', typeId);
    form.setValue('sub_type_id', null);

    const selectedType = types.find((t) => t.id === typeId);
    if (selectedType) {
      setLoadingSubTypes(true);
      try {
        const subTypesData = await getSubTypesByType(selectedType.id);
        setSubTypes(subTypesData);
      } catch (error) {
        logger.error('Error al cargar subtipos por tipo', { data: { error } });
        toast.error('No se pudieron cargar los subtipos del tipo');
      } finally {
        setLoadingSubTypes(false);
      }
    }
  };

  return (
    <>
      {/* Tipo */}
      <FormField
        control={form.control}
        name="type_id"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>
              Tipo <span className="text-red-500">*</span>
            </FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    disabled={readOnly}
                    variant="outline"
                    role="combobox"
                    className={cn('justify-between', !field.value && 'text-muted-foreground')}
                  >
                    {types.find((t) => t.id === field.value)?.name || 'Seleccionar tipo'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar tipo..." />
                  <CommandList>
                    <CommandEmpty>No se encontró el tipo</CommandEmpty>
                    <CommandGroup>
                      {types.map((type) => (
                        <CommandItem key={type.id} value={type.name || ''} onSelect={() => handleTypeChange(type.id)}>
                          <Check
                            className={cn('mr-2 h-4 w-4', type.id === field.value ? 'opacity-100' : 'opacity-0')}
                          />
                          {type.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormDescription>Selecciona el tipo del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Sub Tipo */}
      <FormField
        control={form.control}
        name="sub_type_id"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Sub Tipo</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    disabled={readOnly || loadingSubTypes || !form.getValues('type_id')}
                    variant="outline"
                    role="combobox"
                    className={cn('justify-between', !field.value && 'text-muted-foreground')}
                  >
                    {loadingSubTypes
                      ? 'Cargando...'
                      : subTypes.find((s) => s.id === field.value)?.name || 'Seleccionar subtipo'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar subtipo..." />
                  <CommandList>
                    <CommandEmpty>No se encontró el subtipo</CommandEmpty>
                    <CommandGroup>
                      {subTypes.map((subType) => (
                        <CommandItem
                          key={subType.id}
                          value={subType.name || ''}
                          onSelect={() => form.setValue('sub_type_id', subType.id)}
                        >
                          <Check
                            className={cn('mr-2 h-4 w-4', subType.id === field.value ? 'opacity-100' : 'opacity-0')}
                          />
                          {subType.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormDescription>Selecciona el subtipo del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Marca */}
      <FormField
        control={form.control}
        name="brand_id"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Marca</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    disabled={readOnly}
                    variant="outline"
                    role="combobox"
                    className={cn('justify-between', !field.value && 'text-muted-foreground')}
                  >
                    {brands.find((b) => b.id.toString() === field.value)?.name || 'Seleccionar marca'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0 overflow-y-auto">
                <Command>
                  <CommandInput placeholder="Buscar marca..." />
                  <CommandList>
                    <CommandEmpty>Marca no encontrada</CommandEmpty>
                    <CommandGroup>
                      {brands.map((brand) => (
                        <CommandItem
                          key={brand.id}
                          value={brand.name || ''}
                          onSelect={() => handleBrandChange(brand.id.toString())}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              brand.id.toString() === field.value ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {brand.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormDescription>Selecciona la marca del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Modelo */}
      <FormField
        control={form.control}
        name="model_id"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Modelo</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    disabled={readOnly || loadingModels || !form.getValues('brand_id')}
                    variant="outline"
                    role="combobox"
                    className={cn('justify-between', !field.value && 'text-muted-foreground')}
                  >
                    {loadingModels
                      ? 'Cargando...'
                      : models.find((m) => m.id.toString() === field.value)?.name || 'Seleccionar modelo'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar modelo..." />
                  <CommandList>
                    <CommandEmpty>Modelo no encontrado</CommandEmpty>
                    <CommandGroup>
                      {models.map((model) => (
                        <CommandItem
                          key={model.id}
                          value={model.name || ''}
                          onSelect={() => form.setValue('model_id', model.id.toString())}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              model.id.toString() === field.value ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {model.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormDescription>Selecciona el modelo del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* N° de Serie */}
      <FormField
        control={form.control}
        name="serial_number"
        render={({ field }) => (
          <FormItem>
            <FormLabel>N° de Serie</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                disabled={readOnly}
                placeholder="Ingrese el número de serie"
              />
            </FormControl>
            <FormDescription>Número de serie del fabricante</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* N° Interno */}
      <FormField
        control={form.control}
        name="intern_number"
        render={({ field }) => (
          <FormItem>
            <FormLabel>N° Interno</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} disabled={readOnly} placeholder="Ingrese el número interno" />
            </FormControl>
            <FormDescription>Número de identificación interno</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Año */}
      <FormField
        control={form.control}
        name="year"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Año</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                disabled={readOnly}
                placeholder="Ej: 2022"
                type="number"
                min="1900"
                max={currentYear}
              />
            </FormControl>
            <FormDescription>Año de fabricación</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Horómetro */}
      <FormField
        control={form.control}
        name="horometer"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Horómetro</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                disabled={readOnly}
                placeholder="Horas de uso"
                type="number"
                min="0"
              />
            </FormControl>
            <FormDescription>Horas de trabajo acumuladas</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Placa del fabricante */}
      <FormField
        control={form.control}
        name="manufacturer_plate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Placa del Fabricante</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                disabled={readOnly}
                placeholder="Ingrese la placa del fabricante"
              />
            </FormControl>
            <FormDescription>Identificador de placa del fabricante</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Composición (span 2 columnas) */}
      <FormField
        control={form.control}
        name="composition"
        render={({ field }) => (
          <FormItem className="md:col-span-2">
            <FormLabel>Composición</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                value={field.value ?? ''}
                disabled={readOnly}
                placeholder="Describe la composición o características del equipo"
                rows={3}
              />
            </FormControl>
            <FormDescription>Descripción de materiales o componentes del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
