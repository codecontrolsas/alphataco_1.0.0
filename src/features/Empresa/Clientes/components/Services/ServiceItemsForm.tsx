'use client';

import { DEFAULT_VAT_RATE_ID } from '@/shared/lib/arca/catalogs';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { Logger } from '@/lib/logger';
import { VAT_RATES, VAT_RATE_LABELS, type VatRateId } from '@/shared/lib/arca/catalogs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { MeasureUnitRow } from '../../actions/measure-units.server';
import { createServiceItem, updateServiceItem, type ServiceItemRow } from '../../actions/service-items.server';
import { serviceItemFormSchema, type ServiceItemFormValues } from '../../schemas/service-item';

const logger = new Logger('features/Empresa/Clientes/ServiceItemsForm');

/** Alícuotas de mayor a menor (27 %, 21 %, 10,5 %…), derivadas del catálogo de ARCA. */
const VAT_RATE_OPTIONS = (Object.keys(VAT_RATES).map(Number) as VatRateId[]).sort(
  (a, b) => Number(VAT_RATES[b]) - Number(VAT_RATES[a])
);

interface ServiceItemsFormProps {
  measureUnits: MeasureUnitRow[];
  customerServiceId: string;
  editingItem: ServiceItemRow | null;
  onCancel: () => void;
  onSaved: () => void;
}

function toFormValues(item: ServiceItemRow | null): ServiceItemFormValues {
  return {
    item_name: item?.item_name ?? '',
    item_description: item?.item_description ?? '',
    code_item: item?.code_item ?? '',
    item_number: item?.item_number ?? '',
    // Texto (`Decimal(15,4)`). null (sin view_prices) se envía como '0' y el servidor lo ignora.
    item_price: item?.item_price ?? '0',
    item_measure_units: item ? String(item.item_measure_units) : '',
    vat_rate_id: item ? String(item.vat_rate_id) : String(DEFAULT_VAT_RATE_ID),
    is_active: item?.is_active ?? true,
    needs_personnel: item?.needs_personnel ?? true,
    needs_equipment: item?.needs_equipment ?? true,
  };
}

/**
 * Alta/edición de un item del contrato. El padre lo remonta con `key` al cambiar el item en
 * edición, así los `defaultValues` siempre corresponden al item actual.
 */
export default function ServiceItemsForm({
  measureUnits,
  customerServiceId,
  editingItem,
  onCancel,
  onSaved,
}: ServiceItemsFormProps) {
  const isEditing = !!editingItem;
  const { hasPermission } = usePermissions();
  // El importe se ve con `view_prices` y se modifica con `update_prices` (permisos separados).
  const canViewPrices = hasPermission('comercial', 'items-contrato', 'view_prices');
  const canUpdatePrices = hasPermission('comercial', 'items-contrato', 'update_prices');
  const form = useForm<ServiceItemFormValues>({
    resolver: zodResolver(serviceItemFormSchema),
    defaultValues: toFormValues(editingItem),
  });

  const onSubmit = async (values: ServiceItemFormValues) => {
    try {
      const result = isEditing
        ? await updateServiceItem(editingItem.id, values)
        : await createServiceItem(customerServiceId, values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Item ${isEditing ? 'actualizado' : 'creado'} correctamente`);
      form.reset(toFormValues(null));
      onSaved();
    } catch (error) {
      // La action puede rechazar (no devolver `ok: false`): sin este catch el usuario no ve nada.
      logger.error('Error al guardar el item del contrato', { data: { error } });
      toast.error('Error al guardar el item');
    }
  };

  const handleCancel = () => {
    form.reset(toFormValues(null));
    onCancel();
  };

  return (
    <div className="px-6 pt-6 pb-4">
      <p className="text-base font-semibold mb-4">{isEditing ? 'Editar Item' : 'Nuevo Item'}</p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="item_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del Item*</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: Porta Simple" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="code_item"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: COD-001" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="item_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: 001" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {canViewPrices && (
              <FormField
                control={form.control}
                name="item_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio*</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        disabled={!canUpdatePrices}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {canUpdatePrices
                        ? 'Precio neto, sin IVA'
                        : 'Precio neto, sin IVA. No tenés permiso para modificarlo.'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="vat_rate_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alícuota IVA*</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Elegí la alícuota" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        {VAT_RATE_OPTIONS.map((id) => (
                          <SelectItem key={id} value={String(id)}>
                            {VAT_RATE_LABELS[id]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Alícuota por defecto al facturar este ítem. Se puede cambiar en cada factura.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="item_measure_units"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidad de Medida*</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccione unidad" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {measureUnits.map((unit) => (
                        <SelectItem key={unit.id} value={String(unit.id)}>
                          {unit.unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="item_description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción</FormLabel>
                <FormControl>
                  <Textarea placeholder="Ingrese la descripción del item" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel>Estado</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={(value) => field.onChange(value === 'true')}
                    value={field.value ? 'true' : 'false'}
                    className="flex gap-6"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="true" />
                      <span className="text-sm">Activo</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="false" />
                      <span className="text-sm">Inactivo</span>
                    </div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <p className="text-sm font-medium leading-none">Requerimientos</p>
            <div className="flex gap-6 pt-1">
              <FormField
                control={form.control}
                name="needs_personnel"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Necesita Personal</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="needs_equipment"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Necesita Equipos</FormLabel>
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <PermissionGuard module="comercial" tab="items-contrato" action={isEditing ? 'update' : 'create'}>
              <Button type="submit" variant="brand" disabled={form.formState.isSubmitting}>
                {isEditing ? 'Guardar cambios' : 'Crear'}
              </Button>
            </PermissionGuard>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancelar
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
