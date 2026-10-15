'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchCitiesByProvinceId, fetchProvinces } from '@/features/Employees/EmpleadoID/lib/actions/catalog-actions';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createWorkshop, updateWorkshop } from '../../../actions/workshops.server';
import { useTalleresStore } from './store/talleres.store';

const LOOKUP_STALE_TIME = 5 * 60 * 1000;

const TalleresSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: 'Debe ingresar el nombre del taller' }),
  type: z.enum(['interno', 'externo'], { required_error: 'Debe seleccionar el tipo de taller' }),
  address: z.string().optional().nullable(),
  province: z.number().optional().nullable(),
  city: z.number().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  provider_name: z.string().optional().nullable(),
  provider_phone: z.string().optional().nullable(),
  provider_email: z.string().email({ message: 'Email inválido' }).optional().nullable().or(z.literal('')),
  is_active: z.boolean().optional(),
});

type TalleresFormValues = z.infer<typeof TalleresSchema>;

function TalleresForm() {
  const editingWorkshop = useTalleresStore((state) => state.workshop);
  const setWorkshop = useTalleresStore((state) => state.setWorkshop);
  const router = useRouter();
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();

  const [isEditing, setIsEditing] = useState(!!editingWorkshop);

  const form = useForm<TalleresFormValues>({
    resolver: zodResolver(TalleresSchema),
    defaultValues: {
      name: '',
      type: 'interno',
      address: '',
      province: null,
      city: null,
      latitude: null,
      longitude: null,
      provider_name: '',
      provider_phone: '',
      provider_email: '',
      is_active: true,
    },
  });

  const { reset, watch, setValue } = form;
  const workshopType = watch('type');
  const selectedProvince = watch('province');

  // Provincias y ciudades en caché: abrir el Sheet varias veces no repite el pedido.
  const { data: provinces = [] } = useQuery({
    queryKey: ['workshop-form-provinces'],
    queryFn: () => fetchProvinces(),
    staleTime: LOOKUP_STALE_TIME,
  });
  const { data: cities = [], isFetching: loadingCities } = useQuery({
    queryKey: ['workshop-form-cities', selectedProvince],
    queryFn: () => fetchCitiesByProvinceId(selectedProvince as number),
    enabled: !!selectedProvince,
    staleTime: LOOKUP_STALE_TIME,
  });

  // Populate form when editing
  useEffect(() => {
    if (editingWorkshop) {
      reset({
        id: editingWorkshop.id,
        name: editingWorkshop.name,
        type: editingWorkshop.type,
        address: editingWorkshop.address || '',
        province: editingWorkshop.province || null,
        city: editingWorkshop.city || null,
        latitude: editingWorkshop.latitude || null,
        longitude: editingWorkshop.longitude || null,
        provider_name: editingWorkshop.provider_name || '',
        provider_phone: editingWorkshop.provider_phone || '',
        provider_email: editingWorkshop.provider_email || '',
        is_active: editingWorkshop.is_active ?? true,
      });
      setIsEditing(true);
    } else {
      resetValues();
    }
  }, [editingWorkshop, reset]);

  const onSubmit = async (values: TalleresFormValues) => {
    setBusy(true);
    await toast
      .promise(
        async () => {
          await createWorkshop({
            name: values.name,
            type: values.type,
            address: values.address || null,
            province: values.province || null,
            city: values.city || null,
            latitude: values.latitude || null,
            longitude: values.longitude || null,
            provider_name: values.type === 'externo' ? values.provider_name || null : null,
            provider_phone: values.type === 'externo' ? values.provider_phone || null : null,
            provider_email: values.type === 'externo' ? values.provider_email || null : null,
            is_active: values.is_active!,
          });
        },
        {
          loading: 'Creando taller...',
          success: () => {
            resetForm();
            router.refresh();
            return 'Taller creado correctamente';
          },
          error: () => {
            setBusy(false);
            return 'Error al crear el taller';
          },
        }
      )
      .unwrap()
      .catch(() => {
        // el error ya se informa en el toast
      });
  };

  const onUpdate = async (values: TalleresFormValues) => {
    setBusy(true);
    await toast
      .promise(
        async () => {
          await updateWorkshop({
            id: values.id!,
            name: values.name,
            type: values.type,
            address: values.address || null,
            province: values.province || null,
            city: values.city || null,
            latitude: values.latitude || null,
            longitude: values.longitude || null,
            provider_name: values.type === 'externo' ? values.provider_name || null : null,
            provider_phone: values.type === 'externo' ? values.provider_phone || null : null,
            provider_email: values.type === 'externo' ? values.provider_email || null : null,
            is_active: values.is_active!,
          });
        },
        {
          loading: 'Actualizando taller...',
          success: () => {
            resetForm();
            router.refresh();
            return 'Taller actualizado correctamente';
          },
          error: () => {
            setBusy(false);
            return 'Error al actualizar el taller';
          },
        }
      )
      .unwrap()
      .catch(() => {
        // el error ya se informa en el toast
      });
  };

  const handleSubmit = (values: TalleresFormValues) => {
    if (isEditing) {
      onUpdate(values);
    } else {
      onSubmit(values);
    }
  };

  const resetValues = () => {
    reset({
      id: '',
      name: '',
      type: 'interno',
      address: '',
      province: null,
      city: null,
      latitude: null,
      longitude: null,
      provider_name: '',
      provider_phone: '',
      provider_email: '',
      is_active: true,
    });
    setIsEditing(false);
    setWorkshop(null);
  };

  // Éxito / cancelar: limpia el form y cierra el Sheet (antes del router.refresh()).
  const resetForm = () => {
    resetValues();
    closeSheet();
  };

  const handleCancel = () => {
    resetForm();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        {/* Nombre */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre del Taller *</FormLabel>
              <FormControl>
                <Input type="text" {...field} className="input w-full" placeholder="Nombre del taller" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tipo */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Taller *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="interno">Interno</SelectItem>
                  <SelectItem value="externo">Externo</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Direccion */}
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Direccion</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  {...field}
                  value={field.value || ''}
                  className="input w-full"
                  placeholder="Direccion del taller"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Provincia */}
        <FormField
          control={form.control}
          name="province"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provincia</FormLabel>
              <Select
                onValueChange={(value) => {
                  const numValue = value ? Number(value) : null;
                  field.onChange(numValue);
                  setValue('city', null);
                }}
                value={field.value?.toString() || ''}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar provincia" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {provinces.map((province) => (
                    <SelectItem key={province.id} value={province.id.toString()}>
                      {province.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Ciudad */}
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ciudad</FormLabel>
              <Select
                onValueChange={(value) => field.onChange(value ? Number(value) : null)}
                value={field.value?.toString() || ''}
                disabled={!selectedProvince || loadingCities}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={loadingCities ? 'Cargando ciudades...' : 'Seleccionar ciudad'} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city.id} value={city.id.toString()}>
                      {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Latitud y Longitud */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="latitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Latitud</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                    className="input w-full"
                    placeholder="-34.6037"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="longitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Longitud</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                    className="input w-full"
                    placeholder="-58.3816"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Campos de Proveedor (solo para talleres externos) */}
        {workshopType === 'externo' && (
          <>
            <div className="border-t pt-4 mt-4">
              <h3 className="text-lg font-semibold mb-3">Datos del Proveedor</h3>
            </div>

            <FormField
              control={form.control}
              name="provider_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Proveedor</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      {...field}
                      value={field.value || ''}
                      className="input w-full"
                      placeholder="Nombre del proveedor"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="provider_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefono del Proveedor</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      {...field}
                      value={field.value || ''}
                      className="input w-full"
                      placeholder="+54 11 1234-5678"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="provider_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email del Proveedor</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      {...field}
                      value={field.value || ''}
                      className="input w-full"
                      placeholder="proveedor@email.com"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        {/* Estado Activo */}
        <FormField
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Estado</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => field.onChange(value === 'true')}
                  value={field.value ? 'true' : 'false'}
                  className="flex flex-wrap gap-4"
                >
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="true" />
                    </FormControl>
                    <FormLabel className="font-normal">Activo</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="false" />
                    </FormControl>
                    <FormLabel className="font-normal">Inactivo</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Botones */}
        <div className="flex gap-2 mt-6">
          <Button type="submit" variant="brand" disabled={form.formState.isSubmitting}>
            {isEditing ? 'Actualizar' : 'Crear'}
          </Button>
          <Button type="button" onClick={handleCancel} variant="outline">
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default TalleresForm;
