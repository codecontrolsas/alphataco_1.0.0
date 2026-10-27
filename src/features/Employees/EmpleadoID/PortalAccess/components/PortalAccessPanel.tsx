'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Logger } from '@/lib/logger';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, KeyRound, Loader2, Mail, ShieldOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  disableEmployeePortalAccess,
  enableEmployeePortalAccess,
  type PortalAccessActionResult,
} from '../actions.server';
import type { EmployeePortalAccessOverview } from '../queries.server';
import { enablePortalAccessSchema, type EnablePortalAccessInput } from '../schemas/portal-access';

const logger = new Logger('Employees/PortalAccessPanel');

const METHOD_LABELS: Record<NonNullable<EmployeePortalAccessOverview['access']>['method'], string> = {
  invitation: 'Invitación por correo',
  temporary_password: 'Contraseña temporal',
  existing_account: 'Cuenta existente del sistema',
};

const EVENT_LABELS: Record<EmployeePortalAccessOverview['events'][number]['action'], string> = {
  enabled: 'Habilitó el portal',
  disabled: 'Deshabilitó el portal',
  invitation_sent: 'Envió una invitación',
  temporary_password_issued: 'Generó una contraseña temporal',
};

type SecretResult = Extract<PortalAccessActionResult, { success: true }>;

interface PortalAccessPanelProps {
  employeeId: string;
  overview: EmployeePortalAccessOverview;
}

/**
 * Sección "Portal" del legajo: estado del acceso, alta (invitación o contraseña temporal), reemisión, baja y bitácora.
 * Los datos los trae el Server Component; acá solo hay interacción. Tras cada acción se refresca la ruta.
 */
