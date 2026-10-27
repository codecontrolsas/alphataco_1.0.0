'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Logger } from '@/lib/logger';
import { InputFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileText, Link2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import type { HseTrainingDetail } from '../../actions/trainings.queries';
import {
  addHseTrainingMaterialFile,
  addHseTrainingMaterialLink,
  deleteHseTrainingMaterial,
} from '../../actions/trainings.server';
import { HSE_PDF_MAX_BYTES, HSE_QUERY_KEYS } from '../../lib/constants';
import { hseMaterialFileMetaSchema, hseMaterialLinkSchema } from '../../schemas/trainings';

const logger = new Logger('Hse/MaterialsSection');

type Material = HseTrainingDetail['materials'][number];

const fileSchema = hseMaterialFileMetaSchema.extend({
  file: z
    .instanceof(File, { message: 'Elegí el archivo PDF' })
    .refine(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
      'El archivo tiene que ser un PDF'
    )
    .refine((f) => f.size <= HSE_PDF_MAX_BYTES, 'El PDF supera los 9 MB'),
});
const linkSchema = hseMaterialLinkSchema;
type FileValues = z.infer<typeof fileSchema>;
type LinkValues = z.infer<typeof linkSchema>;

/**
 * Material de estudio de una capacitación: PDFs (servidos por el proxy de archivos con perímetro) y enlaces https.
 * "Obligatorio" = el empleado tiene que marcarlo como leído antes de rendir (lo exige la base al empezar el intento).
 * Se edita solo en borrador.
 */
export function MaterialsSection({
  trainingId,
  materials,
  editable,
  published,
}: {
  trainingId: string;
  materials: Material[];
  editable: boolean;
  published: boolean;
}) {
  const [adding, setAdding] = useState<'file' | 'link' | null>(null);
  const [removing, setRemoving] = useState<Material | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: async (id: string) => unwrapAction(await deleteHseTrainingMaterial(id)),
    onSuccess: () => {
      setRemoving(null);
      toast.success('Material quitado');
      void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al quitar el material', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo quitar el material');
    },
  });

  return (
    <div className="space-y-3">
      {materials.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-pretty">
          Sin material. Podés publicar una capacitación solo con examen, pero lo habitual es sumar el PDF o el video que
          hay que estudiar.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {materials.map((m) => {
            const Icon = m.kind === 'file' ? FileText : Link2;
            return (
              <li key={m.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium break-words">{m.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {m.isRequired ? <Badge variant="secondary">Lectura obligatoria</Badge> : <span>Opcional</span>}
                      <span className="break-all">{m.kind === 'file' ? m.fileName : m.url}</span>
                      {published && (
                        <span className="tabular-nums">
                          · {m.reads} lectura{m.reads === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1 self-start sm:self-center">
                  {m.viewUrl && (
                    <a
                      href={m.viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir «${m.title}»`}
                      className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-brand-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
                    >
                      <ExternalLink aria-hidden="true" className="size-4" /> Abrir
                    </a>
                  )}
                  {editable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 text-destructive sm:size-9"
                      aria-label={`Quitar «${m.title}»`}
                      onClick={() => setRemoving(m)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setAdding('file')}>
            <Plus aria-hidden="true" className="mr-1 size-4" /> Agregar PDF
          </Button>
          <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setAdding('link')}>
            <Plus aria-hidden="true" className="mr-1 size-4" /> Agregar enlace
          </Button>
        </div>
      )}

      {adding && <AddMaterialDialog trainingId={trainingId} kind={adding} onClose={() => setAdding(null)} />}

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && !remove.isPending && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar «{removing?.title}»?</AlertDialogTitle>
            <AlertDialogDescription>El material se borra del borrador.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (removing) remove.mutate(removing.id);
              }}
            >
              {remove.isPending ? 'Quitando…' : 'Quitar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddMaterialDialog({
  trainingId,
  kind,
  onClose,
}: {
  trainingId: string;
  kind: 'file' | 'link';
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<FileValues | LinkValues>({
    resolver: zodResolver(kind === 'file' ? fileSchema : linkSchema),
    defaultValues: kind === 'file' ? { title: '', isRequired: true } : { title: '', url: 'https://', isRequired: true },
  });

  const save = useMutation({
    mutationFn: async (values: FileValues | LinkValues) => {
      if ('file' in values) {
        const formData = new FormData();
        formData.set('payload', JSON.stringify({ title: values.title, isRequired: values.isRequired }));
        formData.set('file', values.file);
        return unwrapAction(await addHseTrainingMaterialFile(trainingId, formData));
      }
      return unwrapAction(await addHseTrainingMaterialLink(trainingId, values as LinkValues));
    },
    onSuccess: () => {
      toast.success('Material agregado');
      void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
      onClose();
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al agregar el material', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo agregar el material');
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind === 'file' ? 'Agregar PDF' : 'Agregar enlace'}</DialogTitle>
          <DialogDescription>
            {kind === 'file'
              ? 'Se guarda en el almacenamiento de la empresa y el empleado lo abre desde el portal.'
              : 'Un video o una página externa. Tiene que empezar con https://'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
            <InputFormField control={form.control} name="title" label="Título" placeholder="Manual de uso" />
            {kind === 'file' ? (
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
            ) : (
              <InputFormField
                control={form.control}
                name="url"
                label="Enlace"
                type="url"
                inputMode="url"
                placeholder="https://"
              />
            )}
            <FormField
              control={form.control}
              name="isRequired"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Lectura obligatoria</FormLabel>
                    <FormDescription>El empleado tiene que marcarlo como leído antes de rendir.</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Guardando…' : 'Agregar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
