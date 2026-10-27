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
import { Logger } from '@/lib/logger';
import { DateFormField, TextareaFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { publishHseDocumentVersion, replaceHseDraftFile } from '../../actions/documents.server';
import { HSE_PDF_MAX_BYTES } from '../../lib/constants';
import { hseNewVersionSchema } from '../../schemas/documents';

const logger = new Logger('Hse/PdfVersionDialog');

const pdfField = z
  .instanceof(File, { message: 'Elegí el archivo PDF' })
  .refine(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    'El archivo tiene que ser un PDF'
  )
  .refine((f) => f.size <= HSE_PDF_MAX_BYTES, 'El PDF supera los 9 MB');

const versionSchema = hseNewVersionSchema.extend({ file: pdfField });
const replaceSchema = z.object({ file: pdfField, changeLog: z.string().optional(), expiresAt: z.string().optional() });
type Values = z.infer<typeof replaceSchema>;

/**
 * PDF de un documento: `replace` cambia el archivo del BORRADOR (nadie lo vio); `version` publica una versión nueva de un
 * documento publicado, con qué cambió, y vuelve todas las aceptaciones a pendiente.
 */
export function PdfVersionDialog({
  open,
  onOpenChange,
  documentId,
  mode,
  defaultExpiresAt,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  mode: 'replace' | 'version';
  defaultExpiresAt: string;
  onDone: () => void;
}) {
  const isVersion = mode === 'version';
  const form = useForm<Values>({
    resolver: zodResolver(isVersion ? versionSchema : replaceSchema),
    defaultValues: { changeLog: '', expiresAt: defaultExpiresAt },
  });

  const save = useMutation({
    mutationFn: async (values: Values) => {
      const formData = new FormData();
      formData.set('file', values.file);
      if (!isVersion) return unwrapAction(await replaceHseDraftFile(documentId, formData)) && null;
      formData.set('payload', JSON.stringify({ changeLog: values.changeLog, expiresAt: values.expiresAt }));
      return unwrapAction(await publishHseDocumentVersion(documentId, formData));
    },
    onSuccess: (result) => {
      toast.success(
        result
          ? `Versión ${result.version} publicada: ${result.pending} ${result.pending === 1 ? 'persona tiene' : 'personas tienen'} que aceptarla`
          : 'PDF del borrador reemplazado'
      );
      onDone();
    },
    onError: (error) => {
      logger.error('Error al subir el PDF del documento HSE', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo subir el PDF');
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isVersion ? 'Publicar una versión nueva' : 'Reemplazar el PDF del borrador'}</DialogTitle>
          <DialogDescription>
            {isVersion
              ? 'Todos los destinatarios vuelven a tenerlo pendiente y tienen que aceptar la versión nueva. Las aceptaciones anteriores quedan como historia.'
              : 'El borrador todavía no lo vio nadie: el archivo anterior se descarta.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
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
            {isVersion && (
              <>
                <TextareaFormField
                  control={form.control}
                  name="changeLog"
                  label="Qué cambió"
                  rows={3}
                  placeholder="Se agregó el uso obligatorio de arnés en tareas sobre 1,8 m"
                />
                <DateFormField control={form.control} name="expiresAt" label="Vence (opcional)" />
              </>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Subiendo…' : isVersion ? 'Publicar versión' : 'Reemplazar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
