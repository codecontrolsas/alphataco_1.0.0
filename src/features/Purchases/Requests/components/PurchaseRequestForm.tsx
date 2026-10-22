'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { DestinationFields } from '@/features/Warehouses/Movements/components/DestinationFields';
import type { MovementFormLookups } from '@/features/Warehouses/actions/options.server';
import { SearchCombobox } from '@/features/Warehouses/components/SearchCombobox';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { TextareaFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, PenLine, Plus, Trash2 } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { searchPurchaseMaterialOptions } from '../../actions/request-queries.server';
import {
  createPurchaseRequest,
  createPurchaseRequestFromMaterialRequest,
  updatePurchaseRequestDraft,
} from '../../actions/requests.server';
import { searchSupplierOptions } from '../../actions/suppliers.server';
import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';
import {
  emptyPurchaseRequestLine,
  purchaseRequestFormSchema,
  type PurchaseRequestFormValues,
} from '../../schemas/requests';

const logger = new Logger('Purchases/PurchaseRequestForm');

type Units = { id: string; name: string; abbreviation: string }[];

/** Labels de lo ya elegido en los combos (la opcion puede no estar en la pagina de resultados). */
export type LineLabels = Record<number, { material?: string; unit?: string; supplier?: string }>;

/** Pedido de Almacenes del que sale la solicitud: fija el destino y los materiales. */
export interface LinkedMaterialRequest {
  id: string;
  number: string;
  destination: string | null;
}

export type PurchaseRequestFormMode =
  | { kind: 'create' }
  | { kind: 'edit'; requestId: string; number: string; materialRequest: LinkedMaterialRequest | null }
  | { kind: 'fromMaterialRequest'; materialRequest: LinkedMaterialRequest };

interface PurchaseRequestFormProps {
  mode: PurchaseRequestFormMode;
  defaultValues: PurchaseRequestFormValues;
  initialLabels: LineLabels;
  customers: MovementFormLookups['customers'];
  units: Units;
}

/**
 * Solicitud de compra en un solo formulario: destino opcional, cuando se necesita, notas y las
 * lineas (material del catalogo o texto libre). "Guardar borrador" o "Enviar a aprobacion".
 * Desde un pedido de Almacenes el destino es el del pedido y las lineas, sus materiales.
 */
