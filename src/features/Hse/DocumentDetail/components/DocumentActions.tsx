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
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, FilePlus2, FileUp, Pencil, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { archiveHseDocument, publishHseDocument } from '../../actions/documents.server';
import { HseDocumentFormDialog } from '../../components/HseDocumentFormDialog';
import { HSE_QUERY_KEYS, type HseDocumentStatus } from '../../lib/constants';
import type { HseDocumentFormValues } from '../../schemas/documents';
import { PdfVersionDialog } from './PdfVersionDialog';

const logger = new Logger('Hse/DocumentActions');

type Dialog = 'edit' | 'replace' | 'version' | 'publish' | 'archive' | null;

/**
 * Acciones del detalle, cada una con su permiso: editar y reemplazar el PDF del borrador (`update`), publicar y
 * publicar versión nueva (`approve`), retirar (`delete`). Publicar y retirar piden confirmación.
 */
export function DocumentActions({
  documentId,
  title,
  status,
  formValues,
  hasTargets,
  can,
}: {
  documentId: string;
  title: string;
  status: HseDocumentStatus;
  formValues: HseDocumentFormValues;
  hasTargets: boolean;
  can: { update: boolean; approve: boolean; delete: boolean };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
    setDialog(null);
    router.refresh();
  };
  const action = <T,>(run: () => Promise<ActionResult<T>>, onOk: (data: T) => void, message: string) => ({
    mutationFn: async () => unwrapAction(await run()),
    onSuccess: (data: T) => {
      onOk(data);
      done();
    },
    onError: (error: unknown) => {
      logger.error(message, { data: { error } });
      toast.error(error instanceof Error ? error.message : message);
    },
  });

  const publish = useMutation(
    action(
      () => publishHseDocument(documentId),
      (data) =>
        toast.success(
          data.pending === 1
            ? 'Documento publicado: 1 persona lo tiene pendiente de aceptar'
            : `Documento publicado: ${data.pending} personas lo tienen pendiente de aceptar`
        ),
      'No se pudo publicar el documento'
    )
  );
  const archive = useMutation(
    action(
      () => archiveHseDocument(documentId),
      () => toast.success('Documento retirado'),
      'No se pudo retirar el documento'
    )
  );

  if (status === 'archived') return null;
  const isDraft = status === 'draft';

  return (
    <>
      {can.update && (
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setDialog('edit')}>
          <Pencil aria-hidden="true" className="mr-1 size-4" /> Editar
        </Button>
      )}
      {can.update && isDraft && (
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setDialog('replace')}>
          <FileUp aria-hidden="true" className="mr-1 size-4" /> Reemplazar PDF
        </Button>
      )}
      {can.approve && !isDraft && (
        <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setDialog('version')}>
          <FilePlus2 aria-hidden="true" className="mr-1 size-4" /> Nueva versión
        </Button>
      )}
      {can.delete && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-destructive sm:min-h-9"
          onClick={() => setDialog('archive')}
        >
          <Archive aria-hidden="true" className="mr-1 size-4" /> Retirar
        </Button>
      )}
      {can.approve && isDraft && (
        <Button
          type="button"
          className="min-h-11 sm:min-h-9"
          onClick={() => setDialog('publish')}
          disabled={!hasTargets}
          title={hasTargets ? undefined : 'Elegí a quién aplica antes de publicar'}
        >
          <Send aria-hidden="true" className="mr-1 size-4" /> Publicar
        </Button>
      )}

      {dialog === 'edit' && (
        <HseDocumentFormDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          mode={{ kind: 'edit', documentId, values: formValues, published: status === 'published' }}
        />
      )}
      {(dialog === 'replace' || dialog === 'version') && (
        <PdfVersionDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          documentId={documentId}
          mode={dialog === 'replace' ? 'replace' : 'version'}
          defaultExpiresAt={formValues.expiresAt ?? ''}
          onDone={done}
        />
      )}

      <AlertDialog open={dialog === 'publish'} onOpenChange={(open) => !open && !publish.isPending && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Publicar «{title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Cada destinatario lo va a ver pendiente en su portal y va a tener que aceptarlo con su contraseña. Después
              de publicado, el PDF no se reemplaza: los cambios van en una versión nueva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publish.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                publish.mutate();
              }}
              disabled={publish.isPending}
            >
              {publish.isPending ? 'Publicando…' : 'Publicar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === 'archive'} onOpenChange={(open) => !open && !archive.isPending && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Retirar «{title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de pedirse y sale del portal. No se borra nada: las versiones y las aceptaciones quedan como
              constancia. No se puede volver a publicar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archive.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                archive.mutate();
              }}
              disabled={archive.isPending}
            >
              {archive.isPending ? 'Retirando…' : 'Retirar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
