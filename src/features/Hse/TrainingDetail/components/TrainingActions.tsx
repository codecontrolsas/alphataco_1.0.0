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
import { Archive, Pencil, Send, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { archiveHseTraining, deleteHseTrainingDraft, publishHseTraining } from '../../actions/trainings.server';
import { HseTrainingFormDialog } from '../../components/HseTrainingFormDialog';
import { HSE_QUERY_KEYS, type HseTrainingStatus } from '../../lib/constants';
import type { HseTrainingFormInput } from '../../schemas/trainings';

const logger = new Logger('Hse/TrainingActions');

type Dialog = 'edit' | 'publish' | 'archive' | 'delete' | null;

/**
 * Acciones del detalle de una capacitación, cada una con su permiso: editar (`update`), publicar (`approve`), retirar
 * una publicada o borrar un borrador (`delete`). Las tres últimas piden confirmación. Publicar explica por qué no se
 * puede todavía (sin destinatarios, sin preguntas o preguntas sin respuesta correcta).
 */
export function TrainingActions({
  trainingId,
  title,
  status,
  formValues,
  publishBlocker,
  can,
}: {
  trainingId: string;
  title: string;
  status: HseTrainingStatus;
  formValues: HseTrainingFormInput;
  /** Por qué no se puede publicar todavía (o null si está lista). */
  publishBlocker: string | null;
  can: { update: boolean; approve: boolean; delete: boolean };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);

  const action = <T,>(run: () => Promise<ActionResult<T>>, onOk: (data: T) => void, message: string) => ({
    mutationFn: async () => unwrapAction(await run()),
    onSuccess: (data: T) => {
      void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
      setDialog(null);
      onOk(data);
    },
    onError: (error: unknown) => {
      logger.error(message, { data: { error } });
      toast.error(error instanceof Error ? error.message : message);
    },
  });

  const publish = useMutation(
    action(
      () => publishHseTraining(trainingId),
      (data) => {
        toast.success(
          data.assigned === 1
            ? 'Capacitación publicada: 1 persona la tiene pendiente'
            : `Capacitación publicada: ${data.assigned} personas la tienen pendiente`
        );
        router.refresh();
      },
      'No se pudo publicar la capacitación'
    )
  );
  const archive = useMutation(
    action(
      () => archiveHseTraining(trainingId),
      () => {
        toast.success('Capacitación retirada');
        router.refresh();
      },
      'No se pudo retirar la capacitación'
    )
  );
  const remove = useMutation(
    action(
      () => deleteHseTrainingDraft(trainingId),
      () => {
        toast.success('Borrador eliminado');
        router.push('/dashboard/hse?tab=capacitaciones');
      },
      'No se pudo borrar la capacitación'
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
      {can.delete && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-destructive sm:min-h-9"
          onClick={() => setDialog(isDraft ? 'delete' : 'archive')}
        >
          {isDraft ? (
            <Trash2 aria-hidden="true" className="mr-1 size-4" />
          ) : (
            <Archive aria-hidden="true" className="mr-1 size-4" />
          )}
          {isDraft ? 'Borrar borrador' : 'Retirar'}
        </Button>
      )}
      {can.approve && isDraft && (
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            className="min-h-11 sm:min-h-9"
            onClick={() => setDialog('publish')}
            disabled={publishBlocker !== null}
            aria-describedby={publishBlocker ? 'publish-blocker' : undefined}
          >
            <Send aria-hidden="true" className="mr-1 size-4" /> Publicar
          </Button>
          {publishBlocker && (
            <p id="publish-blocker" className="max-w-xs text-right text-xs text-muted-foreground text-pretty">
              {publishBlocker}
            </p>
          )}
        </div>
      )}

      {dialog === 'edit' && (
        <HseTrainingFormDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          mode={{ kind: 'edit', trainingId, values: formValues, published: status === 'published' }}
        />
      )}

      <AlertDialog open={dialog === 'publish'} onOpenChange={(open) => !open && !publish.isPending && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Publicar «{title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Cada destinatario la va a ver pendiente en su portal. Desde ese momento el examen (preguntas, opciones,
              respuestas correctas, porcentaje de aprobación, intentos y tiempo) y el material quedan congelados: para
              cambiarlos hay que retirarla y crear otra.
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

      <AlertDialog
        open={dialog === 'archive' || dialog === 'delete'}
        onOpenChange={(open) => !open && !archive.isPending && !remove.isPending && setDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog === 'delete' ? `¿Borrar el borrador «${title}»?` : `¿Retirar «${title}»?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog === 'delete'
                ? 'Se borran el material, las preguntas y los destinatarios. Nadie la vio todavía.'
                : 'Sale del portal y deja de pedirse. No se borra nada: los intentos y los resultados quedan como constancia. No se puede volver a publicar.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archive.isPending || remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (dialog === 'delete') remove.mutate();
                else archive.mutate();
              }}
              disabled={archive.isPending || remove.isPending}
            >
              {archive.isPending || remove.isPending ? 'Procesando…' : dialog === 'delete' ? 'Borrar' : 'Retirar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
