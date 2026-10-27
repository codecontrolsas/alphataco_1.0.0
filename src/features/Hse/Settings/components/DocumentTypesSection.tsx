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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Logger } from '@/lib/logger';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { TextareaFormField } from '@/shared/components/common/form-fields';
import { NameFormDialog } from '@/shared/components/common/name-catalog/NameFormDialog';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { HseDocumentTypeRow } from '../../actions/queries.server';
import { createHseDocumentType, deleteHseDocumentType, updateHseDocumentType } from '../../actions/types.server';
import { HSE_QUERY_KEYS } from '../../lib/constants';
import { hseDocumentTypeSchema, type HseDocumentTypeValues } from '../../schemas/documents';

const logger = new Logger('Hse/DocumentTypesSection');
const EMPTY: HseDocumentTypeValues = { name: '', description: '' };

/** Tipos de documento HSE. Un tipo con documentos no se borra: se desactiva (deja de ofrecerse al cargar). */
export function DocumentTypesSection({
  types,
  canCreate,
  canUpdate,
  canDelete,
}: {
  types: HseDocumentTypeRow[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<HseDocumentTypeRow | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HseDocumentTypeRow | null>(null);
  const form = useForm<HseDocumentTypeValues>({ resolver: zodResolver(hseDocumentTypeSchema), defaultValues: EMPTY });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
    router.refresh();
  };
  const openForm = (target: HseDocumentTypeRow | 'new') => {
    form.reset(target === 'new' ? EMPTY : { name: target.name, description: target.description ?? '' });
    setEditing(target);
  };
  const onError = (message: string) => (error: unknown) => {
    logger.error(message, { data: { error } });
    toast.error(error instanceof Error ? error.message : message);
  };

  const save = useMutation({
    mutationFn: async (values: HseDocumentTypeValues) =>
      unwrapAction(
        editing && editing !== 'new'
          ? await updateHseDocumentType(editing.id, { ...values, isActive: editing.isActive })
          : await createHseDocumentType(values)
      ),
    onSuccess: (_data, values) => {
      toast.success(editing === 'new' ? `Tipo «${values.name}» creado` : `Tipo «${values.name}» actualizado`);
      setEditing(null);
      refresh();
    },
    onError: onError('No se pudo guardar el tipo'),
  });
  const toggle = useMutation({
    mutationFn: async (type: HseDocumentTypeRow) =>
      unwrapAction(
        await updateHseDocumentType(type.id, {
          name: type.name,
          description: type.description ?? '',
          isActive: !type.isActive,
        })
      ),
    onSuccess: (_data, type) => {
      toast.success(type.isActive ? `«${type.name}» desactivado` : `«${type.name}» reactivado`);
      refresh();
    },
    onError: onError('No se pudo cambiar el tipo'),
  });
  const remove = useMutation({
    mutationFn: async (type: HseDocumentTypeRow) => unwrapAction(await deleteHseDocumentType(type.id)),
    onSuccess: (_data, type) => {
      toast.success(`«${type.name}» borrado`);
      setConfirmDelete(null);
      refresh();
    },
    onError: onError('No se pudo borrar el tipo'),
  });

  return (
    <SectionCard
      title="Tipos de documento"
      description="Clasifican los documentos HSE: normas, procedimientos, instructivos…"
      action={
        canCreate && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 sm:min-h-9"
            onClick={() => openForm('new')}
          >
            <Plus aria-hidden="true" className="mr-1 size-4" />
            Agregar
          </Button>
        )
      }
    >
      {types.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Todavía no hay tipos. Son opcionales: sirven para ordenar y filtrar los documentos.
        </p>
      ) : (
        <ul className="divide-y">
          {types.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={t.isActive ? 'truncate' : 'truncate text-muted-foreground'}>{t.name}</span>
                  {!t.isActive && <Badge variant="outline">Inactivo</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.documents === 1 ? '1 documento' : `${t.documents} documentos`}
                  {t.description ? ` · ${t.description}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                {canUpdate && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 sm:size-9"
                      aria-label={`Editar ${t.name}`}
                      onClick={() => openForm(t)}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 sm:size-9"
                      aria-label={t.isActive ? `Desactivar ${t.name}` : `Reactivar ${t.name}`}
                      onClick={() => toggle.mutate(t)}
                      disabled={toggle.isPending}
                    >
                      {t.isActive ? (
                        <Power aria-hidden="true" className="size-4" />
                      ) : (
                        <RotateCcw aria-hidden="true" className="size-4" />
                      )}
                    </Button>
                  </>
                )}
                {canDelete && t.documents === 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 sm:size-9"
                    aria-label={`Borrar ${t.name}`}
                    onClick={() => setConfirmDelete(t)}
                    disabled={remove.isPending}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <NameFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'Nuevo tipo de documento' : 'Editar tipo de documento'}
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
        placeholder="Procedimiento"
      >
        <TextareaFormField control={form.control} name="description" label="Descripción (opcional)" rows={2} />
      </NameFormDialog>

      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar el tipo «{confirmDelete?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>No tiene documentos. No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (confirmDelete) remove.mutate(confirmDelete);
              }}
              disabled={remove.isPending}
            >
              {remove.isPending ? 'Borrando…' : 'Borrar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