export function PurchaseRequestForm({
  mode,
  defaultValues,
  initialLabels,
  customers,
  units,
}: PurchaseRequestFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [labels, setLabels] = useState<LineLabels>(initialLabels);
  const linked = mode.kind === 'create' ? null : mode.materialRequest;

  const form = useForm<PurchaseRequestFormValues>({
    resolver: zodResolver(purchaseRequestFormSchema),
    defaultValues,
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });

  const save = useMutation({
    mutationFn: async ({ values, submit }: { values: PurchaseRequestFormValues; submit: boolean }) => {
      if (mode.kind === 'edit') {
        unwrapAction(await updatePurchaseRequestDraft(mode.requestId, values));
        return { id: mode.requestId, number: mode.number, submit };
      }
      const created = unwrapAction(
        mode.kind === 'fromMaterialRequest'
          ? await createPurchaseRequestFromMaterialRequest(mode.materialRequest.id, values, { submit })
          : await createPurchaseRequest(values, { submit })
      );
      return { ...created, submit };
    },
    onSuccess: ({ id, number, submit }) => {
      toast.success(
        mode.kind === 'edit'
          ? `Solicitud ${number} guardada`
          : submit
            ? `Solicitud ${number} enviada a aprobación`
            : `Solicitud ${number} guardada como borrador`
      );
      void queryClient.invalidateQueries({ queryKey: PURCHASES_QUERY_KEYS.requests });
      router.push(`/dashboard/purchases/requests/${id}`);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar la solicitud de compra', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la solicitud');
    },
  });

  const submitWith = (submit: boolean) => form.handleSubmit((values) => save.mutate({ values, submit }));

  const removeLine = (index: number) => {
    lines.remove(index);
    // Los labels van por posicion: se corren los de las lineas siguientes.
    setLabels((prev) => {
      const next: LineLabels = {};
      for (const [key, value] of Object.entries(prev)) {
        const i = Number(key);
        if (i < index) next[i] = value;
        else if (i > index) next[i - 1] = value;
      }
      return next;
    });
  };

  return (
    <Form {...form}>
      {/* Enter en un campo guarda borrador: enviar a aprobacion es siempre un click explicito. */}
      <form onSubmit={submitWith(false)} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos de la solicitud</CardTitle>
            {linked && (
              <CardDescription>
                Generada desde el pedido{' '}
                <Link href={`/dashboard/warehouse/requests/${linked.id}`} className="font-mono underline">
                  {linked.number}
                </Link>
                : se imputa a {linked.destination ?? 'su destino'} y solo lleva materiales del pedido.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!linked && <DestinationFields form={form} customers={customers} noneLabel="Para stock (sin imputar)" />}
            <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <FormField
                control={form.control}
                name="neededBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Se necesita para</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker
                        date={field.value ? moment(field.value, 'YYYY-MM-DD').toDate() : undefined}
                        setDate={(date) => field.onChange(date ? moment(date).format('YYYY-MM-DD') : '')}
                        placeholder="DD/MM/AAAA"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <TextareaFormField
                control={form.control}
                name="notes"
                label="Para qué se necesita (opcional)"
                rows={2}
                placeholder="Contexto para quien aprueba y para Compras"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">Qué se compra</CardTitle>
              <CardDescription>
                {linked
                  ? 'Lo que falta para entregar el pedido: se pueden ajustar las cantidades o quitar líneas.'
                  : 'Un material del catálogo de Almacenes, o una descripción libre para servicios y compras que no se stockean.'}
              </CardDescription>
            </div>
            {!linked && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => lines.append(emptyPurchaseRequestLine())}
              >
                <Plus className="mr-1 h-4 w-4" />
                Agregar línea
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {lines.fields.map((field, index) => (
              <div key={field.id}>
                {index > 0 && <Separator className="mb-4" />}
                <LineFields
                  form={form}
                  index={index}
                  units={units}
                  labels={labels[index] ?? {}}
                  materialOnly={linked !== null}
                  canRemove={lines.fields.length > 1}
                  onRemove={() => removeLine(index)}
                  onLabel={(patch) => setLabels((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }))}
                />
              </div>
            ))}
            {form.formState.errors.lines?.root?.message && (
              <p className="text-sm text-destructive">{form.formState.errors.lines.root.message}</p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="button" variant="secondary" onClick={submitWith(false)} disabled={save.isPending}>
            {mode.kind === 'edit' ? 'Guardar borrador' : 'Guardar como borrador'}
          </Button>
          {mode.kind !== 'edit' && (
            <Button type="button" onClick={submitWith(true)} disabled={save.isPending}>
              {save.isPending ? 'Guardando…' : 'Enviar a aprobación'}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}

interface LineFieldsProps {
  form: UseFormReturn<PurchaseRequestFormValues>;
  index: number;
  units: Units;
  labels: LineLabels[number];
  materialOnly: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onLabel: (patch: LineLabels[number]) => void;
}

function LineFields({ form, index, units, labels, materialOnly, canRemove, onRemove, onLabel }: LineFieldsProps) {
  const kind = useWatch({ control: form.control, name: `lines.${index}.kind` });
  const setKind = (next: 'MATERIAL' | 'FREE_TEXT') => {
    if (next === kind) return;
    form.setValue(`lines.${index}.kind`, next);
    form.clearErrors(`lines.${index}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium tabular-nums">Línea {index + 1}</span>
        {!materialOnly && (
          <div
            className="inline-flex rounded-md border p-0.5"
            role="group"
            aria-label={`Tipo de la línea ${index + 1}`}
          >
            {(
              [
                ['MATERIAL', 'Material', Package],
                ['FREE_TEXT', 'Texto libre', PenLine],
              ] as const
            ).map(([value, text, Icon]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={kind === value}
                className={cn('h-7 px-2', kind === value && 'bg-muted font-medium')}
                onClick={() => setKind(value)}
              >
                <Icon className="mr-1 h-3.5 w-3.5" />
                {text}
              </Button>
            ))}
          </div>
        )}
        {canRemove && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="ml-auto h-8 w-8 text-destructive hover:text-destructive"
            aria-label={`Quitar la línea ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_minmax(0,10rem)]">
        {kind === 'MATERIAL' ? (
          <FormField
            control={form.control}
            name={`lines.${index}.materialId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Material</FormLabel>
                <FormControl>
                  <SearchCombobox
                    queryKey={['purchase-material-options']}
                    search={searchPurchaseMaterialOptions}
                    value={field.value}
                    selectedLabel={labels.material ?? null}
                    onSelect={(option) => {
                      field.onChange(option?.id ?? '');
                      onLabel({ material: option?.label, unit: option?.unit });
                    }}
                    placeholder="Elegí un material"
                    searchPlaceholder="Código o nombre…"
                    noun="materiales"
                    disabled={materialOnly}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <FormField
            control={form.control}
            name={`lines.${index}.description`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descripción</FormLabel>
                <FormControl>
                  <Input placeholder="Ej.: Rectificado de tapa de cilindros" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name={`lines.${index}.quantity`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cantidad{kind === 'MATERIAL' && labels.unit ? ` (${labels.unit})` : ''}</FormLabel>
              <FormControl>
                <Input inputMode="decimal" className="tabular-nums" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {kind === 'FREE_TEXT' ? (
          <FormField
            control={form.control}
            name={`lines.${index}.unitId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unidad</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.abbreviation})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <div className="hidden md:block" />
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <FormField
          control={form.control}
          name={`lines.${index}.suggestedSupplierId`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Proveedor sugerido (opcional)</FormLabel>
              <FormControl>
                <SearchCombobox
                  queryKey={['purchase-supplier-options']}
                  search={searchSupplierOptions}
                  value={field.value}
                  selectedLabel={labels.supplier ?? null}
                  onSelect={(option) => {
                    field.onChange(option?.id ?? '');
                    onLabel({ supplier: option?.label });
                  }}
                  placeholder="Sin proveedor sugerido"
                  searchPlaceholder="Razón social o CUIT…"
                  noun="proveedores"
                  renderOption={(o) => (
                    <span className="flex flex-col">
                      <span>{o.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{o.cuit}</span>
                    </span>
                  )}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`lines.${index}.notes`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observaciones (opcional)</FormLabel>
              <FormControl>
                <Input placeholder="Marca preferida, medida, urgencia…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
