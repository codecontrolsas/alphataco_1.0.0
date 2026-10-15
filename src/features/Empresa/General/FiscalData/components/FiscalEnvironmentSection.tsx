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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { LoadingSwap } from '@/components/ui/loading-swap';
import { formatCuit } from '@/features/Documentacion/DetalleDocumento/lib/document-detail';
import { normalizeCuit } from '@/features/Empresa/General/lib/company-form';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { setFiscalEnvironment } from '../actions/fiscal-data.server';
import type { ARCA_ENVIRONMENTS } from '../schemas/fiscal-data';
import { FiscalSection } from './FiscalSection';

const confirmProductionSchema = z.object({
  accepted: z.boolean(),
  cuit: z.string(),
});

type ConfirmProductionValues = z.infer<typeof confirmProductionSchema>;

type Props = {
  environment: (typeof ARCA_ENVIRONMENTS)[number];
  environmentChangedAt: string | null;
  productionBlockers: string[];
  /** CUIT normalizado (11 dígitos) de la empresa: se compara contra lo que se tipea. */
  companyCuit: string;
  canUpdate: boolean;
};

/**
 * Ambiente con el que se emite. Pasar a producción es la única acción con fricción alta de la
 * página (checkbox + tipear el CUIT): desde ahí cada comprobante tiene validez fiscal.
 */
export function FiscalEnvironmentSection({
  environment,
  environmentChangedAt,
  productionBlockers,
  companyCuit,
  canUpdate,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [productionOpen, setProductionOpen] = useState(false);
  const [homologationOpen, setHomologationOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const form = useForm<ConfirmProductionValues>({
    resolver: zodResolver(confirmProductionSchema),
    defaultValues: { accepted: false, cuit: '' },
  });
  const accepted = form.watch('accepted');
  const typedCuit = form.watch('cuit');
  const cuitMatches = normalizeCuit(typedCuit) === companyCuit;
  const canConfirm = accepted && cuitMatches;

  const isProduction = environment === 'produccion';
  const productionBlocked = productionBlockers.length > 0;
  const blockersId = 'fiscal-production-blockers';

  const closeProductionDialog = (open: boolean) => {
    // Mientras corre el cambio, el diálogo no se cierra (ni con Esc ni con Cancelar).
    if (pending) return;
    setProductionOpen(open);
    if (!open) {
      form.reset();
      setConfirmError(null);
    }
  };

  const onConfirmProduction = (values: ConfirmProductionValues) => {
    if (!values.accepted || normalizeCuit(values.cuit) !== companyCuit) return;
    startTransition(async () => {
      const result = await setFiscalEnvironment('produccion', values.cuit);
      if (!result.ok) {
        setConfirmError(result.error);
        return;
      }
      toast.success('Ambiente cambiado a producción.');
      setProductionOpen(false);
      form.reset();
      router.refresh();
    });
  };

  const onBackToHomologation = () => {
    startTransition(async () => {
      const result = await setFiscalEnvironment('homologacion');
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Ambiente cambiado a homologación.');
      setHomologationOpen(false);
      router.refresh();
    });
  };

  return (
    <FiscalSection
      id="ambiente"
      title="Ambiente"
      description="El ambiente activo es el que se usa al emitir. Cada ambiente tiene su propio certificado."
    >
      <div className="flex flex-col gap-1">
        <p>
          Ambiente activo: <strong>{isProduction ? 'Producción' : 'Homologación'}</strong>{' '}
          <span className="text-muted-foreground">
            {isProduction ? '(los comprobantes tienen validez fiscal)' : '(pruebas, sin validez fiscal)'}
          </span>
        </p>
        {environmentChangedAt && (
          <p className="text-muted-foreground text-sm tabular-nums">
            Último cambio: {formatArgentinaDateTime(environmentChangedAt)}
          </p>
        )}
      </div>

      {isProduction ? (
        <div>
          <Button type="button" variant="outline" disabled={!canUpdate} onClick={() => setHomologationOpen(true)}>
            Volver a homologación
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            {/* aria-disabled (no disabled): el botón sigue enfocable y la lista de abajo explica por qué no anda. */}
            <Button
              type="button"
              variant="outline"
              aria-disabled={!canUpdate || productionBlocked}
              aria-describedby={productionBlocked ? blockersId : undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              onClick={() => {
                if (!canUpdate || productionBlocked) return;
                setProductionOpen(true);
              }}
            >
              Pasar a producción
            </Button>
          </div>
          {productionBlocked && (
            <div id={blockersId} className="flex flex-col gap-1 text-sm">
              <p className="text-muted-foreground">Para pasar a producción falta:</p>
              <ul className="list-disc pl-5">
                {productionBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Pasar a producción: fricción alta y proporcional ── */}
      <AlertDialog open={productionOpen} onOpenChange={closeProductionDialog}>
        <AlertDialogContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onConfirmProduction)} className="flex flex-col gap-4">
              <AlertDialogHeader>
                <AlertDialogTitle>¿Pasar a producción?</AlertDialogTitle>
                <AlertDialogDescription className="text-pretty">
                  Desde ahora cada factura que emitas se informa a ARCA con validez fiscal y no se puede borrar: solo se
                  corrige con nota de crédito. Los comprobantes de homologación quedan en el listado marcados como
                  Prueba.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <FormField
                control={form.control}
                name="accepted"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                        disabled={pending}
                      />
                    </FormControl>
                    <FormLabel className="leading-snug font-normal">
                      Entiendo que los comprobantes emitidos en producción tienen validez fiscal.
                    </FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cuit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Escribí el CUIT de la empresa para confirmar</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        inputMode="numeric"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={formatCuit(companyCuit)}
                        className="tabular-nums"
                        disabled={pending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {!canConfirm && (
                <p className="text-muted-foreground text-xs">
                  Tildá la casilla y escribí el CUIT para habilitar el botón.
                </p>
              )}
              {confirmError && (
                <p role="alert" className="text-destructive text-sm">
                  {confirmError}
                </p>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
                {/* Botón común (no AlertDialogAction): Action cierra el diálogo antes de que termine el cambio. */}
                <Button type="submit" disabled={!canConfirm || pending}>
                  <LoadingSwap isLoading={pending}>Pasar a producción</LoadingSwap>
                </Button>
              </AlertDialogFooter>
            </form>
          </Form>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Volver a homologación: confirmación liviana ── */}
      <AlertDialog open={homologationOpen} onOpenChange={(open) => !pending && setHomologationOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Volver a homologación?</AlertDialogTitle>
            <AlertDialogDescription>
              Las facturas que emitas van a ser de prueba. Los borradores no cambian.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                onBackToHomologation();
              }}
            >
              <LoadingSwap isLoading={pending}>Volver a homologación</LoadingSwap>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FiscalSection>
  );
}
