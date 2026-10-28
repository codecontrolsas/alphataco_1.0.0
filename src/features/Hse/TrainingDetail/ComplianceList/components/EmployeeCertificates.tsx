'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, FileSignature } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
  const [reason, setReason] = useState('');
  const queryKey = [...HSE_QUERY_KEYS.trainingCompliance, trainingId, 'certificates', employeeId];
  const certificates = useQuery({
    queryKey,
    queryFn: () => fetchHseEmployeeCertificates(trainingId, employeeId),
    staleTime: 60 * 1000,
  });
  const voidMutation = useMutation({
    mutationFn: async (v: { id: string; reason: string }) =>
      unwrapAction(await voidHseCertificate(v.id, { reason: v.reason })),
    onSuccess: () => {
      toast.success('Constancia anulada');
      setVoiding(null);
      void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
    },
    onError: (error) => {
      logger.error('Error al anular la constancia', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo anular la constancia');
    },
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
                {certificates.data.canVoid && !c.voidedAt && voiding !== c.id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 sm:min-h-8"
                    onClick={() => {
                      setReason('');
                      setVoiding(c.id);
                    }}
                  >
                    <Ban aria-hidden="true" className="size-4" /> Anular
                  </Button>
                )}
              </div>
              {voiding === c.id && (
                // En línea, dentro del mismo diálogo: nada de un modal encima de otro.
                <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                  <p className="text-sm text-pretty">
                    La constancia no se borra: queda anulada con el motivo y su documento del legajo pasa a «Ya no
                    aplica». {employeeLabel} puede volver a firmar su aprobación vigente.
                  </p>
                  <Label htmlFor={`void-${c.id}`}>Motivo</Label>
                  <Textarea
                    id={`void-${c.id}`}
                    rows={2}
                    value={reason}
                    placeholder="Por qué se anula (queda registrado)"
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      disabled={reason.trim().length < 5 || voidMutation.isPending}
                      aria-busy={voidMutation.isPending}
                      onClick={() => voidMutation.mutate({ id: c.id, reason })}
                    >
                      {voidMutation.isPending ? 'Anulando…' : 'Confirmar anulación'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      disabled={voidMutation.isPending}
                      onClick={() => setVoiding(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
