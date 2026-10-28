'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Logger } from '@/lib/logger';
import { ConfirmReasonDialog } from '@/shared/components/common/ConfirmReasonDialog';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, FileSignature } from 'lucide-react';
import { useState } from 'react';
import { fetchHseEmployeeCertificates, voidHseCertificate } from '../../../actions/records.server';
import { HsePdfDownloadButton } from '../../../components/HsePdfDownloadButton';
import { HSE_QUERY_KEYS } from '../../../lib/constants';

const logger = new Logger('Hse/EmployeeCertificates');

/** Constancias firmadas de un empleado en la capacitación: descarga y anulación con motivo (no se borran). */
export function EmployeeCertificates({
  trainingId,
  employeeId,
  employeeLabel,
}: {
  trainingId: string;
  employeeId: string;
  employeeLabel: string;
}) {
  const queryClient = useQueryClient();
  const [voiding, setVoiding] = useState<string | null>(null);
  const queryKey = [...HSE_QUERY_KEYS.trainingCompliance, trainingId, 'certificates', employeeId];
  const certificates = useQuery({
    queryKey,
    queryFn: () => fetchHseEmployeeCertificates(trainingId, employeeId),
    staleTime: 60 * 1000,
  });

  return (
    <section aria-labelledby={`certificates-${employeeId}`} className="space-y-2">
      <h3 id={`certificates-${employeeId}`} className="flex items-center gap-2 font-medium">
        <FileSignature aria-hidden="true" className="size-4" /> Constancias firmadas
      </h3>
      {certificates.isLoading ? (
        <Skeleton className="h-14 w-full" aria-label="Cargando las constancias" />
      ) : certificates.isError || !certificates.data ? (
        <StateBlock
          variant="error"
          title="No se pudieron cargar las constancias"
          action={
            <Button type="button" variant="outline" onClick={() => void certificates.refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : certificates.data.certificates.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no firmó ninguna constancia de esta capacitación.</p>
      ) : (
        <ul className="space-y-2">
          {certificates.data.certificates.map((c) => (
            <li key={c.id} className="space-y-2 rounded-lg border p-3">
              <p className="text-sm tabular-nums">
                Firmada el {formatArgentinaDateTime(c.signedAt)}
                {c.validUntil ? ` · vigente hasta ${formatDateAr(c.validUntil)}` : ' · no vence'}
                {c.inEmployeeFile ? ' · en el legajo' : ''}
              </p>
              {c.voidedAt && (
                <p className="text-danger-subtle-foreground text-sm text-pretty">
                  Anulada el {formatArgentinaDateTime(c.voidedAt)}. Motivo: {c.voidReason}
                </p>
              )}
              <p className="text-muted-foreground font-mono text-xs break-all">Huella: {c.sha256}</p>
              <div className="flex flex-wrap gap-2">
                <HsePdfDownloadButton
                  kind="certificate"
                  id={c.id}
                  label="Descargar"
                  size="sm"
                  accessibleLabel={`Descargar la constancia de ${employeeLabel}`}
                />
                {certificates.data.canVoid && !c.voidedAt && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 sm:min-h-8"
                    onClick={() => setVoiding(c.id)}
                  >
                    <Ban aria-hidden="true" className="size-4" /> Anular
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmReasonDialog
        open={voiding !== null}
        onOpenChange={(open) => !open && setVoiding(null)}
        title="¿Anular la constancia?"
        description={`La constancia de ${employeeLabel} no se borra: queda anulada con el motivo, y su documento del legajo pasa a "Ya no aplica". El empleado puede volver a firmar su aprobación vigente.`}
        confirmLabel="Anular"
        pendingLabel="Anulando…"
        destructive
        motive={{ label: 'Motivo', placeholder: 'Por qué se anula (queda registrado)' }}
        run={(reason) => voidHseCertificate(voiding ?? '', { reason })}
        onDone={() => void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all })}
        messages={{
          success: 'Constancia anulada',
          errorFallback: 'No se pudo anular la constancia',
          logError: 'Error al anular la constancia',
        }}
        logger={logger}
        resetOnClose
      />
    </section>
  );
}
