'use client';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { PasswordInput } from '@/features/Auth/components/PasswordInput';
import { respondHseDocument } from '@/features/Portal/actions/hse-documents.server';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const acceptSchema = z.object({
  read: z.literal(true, { errorMap: () => ({ message: 'Confirmá que leíste el documento.' }) }),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
});
const rejectSchema = z.object({
  reason: z.string().trim().min(5, 'Contá brevemente el motivo.').max(500, 'Máximo 500 caracteres.'),
});

/**
 * Respuesta del empleado: aceptar (con "leí y entendí" + contraseña, en UNA sola acción del servidor) o, como camino
 * secundario, no estar de acuerdo con un motivo. Los dos caminos en el mismo panel: nada de modales encadenados.
 */
export function HseRespondPanel({ ackId, title }: { ackId: string; title: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'accept' | 'reject'>('accept');
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const accept = useForm<z.infer<typeof acceptSchema>>({
    resolver: zodResolver(acceptSchema),
    defaultValues: { read: false as unknown as true, password: '' },
  });
  const reject = useForm<z.infer<typeof rejectSchema>>({
    resolver: zodResolver(rejectSchema),
    defaultValues: { reason: '' },
  });

  const finish = (status: 'accepted' | 'rejected') => {
    setDone(true);
    toast.success(
      status === 'accepted' ? 'Listo: quedó registrado que aceptaste el documento.' : 'Registramos tu respuesta.'
    );
    router.refresh();
  };

  const onAccept = (values: z.infer<typeof acceptSchema>) =>
    startTransition(async () => {
      const result = await respondHseDocument({ ackId, decision: 'accept', password: values.password });
      if (!result.ok) {
        accept.setError('root', { message: result.error });
        accept.setValue('password', '');
        return;
      }
      finish(result.data.status);
    });
  const onReject = (values: z.infer<typeof rejectSchema>) =>
    startTransition(async () => {
      const result = await respondHseDocument({ ackId, decision: 'reject', reason: values.reason });
      if (!result.ok) {
        reject.setError('root', { message: result.error });
        return;
      }
      finish(result.data.status);
    });

  const busy = isPending || done;

  return (
    <section aria-labelledby="doc-respond" className="bg-card space-y-4 rounded-xl border p-4">
      <h2 id="doc-respond" className="font-semibold">
        {mode === 'accept' ? 'Aceptar el documento' : 'No estoy de acuerdo'}
      </h2>

      {mode === 'accept' ? (
        <Form {...accept}>
          <form onSubmit={accept.handleSubmit(onAccept)} noValidate className="space-y-4">
            {accept.formState.errors.root?.message && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle className="line-clamp-none">{accept.formState.errors.root.message}</AlertTitle>
              </Alert>
            )}
            <FormField
              control={accept.control}
              name="read"
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
                      Leí y entendí «{title}» y me comprometo a cumplirlo.
                    </FormLabel>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={accept.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tu contraseña del portal</FormLabel>
                  <FormControl>
                    <PasswordInput {...field} autoComplete="current-password" />
                  </FormControl>
                  <p className="text-muted-foreground text-xs text-pretty">
                    Queda registrada la fecha, tu nombre, tu puesto y desde qué dispositivo aceptaste.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-2 sm:flex sm:items-center">
              <Button type="submit" className="min-h-11" disabled={busy} aria-busy={isPending}>
                {isPending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
                {isPending ? 'Registrando…' : 'Aceptar documento'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={busy}
                onClick={() => setMode('reject')}
              >
                No estoy de acuerdo
              </Button>
            </div>
          </form>
        </Form>
      ) : (
        <Form {...reject}>
          <form onSubmit={reject.handleSubmit(onReject)} noValidate className="space-y-4">
            {reject.formState.errors.root?.message && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle className="line-clamp-none">{reject.formState.errors.root.message}</AlertTitle>
              </Alert>
            )}
            <FormField
              control={reject.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>¿Por qué no estás de acuerdo?</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={4} placeholder="Contanos qué parte no entendés o no podés cumplir" />
                  </FormControl>
                  <p className="text-muted-foreground text-xs text-pretty">
                    Lo lee el área de HSE. Tu respuesta queda registrada y no se puede cambiar.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-2 sm:flex sm:items-center">
              <Button type="submit" variant="destructive" className="min-h-11" disabled={busy} aria-busy={isPending}>
                {isPending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
                {isPending ? 'Enviando…' : 'Enviar respuesta'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={busy}
                onClick={() => setMode('accept')}
              >
                Volver
              </Button>
            </div>
          </form>
        </Form>
      )}
    </section>
  );
}
