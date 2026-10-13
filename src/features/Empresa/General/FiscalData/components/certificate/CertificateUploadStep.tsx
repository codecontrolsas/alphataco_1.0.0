'use client';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, Loader2, Upload } from 'lucide-react';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type DragEvent } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { uploadArcaCertificate } from '../../actions/arca-credentials.server';
import type { ARCA_ENVIRONMENTS } from '../../schemas/fiscal-data';

/** Un certificado PEM pesa ~2 KB; esto solo frena archivos que claramente no lo son. */
const MAX_CERTIFICATE_BYTES = 64 * 1024;

const pasteSchema = z.object({
  pem: z.string().trim().min(1, 'Pegá el contenido del certificado'),
});
type PasteValues = z.infer<typeof pasteSchema>;

/**
 * Paso 3: carga del `.crt` que devolvió ARCA. El archivo se lee como texto en el navegador y se
 * manda el PEM: la validación (que corresponda a la solicitud, CUIT, vigencia, ambiente) es del
 * server, y sus errores se muestran debajo del drop zone.
 */
export function CertificateUploadStep({
  environment,
  canUpdate,
  onUploaded,
}: {
  environment: (typeof ARCA_ENVIRONMENTS)[number];
  canUpdate: boolean;
  onUploaded: () => void;
}) {
  const router = useRouter();
  const [uploading, startUpload] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hintId = `cert-upload-hint-${environment}`;
  const errorId = `cert-upload-error-${environment}`;
  const describedBy = error ? `${hintId} ${errorId}` : hintId;
  const disabled = !canUpdate || uploading;

  const pasteForm = useForm<PasteValues>({
    resolver: zodResolver(pasteSchema),
    defaultValues: { pem: '' },
  });

  const upload = (pem: string) => {
    setError(null);
    startUpload(async () => {
      const result = await uploadArcaCertificate(environment, pem);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Certificado cargado. Vence el ${moment(result.data.notAfter).format('DD/MM/YYYY')}.`);
      pasteForm.reset();
      router.refresh();
      onUploaded();
    });
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_CERTIFICATE_BYTES) {
      setError('El archivo es demasiado grande para ser un certificado. Elegí el .crt que te devolvió ARCA.');
      return;
    }
    upload(await file.text());
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    void readFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          'flex flex-col items-center gap-2 border-2 border-dashed p-6 text-center transition-colors',
          isDragging && 'border-brand bg-brand/5',
          disabled && 'pointer-events-none opacity-50',
          error && !isDragging && 'border-destructive/50'
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        {uploading ? (
          <Loader2 className="text-muted-foreground size-8 animate-spin" aria-hidden />
        ) : (
          <Upload className={cn('size-8', isDragging ? 'text-brand-ink' : 'text-muted-foreground')} aria-hidden />
        )}
        <p className="text-sm">
          {uploading
            ? 'Cargando certificado…'
            : isDragging
              ? 'Soltá el archivo acá'
              : 'Arrastrá el archivo .crt o elegilo.'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-describedby={describedBy}
          onClick={() => fileInputRef.current?.click()}
        >
          Elegir archivo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".crt,.pem,.cer"
          className="hidden"
          aria-describedby={describedBy}
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Se limpia para que volver a elegir el mismo archivo dispare `change`.
            event.target.value = '';
            void readFile(file);
          }}
        />
        <p id={hintId} className="text-muted-foreground text-xs">
          Formatos .crt, .pem o .cer (el certificado en texto, como lo descargás de ARCA).
        </p>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-destructive text-sm text-pretty">
          {error}
        </p>
      )}

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="link" size="sm" className="group h-auto w-fit px-0">
            Pegar el contenido
            <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" aria-hidden />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <Form {...pasteForm}>
            <form onSubmit={pasteForm.handleSubmit((values) => upload(values.pem))} className="flex flex-col gap-3">
              <FormField
                control={pasteForm.control}
                name="pem"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contenido del certificado</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={8}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder={'-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----'}
                        className="font-mono text-xs"
                        disabled={disabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                <Button type="submit" variant="brand" disabled={disabled}>
                  <LoadingSwap isLoading={uploading}>Cargar certificado</LoadingSwap>
                </Button>
              </div>
            </form>
          </Form>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
