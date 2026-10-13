'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PriceCurrencyInput } from '@/components/ui/price-currency-input';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { CalendarIcon, Check, ChevronsUpDown, Upload, X } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import { use, useMemo, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { VehicleFormData } from '../components/vehicle-tabs';
import {
  getModelsByBrand,
  getSubTypesByType,
  getTypesOfVehicles,
  getVehicleBrands,
  getVehicleOwnersType,
  getVehicleTypes,
} from '../lib/actions/vehicle-catalog-actions';
import { VEHICLE_TYPE_OF_VEHICLE_ID, getVehicleTypeFields } from '../lib/utils/vehicle-utils';

const logger = new Logger('VehicleBasicDataForm');

interface VehicleBasicDataFormProps {
  form: UseFormReturn<VehicleFormData>;
  readOnly?: boolean;
  brandsPromise: ReturnType<typeof getVehicleBrands>;
  modelsPromise: ReturnType<typeof getModelsByBrand>;

  typesPromise: ReturnType<typeof getVehicleTypes>;
  subTypesPromise: ReturnType<typeof getSubTypesByType>;
  typesOfVehiclesPromise: ReturnType<typeof getTypesOfVehicles>;
  ownersPromise: Promise<getVehicleOwnersType>;
}

export function VehicleBasicDataForm({
  form,
  readOnly = false,
  typesOfVehiclesPromise,
  brandsPromise,
  modelsPromise,
  subTypesPromise,
  typesPromise,
  ownersPromise,
  // hideInput
}: VehicleBasicDataFormProps) {
  const brands = use(brandsPromise);
  const modelsInitial = use(modelsPromise);
  const typesOfVehiclesAll = use(typesOfVehiclesPromise);
  // "Otros" (id 2) ya no se da de alta desde aca: los otros equipos (piletas, contenedores,
  // trailers, etc.) tienen su propia entidad y su propio form. Ofrecerlo dejaba el alta
  // trabada, porque el catalogo de tipos de este form solo trae los de `applies_to = 'vehicle'`.
  const typesOfVehicles = useMemo(
    () => typesOfVehiclesAll.filter((type) => type.id.toString() === VEHICLE_TYPE_OF_VEHICLE_ID),
    [typesOfVehiclesAll]
  );
  const [models, setModels] = useState<typeof modelsInitial>(modelsInitial);
  const [loadingModels, setLoadingModels] = useState(false);
  const ownersInitial = use(ownersPromise);
  const [owners, setOwners] = useState<typeof ownersInitial>(ownersInitial);

  const types = use(typesPromise);
  const subTypesInitial = use(subTypesPromise);
  const [subTypes, setSubTypes] = useState<typeof subTypesInitial>(subTypesInitial);

  const [loadingSubTypes, setLoadingSubTypes] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(form.getValues('picture') || null);
  const typeOfVehicle = form.watch('type_of_vehicle');
  const typeFields = getVehicleTypeFields(typeOfVehicle);
  const hideInput = form.watch('type_of_vehicle') === '1' ? true : false;
  const typeOfContract = form.watch('type_of_contract');
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

  const handleBrandChange = async (id: string) => {
    form.setValue('brand', id);
    form.setValue('model', null); // Reset model when brand changes

    const selectedBrand = brands.find((b) => b.id.toString() === id);
    if (selectedBrand) {
      setLoadingModels(true);
      try {
        const modelsData = await getModelsByBrand(selectedBrand.id);
        setModels(modelsData);
      } catch (error) {
        logger.error('Error al cargar modelos', { data: { error } });
      } finally {
        setLoadingModels(false);
      }
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreview(result);
        form.setValue('picture', result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    form.setValue('picture', null);
  };

  const handleTypeChange = async (typeId: string) => {
    form.setValue('type', typeId);
    form.setValue('subType', null); // Reset subtype when type changes

    const selectedType = types.find((t) => t.id === typeId);
    if (selectedType) {
      setLoadingSubTypes(true);
      try {
        const subTypesData = await getSubTypesByType(selectedType.id);
        setSubTypes(subTypesData);
      } catch (error) {
        logger.error('Error al cargar subtipos', { data: { error } });
      } finally {
        setLoadingSubTypes(false);
      }
    }
  };

  const handleTypeOfContractChange = (type: string) => {
    form.setValue('owner_id', null);

    if (type === 'Leasing' || type === 'Alquiler' || type === 'Prendado') {
      // Filtrar titulares que tengan el tipo de contrato seleccionado en su relación
      const filtered = ownersInitial.filter((owner) => {
        const contractTypes = owner.equipment_owner_contract_types;

        return contractTypes?.some((ct: { contract_type: string }) => {
          return ct.contract_type === type;
        });
      });

      setOwners(filtered);
    } else {
      // Si es "Propio", mostrar todos los titulares
      setOwners(ownersInitial);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 [&_button[role=combobox]]:w-full">
      {!readOnly && (
        <div className="space-y-2">
          <FormLabel>Foto del equipo</FormLabel>
          <div className="flex items-center space-x-4">
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-24 h-24 rounded object-cover border-2 border-gray-200"
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
              <div className="w-24 h-24 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
                <Upload className="h-8 w-8 text-gray-400" />
              </div>
            )}
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="equipment-upload" />
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById('equipment-upload')?.click()}
            >
              {imagePreview ? 'Cambiar foto' : 'Subir foto'}
            </Button>
          </div>
        </div>
      )}

      <FormField
        control={form.control}
        name="type_of_vehicle"
        render={({ field }) => (
          <FormItem className="flex flex-col  h-full">
            <FormLabel>
              Tipo de equipo <span className="text-red-500">*</span>
            </FormLabel>
            <Popover>
              <PopoverTrigger className="mt-2" asChild>
                <FormControl className="mt-2">
                  <Button
                    disabled={readOnly}
                    variant="outline"
                    role="combobox"
                    className={cn('justify-between mt-2', !field.value && 'text-muted-foreground')}
                  >
                    {typesOfVehicles.find((type) => type.id.toString() === field.value)?.name ||
                      'Seleccionar tipo de equipo'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar tipo de equipo..." />
                  <CommandList>
                    <CommandEmpty>No se encontró ningún resultado</CommandEmpty>
                    <CommandGroup>
                      {typesOfVehicles.map((type) => (
                        <CommandItem
                          key={type.id}
                          value={type?.name || ''}
                          onSelect={() => {
                            const typeId = type.id?.toString() || '';
                            form.setValue('type_of_vehicle', typeId);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              type.id.toString() === field.value ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {type.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormDescription className="mt-0">Selecciona el tipo de equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="domain"
        render={({ field }) => (
          <FormItem className={cn('flex flex-col h-full', !hideInput && 'hidden')}>
            <FormLabel>Dominio del equipo</FormLabel>
            <FormControl>
              <Input {...field} disabled={readOnly} placeholder="Ingrese el dominio del equipo" />
            </FormControl>
            <FormDescription>Ingrese el dominio del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="brand"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>
              Marca <span className="text-red-500">*</span>
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
                    {brands.find((brand) => brand.id.toString() === field.value)?.name || 'Seleccionar marca'}

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
                          value={brand?.name || ''}
                          onSelect={() => {
                            const brandId = brand.id?.toString() || '';
                            handleBrandChange(brandId);
                          }}
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
      <FormField
        control={form.control}
        name="model"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>
              Modelo <span className="text-red-500">*</span>
            </FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    disabled={readOnly || loadingModels || !form.getValues('brand')}
                    variant="outline"
                    role="combobox"
                    className={cn('justify-between', !field.value && 'text-muted-foreground')}
                  >
                    {loadingModels
                      ? 'Cargando...'
                      : models.find((model) => model.id.toString() === field.value)?.name || 'Seleccionar modelo'}

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
                          value={model?.name || ''}
                          onSelect={() => {
                            const modelId = model.id?.toString() || '';
                            form.setValue('model', modelId);
                          }}
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

      <FormField
        control={form.control}
        name="year"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>
              Año <span className="text-red-500">*</span>
            </FormLabel>
            <FormControl>
              <Input
                {...field}
                disabled={readOnly}
                placeholder="Año"
                type="number"
                min="1900"
                max={new Date().getFullYear()}
              />
            </FormControl>
            <FormDescription>Ingrese el año del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="engine"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Motor del equipo</FormLabel>
            <FormControl>
              <Input {...field} disabled={readOnly} placeholder="Ingrese el tipo de motor" />
            </FormControl>
            <FormDescription>Ingrese el tipo de motor del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="type"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Tipo {!typeFields.showSerie && <span className="text-red-500">*</span>}</FormLabel>
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
                        <CommandItem
                          key={type.id}
                          value={type?.name || ''}
                          onSelect={() => {
                            const typeId = type.id?.toString() || '';
                            handleTypeChange(typeId);
                          }}
                        >
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
            <FormDescription>Selecciona el tipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="subType"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Sub Tipo de Unidad {!typeFields.showSerie && <span className="text-red-500">*</span>}</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    disabled={readOnly || loadingSubTypes || !form.getValues('type')}
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
                          value={subType?.name || ''}
                          onSelect={() => {
                            const subTypeId = subType.id?.toString() || '';
                            form.setValue('subType', subTypeId);
                          }}
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
            <FormDescription>Selecciona el subtipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="chassis"
        render={({ field }) => (
          <FormItem className={cn('flex flex-col', !hideInput && 'hidden')}>
            <FormLabel>
              Chasis del equipo {typeFields.requireChassis && <span className="text-red-500">*</span>}
            </FormLabel>
            <FormControl>
              <Input {...field} disabled={readOnly} placeholder="Ingrese el chasis" />
            </FormControl>
            <FormDescription>Ingrese el chasis del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="serie"
        render={({ field }) => (
          <FormItem className={cn('flex flex-col', hideInput && 'hidden')}>
            <FormLabel>Serie del equipo {typeFields.requireSerie && <span className="text-red-500">*</span>}</FormLabel>
            <FormControl>
              <Input {...field} disabled={readOnly} placeholder="Ingrese la serie" />
            </FormControl>
            <FormDescription>Ingrese la serie del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {typeFields.showDomain && (
        <FormField
          control={form.control}
          name="domain"
          render={({ field }) => (
            <FormItem className={cn('flex flex-col', !hideInput && 'hidden')}>
              <FormLabel>
                Dominio del equipo {typeFields.requireDomain && <span className="text-red-500">*</span>}
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={readOnly}
                  placeholder="Ingrese el dominio"
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase();
                    field.onChange(value);
                  }}
                />
              </FormControl>
              <FormDescription>Ingrese el dominio del equipo</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {typeFields.showKilometer && (
        <FormField
          control={form.control}
          name="kilometer"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Kilometraje</FormLabel>
              <FormControl>
                <Input {...field} disabled={readOnly} placeholder="Kilometraje" type="number" min="0" />
              </FormControl>
              <FormDescription>Ingrese el kilometraje del equipo</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {typeFields.showEngineHours && (
        <FormField
          control={form.control}
          name="engine_hours"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Horómetro</FormLabel>
              <FormControl>
                <Input {...field} disabled={readOnly} placeholder="Ingrese las horas de motor" type="number" min="0" />
              </FormControl>
              <FormDescription>Ingrese las horas de motor del equipo</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="type_of_contract"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Tipo de Contrato</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    disabled={readOnly}
                    variant="outline"
                    role="combobox"
                    className={cn('justify-between', !field.value && 'text-muted-foreground')}
                  >
                    {field.value || 'Seleccionar tipo de contrato'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar tipo de contrato..." />
                  <CommandList>
                    <CommandEmpty>No se encontró ningún tipo de contrato</CommandEmpty>
                    <CommandGroup>
                      {['Leasing', 'Alquiler', 'Prendado', 'Propio'].map((type) => (
                        <CommandItem
                          key={type}
                          value={type}
                          onSelect={() => {
                            handleTypeOfContractChange(type);
                            form.setValue('type_of_contract', type);
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', type === field.value ? 'opacity-100' : 'opacity-0')} />
                          {type}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormDescription>Selecciona el tipo de contrato del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      {typeOfContract !== 'Propio' && (
        <FormField
          control={form.control}
          name="owner_id"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Propietario</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      disabled={readOnly}
                      variant="outline"
                      role="combobox"
                      className={cn('justify-between', !field.value && 'text-muted-foreground')}
                    >
                      {owners.find((owner) => owner.id.toString() === field.value)?.name || 'Seleccionar propietario'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Buscar propietario..." />
                    <CommandList>
                      <CommandEmpty>No se encontró ningún propietario</CommandEmpty>
                      <CommandGroup>
                        {owners.map((owner) => (
                          <CommandItem
                            key={owner.id}
                            value={owner?.name || ''}
                            onSelect={() => {
                              const ownerId = owner.id?.toString() || '';
                              form.setValue('owner_id', ownerId);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                owner.id.toString() === field.value ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            {owner.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <FormDescription>Selecciona el propietario del equipo</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {typeOfContract !== 'Propio' && typeOfContract && (
        <FormField
          control={form.control}
          name="contract_start_date"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Fecha de inicio del {typeOfContract}</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      disabled={readOnly}
                      variant={'outline'}
                      className={cn('pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}
                    >
                      {field.value ? (
                        moment(field.value).locale('es').format('LL')
                      ) : (
                        <span>Seleccionar fecha de inicio</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value ? new Date(field.value) : undefined}
                    onSelect={field.onChange}
                    disabled={(date) => {
                      const expDate = form.getValues('contract_expiration_date');
                      return expDate ? date > new Date(expDate) : false;
                    }}
                    captionLayout="dropdown"
                    fromYear={new Date().getFullYear() - 1}
                    toYear={new Date().getFullYear() + 10}
                  />
                </PopoverContent>
              </Popover>
              <FormDescription>Selecciona la fecha de inicio del {typeOfContract}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      {typeOfContract !== 'Propio' && typeOfContract && (
        <FormField
          control={form.control}
          name="contract_expiration_date"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Fecha de vencimiento del {typeOfContract}</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      disabled={readOnly}
                      variant={'outline'}
                      className={cn('pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}
                    >
                      {field.value ? (
                        moment(field.value).locale('es').format('LL')
                      ) : (
                        <span>Seleccionar fecha de vencimiento</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value ? new Date(field.value) : undefined}
                    onSelect={field.onChange}
                    disabled={(date) => {
                      const startDate = form.getValues('contract_start_date');
                      return startDate ? date < new Date(startDate) : false;
                    }}
                    captionLayout="dropdown"
                    fromYear={new Date().getFullYear() - 1}
                    toYear={new Date().getFullYear() + 10}
                  />
                </PopoverContent>
              </Popover>
              <FormDescription>Selecciona la fecha de vencimiento del {typeOfContract}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {typeOfContract !== 'Propio' && typeOfContract && (
        <FormField
          control={form.control}
          name="contract_number"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Número de Contrato</FormLabel>
              <FormControl>
                <Input {...field} disabled={readOnly} placeholder="Ingrese el número de contrato" />
              </FormControl>
              <FormDescription>Ingrese el número de contrato del equipo</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* ── Certificación (ticket 727, idem equipamientos) ────────────────── */}
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

      {hasCertification && (
        <FormField
          control={form.control}
          name="certification_expiration_date"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Fecha de Vencimiento de la Certificación</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  disabled={readOnly}
                  value={field.value ? moment(field.value).format('YYYY-MM-DD') : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    field.onChange(val ? moment(val, 'YYYY-MM-DD').toDate() : null);
                  }}
                />
              </FormControl>
              <FormDescription>Fecha en la que vence la certificación</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {hasCertification && (
        <FormField
          control={form.control}
          name="certification_number"
          render={({ field }) => (
            <FormItem className="flex flex-col">
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

      {/* Campos de precio y moneda */}
      <div className="grid grid-cols-1 gap-4">
        <FormField
          control={form.control}
          name="price"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Valor del equipo</FormLabel>
              <FormControl>
                <PriceCurrencyInput
                  price={field.value?.toString() || ''}
                  currency={form.watch('currency') || 'USD'}
                  onPriceChange={(price: string) => {
                    field.onChange(price ? parseFloat(price) : undefined);
                  }}
                  onCurrencyChange={(currency: string) => {
                    form.setValue('currency', currency as 'USD' | 'ARS');
                  }}
                  placeholder="0.00"
                  disabled={readOnly}
                />
              </FormControl>
              <FormDescription>Ingrese el valor del equipo</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="intern_number"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Número interno del equipo</FormLabel>
            <FormControl>
              <Input {...field} disabled={readOnly} placeholder="Ingrese el número interno" />
            </FormControl>
            <FormDescription>Ingrese el número interno del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