export function PortalAccessPanel({ employeeId, overview }: PortalAccessPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [secret, setSecret] = useState<SecretResult | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const { access, account } = overview;
  const enabled = access?.status === 'enabled';
  const canReissue = enabled && access.createdCredential;
  const canEnable = overview.canManage && overview.portalEnabled && overview.employeeActive;

  const form = useForm<EnablePortalAccessInput>({
    resolver: zodResolver(enablePortalAccessSchema),
    defaultValues: { employeeId, method: 'invitation', email: account?.email ?? overview.employeeEmail ?? '' },
  });

  const handleResult = (result: PortalAccessActionResult) => {
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    setSecret(result.temporaryPassword || result.activationUrl ? result : null);
    router.refresh();
  };

  const runEnable = (values: EnablePortalAccessInput) => {
    startTransition(async () => {
      try {
        handleResult(await enableEmployeePortalAccess(values));
      } catch (error) {
        logger.error('Error al habilitar el portal', { data: { error, employeeId } });
        toast.error('No se pudo habilitar el portal.');
      }
    });
  };

  const runDisable = () => {
    startTransition(async () => {
      try {
        handleResult(await disableEmployeePortalAccess(employeeId));
        setConfirmDisable(false);
      } catch (error) {
        logger.error('Error al deshabilitar el portal', { data: { error, employeeId } });
        toast.error('No se pudo deshabilitar el portal.');
      }
    });
  };

  return (
    <section aria-labelledby="portal-access-title" className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="portal-access-title" className="text-lg font-semibold">
            Portal del empleado
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">
            El empleado entra desde el celular a <span className="font-mono">/portal</span> y ve solo sus datos. Sin
            registro libre: el acceso lo da Recursos Humanos desde acá.
          </p>
        </div>
        <Badge variant={enabled ? 'success' : access ? 'secondary' : 'outline'}>
          {enabled ? 'Habilitado' : access ? 'Deshabilitado' : 'Sin acceso'}
        </Badge>
      </header>

      {!overview.portalEnabled && (
        <Alert>
          <AlertTitle>El portal está apagado en esta instancia</AlertTitle>
          <AlertDescription>Se puede consultar el estado, pero no habilitar accesos nuevos.</AlertDescription>
        </Alert>
      )}
      {!overview.employeeActive && (
        <Alert>
          <AlertTitle>Legajo dado de baja</AlertTitle>
          <AlertDescription>
            Un legajo inactivo no puede entrar al portal aunque tenga el acceso habilitado.
          </AlertDescription>
        </Alert>
      )}

      {access && (
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Usuario</dt>
            <dd className="truncate font-mono">{account?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vía de acceso</dt>
            <dd>{METHOD_LABELS[access.method]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{enabled ? 'Habilitado el' : 'Deshabilitado el'}</dt>
            <dd className="font-mono tabular-nums">
              {formatArgentinaDateTime(enabled ? access.grantedAt : access.revokedAt ?? access.grantedAt)}
            </dd>
          </div>
        </dl>
      )}

      <div role="status" aria-live="polite">
        {secret && <SecretCard result={secret} onDismiss={() => setSecret(null)} />}
      </div>

      {overview.canManage && enabled && (
        <div className="flex flex-wrap gap-2">
          {canReissue && (
            <>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={isPending}
                onClick={() => runEnable({ employeeId, method: 'invitation', email: '' })}
              >
                <Mail aria-hidden="true" /> Reenviar invitación
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={isPending}
                onClick={() => runEnable({ employeeId, method: 'temporary_password', email: '' })}
              >
                <KeyRound aria-hidden="true" /> Nueva contraseña temporal
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            disabled={isPending}
            onClick={() => setConfirmDisable(true)}
          >
            <ShieldOff aria-hidden="true" /> Deshabilitar portal
          </Button>
        </div>
      )}

      {canEnable && !enabled && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(runEnable)} className="max-w-xl space-y-5 rounded-lg border p-4">
            {account ? (
              <p className="text-sm text-pretty">
                El legajo ya tiene el usuario <span className="font-mono">{account.email}</span>. Se va a usar esa misma
                cuenta: el empleado entra con su contraseña de siempre.
              </p>
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>¿Cómo recibe el acceso?</FormLabel>
                      <FormControl>
                        <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-3">
                          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                            <RadioGroupItem value="invitation" className="mt-0.5" />
                            <span className="space-y-0.5">
                              <span className="block text-sm font-medium">Invitación por correo</span>
                              <span className="text-muted-foreground block text-sm">
                                Recibe un enlace de un solo uso (vence en 24 h) para elegir su contraseña.
                              </span>
                            </span>
                          </label>
                          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                            <RadioGroupItem value="temporary_password" className="mt-0.5" />
                            <span className="space-y-0.5">
                              <span className="block text-sm font-medium">Contraseña temporal</span>
                              <span className="text-muted-foreground block text-sm">
                                Para quien no usa el correo: se la entregás vos y la cambia al entrar.
                              </span>
                            </span>
                          </label>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo del empleado</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          inputMode="email"
                          autoComplete="off"
                          placeholder="nombre@correo.com"
                        />
                      </FormControl>
                      <FormDescription>Es el usuario con el que entra al portal.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
            <Button type="submit" className="min-h-11" disabled={isPending}>
              {isPending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
              {access ? 'Volver a habilitar el portal' : 'Habilitar portal'}
            </Button>
          </form>
        </Form>
      )}

      {!overview.canManage && !enabled && (
        <p className="text-muted-foreground text-sm">No tenés permiso para habilitar el portal a este empleado.</p>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Bitácora</h3>
        {overview.events.length === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no hubo movimientos en el acceso al portal.</p>
        ) : (
          <ol className="divide-y rounded-lg border text-sm">
            {overview.events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3">
                <span className="min-w-0">
                  <span className="font-medium">{event.performedBy}</span> {EVENT_LABELS[event.action].toLowerCase()}
                  {event.detail && <span className="text-muted-foreground"> · {event.detail}</span>}
                </span>
                <time dateTime={event.createdAt} className="text-muted-foreground font-mono text-xs tabular-nums">
                  {formatArgentinaDateTime(event.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </div>

      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Deshabilitar el portal?</AlertDialogTitle>
            <AlertDialogDescription>
              El empleado deja de poder entrar en su próximo acceso. Si su usuario es solo del portal, se cierran sus
              sesiones abiertas. Podés volver a habilitarlo cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                runDisable();
              }}
              disabled={isPending}
            >
              {isPending ? 'Deshabilitando…' : 'Deshabilitar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** La contraseña temporal o el enlace de activación se muestran UNA vez, para copiarlos y entregarlos. */
function SecretCard({ result, onDismiss }: { result: SecretResult; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const value = result.temporaryPassword ?? result.activationUrl ?? '';
  const isPassword = Boolean(result.temporaryPassword);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      toast.error('No se pudo copiar: seleccioná el texto a mano.');
    }
  };

  return (
    <Alert>
      <KeyRound aria-hidden="true" />
      <AlertTitle className="line-clamp-none">
        {isPassword ? 'Contraseña temporal' : 'Enlace de activación'} — se muestra una sola vez
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Usuario: <span className="font-mono">{result.loginEmail}</span>.{' '}
          {isPassword ? 'Al entrar le vamos a pedir que la cambie.' : 'Vence en 24 horas y sirve una sola vez.'}
        </p>
        <code className="bg-muted block rounded-md px-3 py-2 font-mono text-base break-all select-all">{value}</code>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={copy}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onDismiss}>
            Ya lo entregué
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
