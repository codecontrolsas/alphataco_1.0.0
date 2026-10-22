'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { TextareaFormField } from '@/shared/components/common/form-fields';
import {
  RECEIVER_VAT_CONDITIONS,
  isReceiverVatConditionId,
  type ReceiverVatConditionId,
} from '@/shared/lib/arca/catalogs';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { createSupplier, updateSupplier } from '../../actions/suppliers.server';
import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';
import { emptySupplierContact, supplierFormSchema, type SupplierFormValues } from '../../schemas/suppliers';

const logger = new Logger('Purchases/SupplierForm');

/**
 * Condiciones frente al IVA que se ofrecen para un proveedor: las de Clientes mas "Proveedor del
 * Exterior" (sin "Cliente del Exterior"). Si el proveedor ya tiene otra guardada, tambien esa.
 */
const SUPPLIER_VAT_CONDITIONS: ReceiverVatConditionId[] = [1, 6, 4, 8, 7, 10, 13, 15, 16, 5];

function vatOptions(current: string): ReceiverVatConditionId[] {
  const id = Number(current);
  return current && isReceiverVatConditionId(id) && !SUPPLIER_VAT_CONDITIONS.includes(id)
    ? [...SUPPLIER_VAT_CONDITIONS, id]
    : SUPPLIER_VAT_CONDITIONS;
}

interface SupplierFormProps {
  /** `null` = alta. */
  supplierId: string | null;
  defaultValues: SupplierFormValues;
  categories: { id: string; name: string }[];
  readOnly?: boolean;
}

/**
 * Ficha del proveedor en un solo formulario: datos, contactos, rubros, pago y banco. Contactos y
 * rubros viajan como altas y bajas explicitas contra lo que se cargo al abrir.
 */
