'use client';

import { Button } from '@/components/ui/button';
import { Logger } from '@/lib/logger';
import { ConfirmReasonDialog } from '@/shared/components/common/ConfirmReasonDialog';
import { useQueryClient } from '@tanstack/react-query';
import { Ban, Lock, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HseRecordFormDialog } from '../../Records/components/HseRecordFormDialog';
import { closeHseRecord, deleteHseRecordDraft, voidHseRecord } from '../../actions/records.server';
import { HsePdfDownloadButton } from '../../components/HsePdfDownloadButton';
import { HSE_QUERY_KEYS } from '../../lib/constants';
import type { HseRecordCreateValues } from '../../schemas/records';

const logger = new Logger('Hse/RecordActions');

/** Acciones del acta según su estado y los permisos (`hse:actas:*`). */
export function RecordActions({
  recordId,
  number,
  status,
  formValues,
  closeBlocker,
  can,
}: {
  recordId: string;
  number: number;
  status: 'draft' | 'closed' | 'voided';
  formValues: HseRecordCreateValues;
  /** Qué falta para poder cerrar (mismas reglas que la base), o null. */
  closeBlocker: string | null;
  can: { update: boolean; approve: boolean; delete: boolean };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'edit' | 'close' | 'void' | 'delete' | null>(null);
  // El estado del acta (cabecera, insignia, acciones) lo arma el Server Component de la página: además de las listas de
  // React Query hay que volver a pedirlo, si no queda «Borrador» hasta recargar aunque la base ya la cerró o anuló.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
    router.refresh();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'draft' && can.update && (
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setDialog('edit')}>
          <Pencil aria-hidden="true" className="size-4" /> Editar datos
        </Button>
      )}
      {status === 'draft' && can.approve && (
        <Button
          type="button"
          className="min-h-11 sm:min-h-9"
          onClick={() => setDialog('close')}
          disabled={closeBlocker !== null}
          aria-describedby={closeBlocker ? 'record-close-blocker' : undefined}
        >
          <Lock aria-hidden="true" className="size-4" /> Cerrar el acta
        </Button>
      )}
      {status !== 'draft' && (
        <HsePdfDownloadButton
          kind="record"
          id={recordId}
          label="Descargar PDF"
          accessibleLabel={`Descargar el PDF del acta ${number}`}
        />
      )}
      {status === 'closed' && can.delete && (
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setDialog('void')}>
          <Ban aria-hidden="true" className="size-4" /> Anular
        </Button>
      )}
      {status === 'draft' && can.delete && (
        <Button type="button" variant="ghost" className="min-h-11 sm:min-h-9" onClick={() => setDialog('delete')}>
          <Trash2 aria-hidden="true" className="size-4" /> Borrar borrador
        </Button>
      )}
      {closeBlocker && status === 'draft' && can.approve && (
        <p id="record-close-blocker" className="text-muted-foreground w-full text-sm text-pretty">
          Para cerrar: {closeBlocker}
        </p>
      )}

      {dialog === 'edit' && (
        <HseRecordFormDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          mode={{ kind: 'edit', recordId, values: formValues }}
        />
      )}
      <ConfirmReasonDialog
        open={dialog === 'close'}
        onOpenChange={(open) => setDialog(open ? 'close' : null)}
        title={`¿Cerrar el acta ${number}?`}
        description="Se congelan los datos, los capacitadores y cada asistente con su resultado y su firma de este momento, con una huella que permite detectar cualquier alteración. Después no se puede editar: solo anular."
        confirmLabel="Cerrar el acta"
        pendingLabel="Cerrando…"
        run={() => closeHseRecord(recordId)}
        onDone={refresh}
        messages={{
          success: 'Acta cerrada. Ya podés descargar su PDF.',
          errorFallback: 'No se pudo cerrar el acta',
          logError: 'Error al cerrar el acta',
        }}
        logger={logger}
      />
      <ConfirmReasonDialog
        open={dialog === 'void'}
        onOpenChange={(open) => setDialog(open ? 'void' : null)}
        title={`¿Anular el acta ${number}?`}
        description="El acta no se borra: queda anulada, con el motivo y quién la anuló. Las constancias que firmaron los empleados no cambian."
        confirmLabel="Anular"
        pendingLabel="Anulando…"
        destructive
        motive={{ label: 'Motivo', placeholder: 'Por qué se anula (queda registrado)' }}
        run={(reason) => voidHseRecord(recordId, { reason })}
        onDone={refresh}
        messages={{ success: 'Acta anulada', errorFallback: 'No se pudo anular el acta', logError: 'Error al anular' }}
        logger={logger}
        resetOnClose
      />
      <ConfirmReasonDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => setDialog(open ? 'delete' : null)}
        title={`¿Borrar el borrador del acta ${number}?`}
        description="Se borran el borrador y su lista de asistentes. No afecta los resultados ni las constancias."
        confirmLabel="Borrar"
        pendingLabel="Borrando…"
        destructive
        run={async () => {
          const result = await deleteHseRecordDraft(recordId);
          if (result.ok) router.push('/dashboard/hse?tab=actas');
          return result;
        }}
        onDone={refresh}
        messages={{ success: 'Borrador borrado', errorFallback: 'No se pudo borrar', logError: 'Error al borrar' }}
        logger={logger}
      />
    </div>
  );
}
