'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { SearchCombobox } from '@/features/Warehouses/components/SearchCombobox';
import { formatQuantity } from '@/features/Warehouses/lib/format';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileQuestion, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { requestQuotes } from '../../actions/quotes.server';
import type { PurchaseRequestDetail } from '../../lib/request-query-types';
import { searchSupplierOptions } from '../../actions/suppliers.server';
import { invalidatePurchases } from '../../lib/invalidate';
import { requestQuotesSchema, type RequestQuotesValues } from '../../schemas/quotes';

const logger = new Logger('Purchases/RequestQuotesDialog');

type Line = PurchaseRequestDetail['lines'][number];

const hasRemaining = (line: Line) => Number(line.remaining) > 0;

function defaults(lines: readonly Line[]): { values: RequestQuotesValues; suppliers: Record<string, string> } {
  const pending = lines.filter(hasRemaining);
  const suppliers: Record<string, string> = {};
  for (const line of pending) if (line.suggestedSupplier) suppliers[line.suggestedSupplier.id] = line.suggestedSupplier.name;
  return { values: { requestLineIds: pending.map((line) => line.id), supplierIds: Object.keys(suppliers), notes: '' }, suppliers };
}

/**
 * Pedir cotizacion desde la solicitud: lineas (por defecto, las que tienen faltante) y uno o varios
 * proveedores (preseleccionados los sugeridos). Crea un pedido por proveedor, en borrador.
 */
export function RequestQuotesDialog({ request }: { request: PurchaseRequestDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [supplierNames, setSupplierNames] = useState<Record<string, string>>({});

  const form = useForm<RequestQuotesValues>({
    resolver: zodResolver(requestQuotesSchema),
    defaultValues: defaults(request.lines).values,
  });

  const mutation = useMutation({
    mutationFn: async (values: RequestQuotesValues) => unwrapAction(await requestQuotes(values)),
    onSuccess: ({ quotes }) => {
      toast.success(
        quotes.length === 1
          ? `Se creó el pedido de cotización ${quotes[0].number} para ${quotes[0].supplierName}`
          : `Se crearon ${quotes.length} pedidos de cotización: ${quotes.map((q) => q.number).join(', ')}`,
        { description: 'Quedan en borrador: enviáselos al proveedor desde cada pedido.' }
      );
      setOpen(false);
      invalidatePurchases(queryClient);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al pedir cotización', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el pedido de cotización');
    },
  });

  const openDialog = () => {
    const initial = defaults(request.lines);
    form.reset(initial.values);
    setSupplierNames(initial.suppliers);
    setOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" size="sm" variant="outline" onClick={openDialog}>
        <FileQuestion className="mr-1 h-4 w-4" />
        Pedir cotización
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pedir cotización de {request.number}</DialogTitle>
          <DialogDescription>
            Se crea un pedido por proveedor, en borrador, con lo que falta de cada línea. Después se envía desde cada pedido.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="requestLineIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Qué se cotiza</FormLabel>
                  <div className="space-y-2 rounded-md border p-3">
                    {request.lines.map((line, i) => {
                      const disabled = !hasRemaining(line);
                      return (
                        <label key={line.id} className="flex items-start gap-2 text-sm">
                          <Checkbox
                            className="mt-0.5"
                            disabled={disabled}
                            checked={field.value.includes(line.id)}
                            onCheckedChange={(checked) =>
                              field.onChange(checked ? [...field.value, line.id] : field.value.filter((id) => id !== line.id))
                            }
                          />
                          <span className={disabled ? 'text-muted-foreground' : undefined}>
                            {i + 1}. {line.material ? `[${line.material.code}] ${line.material.name}` : line.description}
                            <span className="text-muted-foreground tabular-nums">
                              {' '}
                              · {disabled ? 'ya pedida completa' : `falta ${formatQuantity(line.remaining)} ${line.unit}`}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="supplierIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>A quién</FormLabel>
                  <FormControl>
                    <SearchCombobox
                      queryKey={['purchase-supplier-options']}
                      search={searchSupplierOptions}
                      value=""
                      selectedLabel={null}
                      onSelect={(option) => {
                        if (!option || field.value.includes(option.id)) return;
                        setSupplierNames((prev) => ({ ...prev, [option.id]: option.label }));
                        field.onChange([...field.value, option.id]);
                      }}
                      placeholder="Agregar proveedor…"
                      searchPlaceholder="Razón social o CUIT…"
                      noun="proveedores"
                    />
                  </FormControl>
                  <div className="flex flex-wrap gap-2">
                    {field.value.map((id) => (
                      <Badge key={id} variant="secondary" className="gap-1">
                        {supplierNames[id] ?? 'Proveedor'}
                        <button
                          type="button"
                          aria-label={`Quitar ${supplierNames[id] ?? 'proveedor'}`}
                          onClick={() => field.onChange(field.value.filter((value) => value !== id))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observaciones para el proveedor (opcional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Van en el PDF del pedido" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Creando…' : 'Crear pedidos'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        <p className="text-xs text-muted-foreground">
          Para pedir a un proveedor líneas de varias solicitudes juntas, usá{' '}
          <Link href="/dashboard/purchases/quotes/new" className="underline">
            Nuevo pedido de cotización
          </Link>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}
