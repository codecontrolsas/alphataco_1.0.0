'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { formatCuit } from '@/features/Documentacion/DetalleDocumento/lib/document-detail';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { Download, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { discardPendingArcaCsr, generateArcaCsr } from '../../actions/arca-credentials.server';
import { certificateAliasSchema, type ARCA_ENVIRONMENTS } from '../../schemas/fiscal-data';
import { CopyTextButton } from './CopyTextButton';

type ArcaEnvironment = (typeof ARCA_ENVIRONMENTS)[number];

const aliasFormSchema = z.object({ alias: certificateAliasSchema });
type AliasFormValues = z.infer<typeof aliasFormSchema>;

export type PendingCsr = { alias: string; createdAt: string; csrPem: string };

/** El CSR es público: se descarga armando el archivo en el navegador, sin pasar por el server. */
function downloadCsr(csrPem: string) {
  const url = URL.createObjectURL(new Blob([csrPem], { type: 'application/pkcs10' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'request.csr';
  link.click();
  URL.revokeObjectURL(url);
}

/** Resumen del paso 1 cuando hay una solicitud pendiente: descargar, copiar o descartar. */
export function PendingCsrSummary({
  environment,
  pending,
  canUpdate,
}: {
  environment: ArcaEnvironment;
  pending: PendingCsr;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [discarding, startDiscard] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const discard = () => {
    startDiscard(async () => {
      const result = await discardPendingArcaCsr(environment);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Solicitud descartada.');
      setConfirmOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-pretty">
        Solicitud generada el <span className="tabular-nums">{formatArgentinaDateTime(pending.createdAt)}</span> con el
        alias <code className="bg-muted px-1 font-mono text-xs">{pending.alias}</code>.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => downloadCsr(pending.csrPem)}>
          <Download aria-hidden />
          Descargar solicitud (.csr)
        </Button>
        <CopyTextButton
          value={pending.csrPem}
          label="Copiar solicitud"
          successMessage="Solicitud copiada al portapapeles."
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={!canUpdate || discarding}
          onClick={() => setConfirmOpen(true)}
        >
          Descartar solicitud
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !discarding && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar la solicitud?</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              Si ya la subiste a ARCA, el certificado que te devuelva no se va a poder cargar. El certificado vigente,
              si hay uno, sigue funcionando.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={discarding}>Cancelar</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={discarding} onClick={discard}>
              <LoadingSwap isLoading={discarding}>Descartar solicitud</LoadingSwap>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Paso 1: genera la clave (queda cifrada en el sistema) y el CSR. Si ya había una solicitud
 * pendiente, pide confirmar antes de reemplazarla.
 */
export function CsrRequestForm({
  environment,
  company,
  defaultAlias,
  hasPending,
  hasActive,
  canUpdate,
  secretsKeyConfigured,
  aliasFieldId,
  onGenerated,
}: {
  environment: ArcaEnvironment;
  company: { name: string; cuit: string };
  defaultAlias: string;
  hasPending: boolean;
  hasActive: boolean;
  canUpdate: boolean;
  secretsKeyConfigured: boolean;
  aliasFieldId: string;
  onGenerated: () => void;
}) {
  const router = useRouter();
  const [generating, startGenerate] = useTransition();
  const [replaceAlias, setReplaceAlias] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const form = useForm<AliasFormValues>({
    resolver: zodResolver(aliasFormSchema),
    defaultValues: { alias: defaultAlias },
  });

  const generate = (alias: string) => {
    setGenerateError(null);
    startGenerate(async () => {
      const result = await generateArcaCsr(environment, alias);
      if (!result.ok) {
        setGenerateError(result.error);
        return;
      }
      toast.success('Solicitud generada. Descargala y subila a ARCA.');
      setReplaceAlias(null);
      router.refresh();
      onGenerated();
    });
  };

  const onSubmit = (values: AliasFormValues) => {
    if (hasPending) {
      setReplaceAlias(values.alias);
      return;
    }
    generate(values.alias);
  };

  const disabled = !canUpdate || !secretsKeyConfigured || generating;
  const submitLabel = hasPending
    ? 'Generar otra solicitud'
    : hasActive
      ? 'Generar solicitud de renovación'
      : 'Generar solicitud';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm text-pretty">
        Generamos una clave privada que queda guardada cifrada en el sistema y una solicitud de certificado (CSR) para
        ARCA. La clave nunca se descarga.
      </p>

      {!secretsKeyConfigured && (
        <div
          role="note"
          className="text-destructive flex items-start gap-3 border border-destructive/30 px-4 py-3 text-sm"
        >
          <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Falta configurar la clave de cifrado del servidor (FISCAL_SECRETS_KEY). Pedíselo al administrador del
            sistema.
          </p>
        </div>
      )}

      {hasActive && (
        <p className="text-sm text-pretty">El certificado actual sigue funcionando hasta que cargues el nuevo.</p>
      )}

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Razón social</dt>
          <dd className="truncate" title={company.name}>
            {company.name}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">CUIT</dt>
          <dd className="tabular-nums">{formatCuit(company.cuit)}</dd>
        </div>
      </dl>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="alias"
            render={({ field }) => (
              // El id va en el contenedor (no en el input, que lo necesita FormLabel) para poder enfocarlo desde "Renovar certificado".
              <FormItem id={aliasFieldId} className="max-w-sm">
                <FormLabel>Alias del certificado</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono"
                    disabled={!canUpdate || generating}
                  />
                </FormControl>
                <FormDescription>Es el nombre con el que lo vas a ver en ARCA.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {generateError && (
            <p role="alert" className="text-destructive text-sm">
              {generateError}
            </p>
          )}
          <div>
            <Button type="submit" variant="brand" disabled={disabled}>
              <LoadingSwap isLoading={generating}>{generating ? 'Generando…' : submitLabel}</LoadingSwap>
            </Button>
          </div>
        </form>
      </Form>

      <AlertDialog open={replaceAlias !== null} onOpenChange={(open) => !open && !generating && setReplaceAlias(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reemplazar la solicitud pendiente?</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              La solicitud anterior deja de servir. Si ya la subiste a ARCA, el certificado que te devuelva no se va a
              poder cargar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generating}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="brand"
              disabled={generating}
              onClick={() => replaceAlias && generate(replaceAlias)}
            >
              <LoadingSwap isLoading={generating}>Generar otra solicitud</LoadingSwap>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
