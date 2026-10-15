'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getContractOptionsForRules } from '@/features/Empresa/Clientes/actions/price-rules.server';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createCertification } from '../actions/certifications.server';
import { CERTIFICATIONS_QUERY_KEY, CONTRACT_OPTIONS_QUERY_KEY } from '../lib/query-keys';
import { certificationFormSchema, type CertificationFormValues } from '../schemas/certification';

interface CreateCertificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama con el id de la certificación creada (la tabla abre su detalle). */
  onCreated: (id: string) => void;
}

/** Alta de una certificación en borrador. El cliente se deduce del contrato elegido. */
export function CreateCertificationDialog({ open, onOpenChange, onCreated }: CreateCertificationDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<CertificationFormValues>({
    resolver: zodResolver(certificationFormSchema),
    defaultValues: { customerServiceId: '', periodFrom: '', periodTo: '', notes: '' },
  });

  // Consulta mínima (id + texto): no trae documentos, ítems ni fichas completas.
  const contracts = useQuery({
    queryKey: CONTRACT_OPTIONS_QUERY_KEY,
    queryFn: () => getContractOptionsForRules(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const create = useMutation({
    mutationFn: async (values: CertificationFormValues) => {
      const result = await createCertification(values);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: ({ id }) => {
      toast.success('Certificación creada en borrador');
      queryClient.invalidateQueries({ queryKey: CERTIFICATIONS_QUERY_KEY });
      form.reset();
      onOpenChange(false);
      onCreated(id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleOpenChange(next: boolean) {
    if (!next) form.reset();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Nueva certificación</DialogTitle>
          <DialogDescription>
            Se crea en borrador. Las líneas se arman con lo trabajado en el período y los precios se congelan recién al
            emitirla.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => create.mutate(values))} className="space-y-4">
            <FormField
              control={form.control}
              name="customerServiceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contrato</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={contracts.isPending}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            contracts.isPending
                              ? 'Cargando contratos…'
                              : contracts.isError
                                ? 'No se pudieron cargar los contratos'
                                : 'Elegí un contrato'
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(contracts.data ?? []).map((contract) => (
                        <SelectItem key={contract.id} value={contract.id}>
                          {contract.label || 'Sin nombre'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {contracts.isError ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => contracts.refetch()}
                    >
                      Reintentar
                    </Button>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="periodFrom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Desde</FormLabel>
                    <FormControl>
                      {/* `type="date"` permite escribir la fecha además de elegirla. */}
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="periodTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hasta</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observaciones</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creando…' : 'Crear borrador'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
