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
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Logger } from '@/lib/logger';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { DateFormField, InputFormField, TextareaFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { createHseDocument, updateHseDocument } from '../actions/documents.server';
import { fetchHseDocumentFormOptions } from '../actions/form-options.server';
import { HSE_PDF_MAX_BYTES, HSE_QUERY_KEYS } from '../lib/constants';
import { hseDocumentFormSchema, type HseDocumentFormValues } from '../schemas/documents';
import { TargetsEditor } from './TargetsEditor';

const logger = new Logger('Hse/HseDocumentFormDialog');

const NO_TYPE = '__none__';

/** Del lado del cliente el alta suma el PDF (el servidor lo vuelve a validar por sus bytes). */
const createSchema = hseDocumentFormSchema.extend({
  file: z
    .instanceof(File, { message: 'Elegí el archivo PDF' })
    .refine(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      'El archivo tiene que ser un PDF'
    )
    .refine((f) => f.size <= HSE_PDF_MAX_BYTES, 'El PDF supera los 9 MB'),
});
const editSchema = hseDocumentFormSchema.extend({ file: z.instanceof(File).optional() });
type FormValues = z.infer<typeof editSchema>;

const EMPTY: HseDocumentFormValues = { title: '', description: '', typeId: '', expiresAt: '', targets: [] };

/**
 * Alta o edición de un documento HSE en UN formulario: datos, a quién aplica y (en el alta) el PDF. Las opciones se
 * piden al abrir. En el alta queda en borrador: publicarlo es otra decisión (permiso `approve`).
 */
export function HseDocumentFormDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: { kind: 'create' } | { kind: 'edit'; documentId: string; values: HseDocumentFormValues; published: boolean };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isCreate = mode.kind === 'create';
  // Tras crear se navega al detalle: el botón queda bloqueado hasta que la navegación termine (no se crea dos veces).
  const [created, setCreated] = useState(false);

  const options = useQuery({
    queryKey: [...HSE_QUERY_KEYS.all, 'form-options'],
    queryFn: () => fetchHseDocumentFormOptions(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(isCreate ? createSchema : editSchema),
    defaultValues: mode.kind === 'edit' ? mode.values : EMPTY,
  });

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const { file, ...data } = values;
      if (mode.kind === 'edit') return unwrapAction(await updateHseDocument(mode.documentId, data));
      const formData = new FormData();
      formData.set('payload', JSON.stringify(data));
      if (file) formData.set('file', file);
      return unwrapAction(await createHseDocument(formData));
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
      if (mode.kind === 'create') {
        setCreated(true);
        toast.success('Documento creado en borrador. Revisalo y publicalo.');
        router.push(`/dashboard/hse/documents/${result.id}`);
        return;
      }
      toast.success(mode.published ? 'Documento guardado. Los destinatarios se actualizaron.' : 'Documento guardado');
      onOpenChange(false);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar el documento HSE', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el documento');
    },
  });

  const busy = save.isPending || created;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'Nuevo documento HSE' : 'Editar documento'}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? 'Se guarda como borrador. Nadie lo ve hasta que se publique.'
              : mode.published
                ? 'Si cambiás los destinatarios, los nuevos quedan pendientes de aceptar y los que salen se archivan.'
                : 'El borrador todavía no lo ve nadie.'}
          </DialogDescription>
        </DialogHeader>

        {options.isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Cargando el formulario">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : options.isError || !options.data ? (
          <StateBlock
            variant="error"
            title="No se pudieron cargar las opciones"
            description={options.error instanceof Error ? options.error.message : undefined}
            action={
              <Button type="button" variant="outline" onClick={() => void options.refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
              <InputFormField
                control={form.control}
                name="title"
                label="Título"
                placeholder="Procedimiento de trabajo en altura"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="typeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo (opcional)</FormLabel>
                      <Select
                        value={field.value || NO_TYPE}
                        onValueChange={(value) => field.onChange(value === NO_TYPE ? '' : value)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sin tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_TYPE}>Sin tipo</SelectItem>
                          {options.data.types.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DateFormField
                  control={form.control}
                  name="expiresAt"
                  label="Vence (opcional)"
                  description="Fecha en que hay que revisar o renovar el documento."
                />
              </div>
              <TextareaFormField
                control={form.control}
                name="description"
                label="Descripción (opcional)"
                rows={3}
                placeholder="Qué regula y a quién está dirigido"
              />

              {isCreate && (
                <FormField
                  control={form.control}
                  name="file"
                  render={({ field: { onChange, value: _value, ...field } }) => (
                    <FormItem>
                      <FormLabel>Archivo PDF (hasta 9 MB)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="file"
                          accept="application/pdf"
                          className="min-h-11 sm:min-h-9"
                          onChange={(event) => onChange(event.target.files?.[0])}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <Separator />
              <FormField
                control={form.control}
                name="targets"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>A quién aplica</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Quienes coincidan con alguno van a tener que leerlo y aceptarlo en el portal. Si después alguien
                      cambia de puesto o sector, se actualiza solo.
                    </p>
                    <TargetsEditor
                      value={field.value}
                      onChange={field.onChange}
                      options={options.data}
                      invalid={Boolean(fieldState.error)}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? 'Guardando…' : isCreate ? 'Crear borrador' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
