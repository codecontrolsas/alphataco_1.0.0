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
import { LoadingSwap } from '@/components/ui/loading-swap';
import { CertificationAmount } from '@/features/Comercial/Certificaciones/components/CertificationAmount';
import moment from 'moment';
import { useState } from 'react';
import type { InvoiceView } from '../../actions/invoices.server';
import { countLabel } from '../../utils/invoice-links';

type Certification = InvoiceView['certifications'][number];

type Props = {
  certifications: Certification[];
  currency: string;
  canEdit: boolean;
  canViewPrices: boolean;
  /** Cantidad de líneas de cada certificación en el borrador (para decir qué se quita). */
  linesByCertification: Record<string, number>;
  /** Hay cambios sin guardar: se guardan antes de quitar (si no, se perderían al recargar). */
  isDirty: boolean;
  onRemove: (certificationId: string) => Promise<boolean>;
};

function formatPeriod(from: string | null, to: string | null): string {
  if (!from || !to) return '';
  return `${moment.utc(from).format('DD/MM')}–${moment.utc(to).format('DD/MM/YYYY')}`;
}

/**
 * Certificaciones que respaldan el borrador. Una certificación se quita COMPLETA (con todas sus
 * líneas) y queda libre para facturar: no es reversible desde acá, por eso se confirma.
 */
export function IncludedCertifications({
  certifications,
  currency,
  canEdit,
  canViewPrices,
  linesByCertification,
  isDirty,
  onRemove,
}: Props) {
  const [target, setTarget] = useState<Certification | null>(null);
  const [removing, setRemoving] = useState(false);

  if (certifications.length === 0) return null;

  const confirmRemove = async () => {
    if (!target) return;
    setRemoving(true);
    const ok = await onRemove(target.id);
    setRemoving(false);
    if (ok) setTarget(null);
  };

  const targetLines = target ? linesByCertification[target.id] ?? 0 : 0;

  return (
    <section aria-labelledby="invoice-certifications-title" className="flex flex-col gap-3">
      <h2 id="invoice-certifications-title" className="text-lg font-semibold">
        Certificaciones incluidas{' '}
        <span className="text-muted-foreground font-normal tabular-nums">({certifications.length})</span>
      </h2>
      <ul className="divide-y border">
        {certifications.map((cert) => (
          <li key={cert.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="font-medium tabular-nums">{cert.number}</span>
              <span className="text-muted-foreground text-sm tabular-nums">
                {formatPeriod(cert.periodFrom, cert.periodTo)}
                {' · '}
                {countLabel(linesByCertification[cert.id] ?? 0, 'línea', 'líneas')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {canViewPrices && (
                <span className="text-sm whitespace-nowrap">
                  <CertificationAmount value={cert.amount} currency={currency} />
                </span>
              )}
              {canEdit && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setTarget(cert)}>
                  Quitar de la factura
                  <span className="sr-only"> la certificación {cert.number}</span>
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog open={target !== null} onOpenChange={(open) => !removing && !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar {target?.number} de la factura?</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              Se quitan sus {countLabel(targetLines, 'línea', 'líneas')} y la certificación queda disponible para
              facturar.
              {isDirty && ' Antes se guardan los cambios del borrador.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <Button type="button" variant="outline" disabled={removing} onClick={() => void confirmRemove()}>
              <LoadingSwap isLoading={removing}>Quitar certificación</LoadingSwap>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
