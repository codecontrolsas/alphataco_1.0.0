'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MAX_DOCUMENT_FILE_BYTES } from '@/features/Documentacion/shared/lib/document-file-rules';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2 } from 'lucide-react';
import moment from 'moment';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { submitExternalDocument, type ExternalUploadContext } from '../../actions/external-upload';

const schema = z.object({
  uploaderName: z.string().trim().min(3, 'Indicá tu nombre o el de tu estudio'),
  kind: z.enum(['Persona', 'Equipos']),
  identifier: z.string().trim().min(3, 'Indicá el CUIL/DNI o el dominio'),
  documentTypeId: z.string().min(1, 'Elegí el tipo de documento'),
  validity: z.string(),
  period: z.string(),
  file: z
    .instanceof(File, { message: 'Elegí el archivo' })
    .nullable()
    .refine((f) => f !== null, 'Elegí el archivo'),
});
type Values = z.infer<typeof schema>;

/**
 * Formulario público de carga externa: quien sube no es usuario, así que identifica a la persona o al equipo por su
 * CUIL/DNI o dominio. El documento queda en la bandeja de la empresa hasta que alguien lo valide.
 */
export function ExternalUploadForm({ token, context }: { token: string; context: ExternalUploadContext }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      uploaderName: '',
      kind: context.kinds[0].kind,
      identifier: '',
      documentTypeId: '',
      validity: '',
      period: '',
      file: null,
    },
  });
  const kind = form.watch('kind');
  const types = context.kinds.find((k) => k.kind === kind)?.types ?? [];
  const type = types.find((t) => t.id === form.watch('documentTypeId'));

  async function onSubmit(values: Values) {
    setError(null);
    if (type?.hasExpiry && !values.validity)
      return form.setError('validity', { message: 'Este documento vence: indicá la fecha' });
    if (type?.monthly && !/^\d{4}-(0[1-9]|1[0-2])$/.test(values.period)) {
      return form.setError('period', { message: 'Indicá el período como AAAA-MM' });
    }
    const fd = new FormData();
    fd.append('token', token);
    fd.append('uploaderName', values.uploaderName);
    fd.append('kind', values.kind);
    fd.append('identifier', values.identifier);
    fd.append('documentTypeId', values.documentTypeId);
    if (type?.hasExpiry) fd.append('validity', values.validity);
    if (type?.monthly) fd.append('period', values.period);
    if (values.file!.size > MAX_DOCUMENT_FILE_BYTES) {
      return form.setError('file', { message: 'El archivo supera los 10 MB' });
    }
    fd.append('file', values.file!);
    try {
      const result = await submitExternalDocument(fd);
      if (!result.ok) return setError(result.error);
    } catch {
      return setError('No se pudo enviar el documento. Revisá tu conexión e intentá de nuevo.');
    }
    setSent(true);
    form.reset({ ...values, identifier: '', documentTypeId: '', validity: '', period: '', file: null });
  }

  return (
    <div className="space-y-4">
      {sent && (
        <Alert variant="success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Documento recibido</AlertTitle>
          <AlertDescription>{context.companyName} lo va a revisar y validar. Podés cargar otro.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="uploaderName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tu nombre o el de tu estudio</FormLabel>
                <FormControl>
                  <Input autoComplete="organization" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {context.kinds.length > 1 && (
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>El documento es de</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      form.setValue('documentTypeId', '');
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Persona">Una persona</SelectItem>
                      <SelectItem value="Equipos">Un vehículo o equipo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="identifier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {kind === 'Persona' ? 'CUIL o DNI de la persona' : 'Dominio o número interno del equipo'}
                </FormLabel>
                <FormControl>
                  <Input {...field} inputMode={kind === 'Persona' ? 'numeric' : 'text'} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="documentTypeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de documento</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Elegí el tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {types.map((t) => (
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
          {type?.hasExpiry && (
            <FormField
              control={form.control}
              name="validity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vence el</FormLabel>
                  <FormControl>
                    <EnhancedDatePicker
                      date={field.value ? moment(field.value, 'YYYY-MM-DD').toDate() : undefined}
                      setDate={(d) => field.onChange(d ? moment(d).format('YYYY-MM-DD') : '')}
                      placeholder="DD/MM/AAAA"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {type?.monthly && (
            <FormField
              control={form.control}
              name="period"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Período</FormLabel>
                  <FormControl>
                    <Input placeholder="2026-11" {...field} />
                  </FormControl>
                  <FormDescription>Año y mes, por ejemplo 2026-11.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="file"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Archivo (PDF o imagen, hasta 10 MB)</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    onChange={(e) => field.onChange(e.target.files?.[0] ?? null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Enviar documento
          </Button>
        </form>
      </Form>
    </div>
  );
}
