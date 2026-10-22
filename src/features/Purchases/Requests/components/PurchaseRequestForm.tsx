'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { DestinationFields } from '@/features/Warehouses/Movements/components/DestinationFields';
import type { MovementFormLookups } from '@/features/Warehouses/actions/options.server';
import { Logger } from '@/lib/logger';
import { TextareaFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createPurchaseRequestFromMaterialRequest } from '../../actions/request-from-material.server';
import { createPurchaseRequest, updatePurchaseRequestDraft } from '../../actions/requests.server';
import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';
import {
  emptyPurchaseRequestLine,
  purchaseRequestFormSchema,
  type PurchaseRequestFormValues,
} from '../../schemas/requests';
import { LineFields } from './PurchaseRequestLineFields';

const logger = new Logger('Purchases/PurchaseRequestForm');

export type Units = { id: string; name: string; abbreviation: string }[];

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
