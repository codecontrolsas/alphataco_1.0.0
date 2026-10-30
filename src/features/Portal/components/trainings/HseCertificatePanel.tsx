'use client';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PasswordInput } from '@/features/Auth/components/PasswordInput';
import { deliverHsePdf } from '@/features/Hse/lib/pdf-delivery';
import { getMyHseCertificateUrl, signHseCertificate } from '@/features/Portal/actions/hse-certificates.server';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Download, FileSignature, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const signFormSchema = z.object({
  confirm: z.literal(true, { errorMap: () => ({ message: 'Confirmá que los datos son correctos.' }) }),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
});
type SignFormValues = z.infer<typeof signFormSchema>;

/**
 * Constancia de la aprobación vigente: firmarla (contraseña, en la misma acción del servidor) o descargarla. Panel en
 * línea, sin modales: se ve lo que se firma (capacitación, puntaje, nombre y legajo) antes de firmar.
 */
export function HseCertificatePanel({
  trainingTitle,
  attemptId,
  certificateId,
  signedAt,
  employeeName,
  employeeFile,
  scoreText,
}: {
  trainingTitle: string;
  attemptId: string;
  certificateId: string | null;
  signedAt: Date | null;
  employeeName: string;
  employeeFile: string | null;
  scoreText: string;
}) {
  const router = useRouter();
  const [isSigning, startSigning] = useTransition();
  const [isDownloading, startDownload] = useTransition();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [signed, setSigned] = useState<string | null>(null);

  const form = useForm<SignFormValues>({
    resolver: zodResolver(signFormSchema),
    defaultValues: { confirm: false as unknown as true, password: '' },
  });

  const download = (id: string) =>
    startDownload(async () => {
      setDownloadError(null);
      const result = await getMyHseCertificateUrl({ certificateId: id });
      if (!result.ok) {
        setDownloadError(result.error);
        return;
      }
      deliverHsePdf(result.data);
    });

  const onSign = (values: SignFormValues) =>
    startSigning(async () => {
      const result = await signHseCertificate({ attemptId, password: values.password });
      if (!result.ok) {
        form.setError('root', { message: result.error });
        form.setValue('password', '');
        return;
      }
      setSigned(result.data.certificateId);
      toast.success('Listo: firmaste tu constancia y quedó guardada en tu legajo.');
      router.refresh();
    });

  const currentId = certificateId ?? signed;

  if (currentId) {
    return (
      <section aria-labelledby="training-certificate" className="bg-card space-y-3 rounded-xl border p-4">
        <h2 id="training-certificate" className="flex items-center gap-2 font-semibold">
          <FileSignature aria-hidden="true" className="size-5" /> Tu constancia
        </h2>
        <p className="text-muted-foreground text-sm text-pretty">
          {signedAt ? `La firmaste el ${formatArgentinaDateTime(signedAt)}. ` : 'Ya la firmaste. '}
          Es un PDF generado por la empresa con tus datos, el resultado y tu firma.
        </p>
        {downloadError && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle className="line-clamp-none">{downloadError}</AlertTitle>
          </Alert>
        )}
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full sm:w-auto"
          disabled={isDownloading}
          aria-busy={isDownloading}
          onClick={() => download(currentId)}
        >
          {isDownloading ? (
            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {isDownloading ? 'Preparando…' : 'Descargar la constancia'}
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="training-certificate" className="bg-card space-y-4 rounded-xl border p-4">
      <div className="space-y-1">
        <h2 id="training-certificate" className="flex items-center gap-2 font-semibold">
          <FileSignature aria-hidden="true" className="size-5" /> Firmá tu constancia
        </h2>
        <p className="text-muted-foreground text-sm text-pretty">
          Con tu firma, la constancia queda en tu legajo como documentación de la empresa.
        </p>
      </div>
      <dl className="bg-muted/40 grid gap-2 rounded-lg p-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Capacitación</dt>
          <dd className="font-medium break-words">{trainingTitle}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Resultado</dt>
          <dd className="font-medium tabular-nums">{scoreText}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Nombre</dt>
          <dd className="font-medium break-words">{employeeName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Legajo</dt>
          <dd className="font-medium tabular-nums">{employeeFile ?? '—'}</dd>
        </div>
      </dl>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSign)} noValidate className="space-y-4">
          {form.formState.errors.root?.message && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle className="line-clamp-none">{form.formState.errors.root.message}</AlertTitle>
            </Alert>
          )}
          <FormField
            control={form.control}
            name="confirm"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-start gap-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value === true}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      className="mt-0.5 size-5"
                    />
                  </FormControl>
                  <FormLabel className="leading-snug font-normal">
                    Mis datos son correctos y firmo la constancia de esta capacitación.
                  </FormLabel>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tu contraseña del portal</FormLabel>
                <FormControl>
                  <PasswordInput {...field} autoComplete="current-password" className="h-11 md:h-10" />
                </FormControl>
                <p className="text-muted-foreground text-xs text-pretty">
                  Queda registrada la fecha y hora, tu nombre, tu puesto y desde qué dispositivo firmaste. La firma no
                  se puede cambiar.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={isSigning} aria-busy={isSigning}>
            {isSigning && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
            {isSigning ? 'Firmando…' : 'Firmar la constancia'}
          </Button>
        </form>
      </Form>
    </section>
  );
}
