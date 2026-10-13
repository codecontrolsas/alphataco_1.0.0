'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PriceCurrencyInput } from '@/components/ui/price-currency-input';
import { Textarea } from '@/components/ui/textarea';
import {
  getModelsByBrand,
  getSubTypesByType,
  getVehicleBrands,
  getVehicleOwners,
  getVehicleTypes,
} from '@/features/Equipos/EquipoID/lib/actions/vehicle-catalog-actions';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import moment from 'moment';
import { use, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { OtherEquipmentFormData } from './OtherEquipmentForm';

const logger = new Logger('OtherEquipmentBasicDataForm');

interface OtherEquipmentBasicDataFormProps {
  form: UseFormReturn<OtherEquipmentFormData>;
  readOnly?: boolean;
  brandsPromise: ReturnType<typeof getVehicleBrands>;
  modelsPromise: ReturnType<typeof getModelsByBrand>;
  typesPromise: ReturnType<typeof getVehicleTypes>;
  subTypesPromise: ReturnType<typeof getSubTypesByType>;
  ownersPromise: ReturnType<typeof getVehicleOwners>;
  vehiclesPromise: Promise<Array<{ id: string; domain: string | null }>>;
}

export function OtherEquipmentBasicDataForm({
  form,
  readOnly = false,
  brandsPromise,
  modelsPromise,
  typesPromise,
  subTypesPromise,
  ownersPromise,
  vehiclesPromise,
}: OtherEquipmentBasicDataFormProps) {
  const brands = use(brandsPromise);
  const modelsInitial = use(modelsPromise);
  const types = use(typesPromise);
  const subTypesInitial = use(subTypesPromise);
  const ownersInitial = use(ownersPromise);
  const vehicles = use(vehiclesPromise);

  const [models, setModels] = useState<typeof modelsInitial>(modelsInitial);
  const [subTypes, setSubTypes] = useState<typeof subTypesInitial>(subTypesInitial);
  const [owners, setOwners] = useState<typeof ownersInitial>(ownersInitial);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingSubTypes, setLoadingSubTypes] = useState(false);

  // Watch currency, tipo de contrato y certificacion
  const watchedCurrency = form.watch('currency');
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

  const handleTypeOfContractChange = (type: string) => {
    form.setValue('type_of_contract', type as OtherEquipmentFormData['type_of_contract']);
    form.setValue('owner_id', null);

    if (type === 'Leasing' || type === 'Alquiler' || type === 'Prendado') {
      const filtered = ownersInitial.filter((owner) =>
        owner.equipment_owner_contract_types?.some((ct: { contract_type: string }) => ct.contract_type === type)
      );
      setOwners(filtered);
    } else {
      setOwners(ownersInitial);
    }
  };

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
      } finally {
        setLoadingSubTypes(false);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 [&_button[role=combobox]]:w-full">
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
                max={new Date().getFullYear()}
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

      {/* N° de Factura */}
      <FormField
        control={form.control}
        name="invoice_number"
        render={({ field }) => (
          <FormItem>
            <FormLabel>N° de Factura</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                disabled={readOnly}
                placeholder="Ingrese el número de factura"
              />
            </FormControl>
            <FormDescription>Número de factura de compra</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Valor inicial */}
      <FormField
        control={form.control}
        name="initial_value"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Valor Inicial</FormLabel>
            <FormControl>
              <PriceCurrencyInput
                price={field.value?.toString() ?? ''}
                currency={watchedCurrency ?? 'ARS'}
                onPriceChange={(price) => {
                  field.onChange(price ? parseFloat(price) : null);
                }}
                onCurrencyChange={(currency) => {
                  form.setValue('currency', currency as OtherEquipmentFormData['currency']);
                }}
                placeholder="0.00"
                disabled={readOnly}
              />
            </FormControl>
            <FormDescription>Valor de adquisición del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Fecha de compra */}
      <FormField
        control={form.control}
        name="purchase_date"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Fecha de Compra</FormLabel>
            <FormControl>
              <Input
                type="date"
                disabled={readOnly}
                max={moment().format('YYYY-MM-DD')}
                value={field.value ? moment(field.value).format('YYYY-MM-DD') : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  field.onChange(val ? moment(val, 'YYYY-MM-DD').toDate() : null);
                }}
              />
            </FormControl>
            <FormDescription>Fecha de adquisición del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Tipo de Contrato */}
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
                  <CommandInput placeholder="Buscar tipo..." />
                  <CommandList>
                    <CommandEmpty>No se encontró</CommandEmpty>
                    <CommandGroup>
                      {['Leasing', 'Alquiler', 'Prendado', 'Propio'].map((type) => (
                        <CommandItem key={type} value={type} onSelect={() => handleTypeOfContractChange(type)}>
                          <Check className={cn('mr-2 h-4 w-4', type === field.value ? 'opacity-100' : 'opacity-0')} />
                          {type}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormDescription>Tipo de contrato del equipo</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Propietario — solo visible si tipo de contrato NO es "Propio" */}
      {typeOfContract && typeOfContract !== 'Propio' && (
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
                      {owners.find((o) => o.id.toString() === field.value)?.name || 'Seleccionar propietario'}
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
                            value={owner.name || ''}
                            onSelect={() => form.setValue('owner_id', owner.id.toString())}
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
              <FormDescription>Propietario del equipo según tipo de contrato</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Fecha de inicio del contrato — solo si NO es "Propio" y hay tipo seleccionado */}
      {typeOfContract && typeOfContract !== 'Propio' && (
        <FormField
          control={form.control}
          name="contract_start_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de Inicio del Contrato</FormLabel>
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
              <FormDescription>Fecha de inicio del contrato</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Fecha de vencimiento del contrato */}
      {typeOfContract && typeOfContract !== 'Propio' && (
        <FormField
          control={form.control}
          name="contract_expiration_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de Vencimiento del Contrato</FormLabel>
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
              <FormDescription>Fecha de vencimiento del contrato</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Número de Contrato */}
      {typeOfContract && typeOfContract !== 'Propio' && (
        <FormField
          control={form.control}
          name="contract_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de Contrato</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  disabled={readOnly}
                  placeholder="Ingrese el número de contrato"
                />
              </FormControl>
              <FormDescription>Número identificador del contrato</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* ── Certificación ───────────────────────────────────────────────── */}
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

      {/* Fecha de vencimiento de la certificación — solo si posee certificación */}
      {hasCertification && (
        <FormField
          control={form.control}
          name="certification_expiration_date"
          render={({ field }) => (
            <FormItem>
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

      {/* Número de certificación — solo si posee certificación */}
      {hasCertification && (
        <FormField
          control={form.control}
          name="certification_number"
          render={({ field }) => (
            <FormItem>
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

      {/* Vehículo vinculado */}
      <FormField
        control={form.control}
        name="linked_vehicle_id"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Vehículo Vinculado</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    disabled={readOnly}
                    variant="outline"
                    role="combobox"
                    className={cn('justify-between', !field.value && 'text-muted-foreground')}
                  >
                    {vehicles.find((v) => v.id === field.value)?.domain || 'Vincular a un vehículo (opcional)'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar por dominio..." />
                  <CommandList>
                    <CommandEmpty>No se encontraron vehículos</CommandEmpty>
                    <CommandGroup>
                      {/* Opción para desvincular */}
                      <CommandItem value="ninguno" onSelect={() => form.setValue('linked_vehicle_id', null)}>
                        <Check className={cn('mr-2 h-4 w-4', !field.value ? 'opacity-100' : 'opacity-0')} />
                        Sin vincular
                      </CommandItem>
                      {vehicles.map((vehicle) => (
                        <CommandItem
                          key={vehicle.id}
                          value={vehicle.domain || ''}
                          onSelect={() => form.setValue('linked_vehicle_id', vehicle.id)}
                        >
                          <Check
                            className={cn('mr-2 h-4 w-4', vehicle.id === field.value ? 'opacity-100' : 'opacity-0')}
                          />
                          {vehicle.domain}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormDescription>Vincula este equipo a un vehículo (opcional)</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