export function SupplierForm({ supplierId, defaultValues, categories, readOnly = false }: SupplierFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<SupplierFormValues>({ resolver: zodResolver(supplierFormSchema), defaultValues });
  const contacts = useFieldArray({ control: form.control, name: 'contacts', keyName: 'key' });
  const vatConditionId = useWatch({ control: form.control, name: 'vatConditionId' });
  const watchedContacts = useWatch({ control: form.control, name: 'contacts' });

  const save = useMutation({
    mutationFn: async (values: SupplierFormValues) => {
      if (!supplierId) return unwrapAction(await createSupplier(values, values.categoryIds));
      // Bajas explicitas: lo que estaba al abrir y ya no esta. La ausencia sola no borra nada.
      const keptContacts = new Set(values.contacts.map((c) => c.id).filter(Boolean));
      const removedContactIds = defaultValues.contacts.map((c) => c.id).filter((id) => id && !keptContacts.has(id));
      const before = new Set(defaultValues.categoryIds);
      const after = new Set(values.categoryIds);
      unwrapAction(
        await updateSupplier(supplierId, values, {
          removedContactIds,
          categories: {
            add: values.categoryIds.filter((id) => !before.has(id)),
            remove: defaultValues.categoryIds.filter((id) => !after.has(id)),
          },
        })
      );
      return { id: supplierId };
    },
    onSuccess: ({ id }, values) => {
      toast.success(supplierId ? `${values.name} actualizado` : `${values.name} creado`);
      void queryClient.invalidateQueries({ queryKey: PURCHASES_QUERY_KEYS.suppliers });
      if (supplierId) {
        // La pagina remonta el form con `key = updatedAt`: la base de la proxima edicion son los
        // datos guardados, con los ids de los contactos nuevos.
        router.refresh();
      } else {
        router.push(`/dashboard/purchases/suppliers/${id}`);
      }
    },
    onError: (error) => {
      logger.error('Error al guardar el proveedor', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el proveedor');
    },
  });

  const setPrimary = (index: number) => {
    contacts.fields.forEach((_, i) => form.setValue(`contacts.${i}.isPrimary`, i === index, { shouldDirty: true }));
  };

  const text = (name: keyof SupplierFormValues, label: string, placeholder = '', className = '') => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input placeholder={placeholder} readOnly={readOnly} {...field} value={field.value as string} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
        <fieldset disabled={readOnly || save.isPending} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos del proveedor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {text('name', 'Razón social', 'Ej.: Repuestos del Sur SRL')}
                {text('tradeName', 'Nombre de fantasía (opcional)')}
              </div>
              <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                {text('cuit', 'CUIT', '30-71234567-8')}
                <FormField
                  control={form.control}
                  name="vatConditionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condición frente al IVA</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Elegí la condición" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {vatOptions(vatConditionId).map((id) => (
                            <SelectItem key={id} value={String(id)}>
                              {RECEIVER_VAT_CONDITIONS[id].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,7rem)]">
                {text('street', 'Dirección (opcional)', 'Calle y número')}
                {text('city', 'Localidad')}
                {text('province', 'Provincia')}
                {text('postalCode', 'CP')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base">Contactos</CardTitle>
                <CardDescription>A quién se le piden precios y se envían las órdenes de compra.</CardDescription>
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => contacts.append(emptySupplierContact(contacts.fields.length === 0))}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Agregar contacto
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {contacts.fields.length === 0 && <p className="text-sm text-muted-foreground">Sin contactos cargados.</p>}
              {contacts.fields.map((contact, index) => {
                const isPrimary = watchedContacts?.[index]?.isPrimary === true;
                return (
                  <div
                    key={contact.key}
                    className="grid items-start gap-3 rounded-md border p-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,9rem)_minmax(0,9rem)_auto]"
                  >
                    {(['name', 'email', 'phone', 'role'] as const).map((key) => (
                      <FormField
                        key={key}
                        control={form.control}
                        name={`contacts.${index}.${key}`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">
                              {{ name: 'Nombre', email: 'Mail', phone: 'Teléfono', role: 'Puesto' }[key]}
                            </FormLabel>
                            <FormControl>
                              <Input readOnly={readOnly} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                    <div className="flex gap-1 xl:pt-6">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={cn('h-9 w-9', isPrimary && 'text-warn')}
                        aria-pressed={isPrimary}
                        aria-label={isPrimary ? 'Contacto principal' : 'Marcar como principal'}
                        title={isPrimary ? 'Contacto principal' : 'Marcar como principal'}
                        onClick={() => setPrimary(index)}
                        disabled={readOnly}
                      >
                        <Star className={cn('h-4 w-4', isPrimary && 'fill-current')} />
                      </Button>
                      {!readOnly && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-destructive hover:text-destructive"
                          aria-label="Quitar contacto"
                          onClick={() => contacts.remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {form.formState.errors.contacts?.root?.message && (
                <p className="text-sm text-destructive">{form.formState.errors.contacts.root.message}</p>
              )}
              {form.formState.errors.contacts?.message && (
                <p className="text-sm text-destructive">{form.formState.errors.contacts.message}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rubros, pago y banco</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="categoryIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rubros</FormLabel>
                    <FormControl>
                      <MultiSelectCombobox
                        options={categories.map((c) => ({ value: c.id, label: c.name }))}
                        placeholder={
                          categories.length ? 'Elegí los rubros' : 'No hay rubros: se crean en Configuración'
                        }
                        emptyMessage="Sin resultados"
                        selectedValues={field.value}
                        onChange={field.onChange}
                        disabled={readOnly || categories.length === 0}
                      />
                    </FormControl>
                    {/* El combo compartido solo dice "N seleccionados": los nombres van aca. */}
                    {field.value.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {categories
                          .filter((c) => field.value.includes(c.id))
                          .map((c) => (
                            <Badge key={c.id} variant="secondary">
                              {c.name}
                            </Badge>
                          ))}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 md:grid-cols-3">
                {text('paymentTermDays', 'Plazo de pago (días)', 'Ej.: 30')}
                {text('bankCbu', 'CBU (opcional)', '22 dígitos')}
                {text('bankAlias', 'Alias (opcional)')}
              </div>
              <TextareaFormField
                control={form.control}
                name="notes"
                label="Observaciones (opcional)"
                rows={2}
                readOnly={readOnly}
              />
            </CardContent>
          </Card>
        </fieldset>

        {!readOnly && (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending || (supplierId !== null && !form.formState.isDirty)}>
              {save.isPending ? 'Guardando…' : supplierId ? 'Guardar cambios' : 'Crear proveedor'}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
