'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { RemovalMode } from '../lib/catalog-rules';
import { ConfirmRemovalDialog } from './ConfirmRemovalDialog';

interface CatalogRowActionsProps<EditData> {
  /** Sustantivo en singular y minúscula, masculino ("depósito", "material"): arma los avisos. */
  noun: string;
  loggerName: string;
  canUpdate: boolean;
  canDelete: boolean;
  isActive: boolean;
  editQueryKey: readonly unknown[];
  /** Lee lo necesario para editar; lanza si el registro ya no existe. */
  loadEditData: () => Promise<EditData>;
  /** Consultas a invalidar tras baja o reactivación (además de refrescar la ruta). */
  invalidateKeys: readonly (readonly unknown[])[];
  removeRecord: () => Promise<ActionResult<{ mode: RemovalMode }>>;
  reactivateRecord: () => Promise<ActionResult<unknown>>;
  removalDescription: string;
  /** Diálogo de edición: se monta solo con los datos cargados; `key` lo remonta con cada lectura. */
  renderEditDialog: (args: {
    data: EditData;
    dialogKey: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => ReactNode;
  /** Identificador del registro, para armar la `key` del diálogo. */
  recordId: (data: EditData) => string;
}

/** Acciones por fila de una tabla del catálogo de Almacenes (editar, dar de baja, reactivar). */
export function CatalogRowActions<EditData>({
  noun,
  loggerName,
  canUpdate,
  canDelete,
  isActive,
  editQueryKey,
  loadEditData,
  invalidateKeys,
  removeRecord,
  reactivateRecord,
  removalDescription,
  renderEditDialog,
  recordId,
}: CatalogRowActionsProps<EditData>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logger = useMemo(() => new Logger(loggerName), [loggerName]);
  const label = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const {
    data: editData,
    isFetching: loadingEdit,
    dataUpdatedAt,
  } = useQuery({
    queryKey: editQueryKey,
    queryFn: loadEditData,
    enabled: editing,
    staleTime: 0,
  });

  const refresh = () => {
    for (const queryKey of invalidateKeys) queryClient.invalidateQueries({ queryKey });
    router.refresh();
  };

  const remove = useMutation({
    mutationFn: async () => unwrapAction(await removeRecord()),
    onSuccess: ({ mode }) => {
      toast.success(
        mode === 'delete' ? `${label} eliminado` : `${label} desactivado: ya no se ofrece en los movimientos`
      );
      setRemoving(false);
      refresh();
    },
    onError: (error) => {
      logger.error(`Error al dar de baja el ${noun}`, { data: { error } });
      toast.error(error instanceof Error ? error.message : `No se pudo dar de baja el ${noun}`);
    },
  });

  const reactivate = useMutation({
    mutationFn: async () => unwrapAction(await reactivateRecord()),
    onSuccess: () => {
      toast.success(`${label} reactivado`);
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : `No se pudo reactivar el ${noun}`),
  });

  if (!canUpdate && !canDelete) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones del ${noun}`}>
            {loadingEdit || reactivate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canUpdate && (
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
          )}
          {canUpdate && !isActive && (
            <DropdownMenuItem onSelect={() => reactivate.mutate()}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reactivar
            </DropdownMenuItem>
          )}
          {canDelete && isActive && (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setRemoving(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Dar de baja
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {editData &&
        !loadingEdit &&
        renderEditDialog({
          data: editData,
          // Se remonta con cada lectura: React Hook Form no toma defaultValues nuevos.
          dialogKey: `${recordId(editData)}-${dataUpdatedAt}`,
          open: editing,
          onOpenChange: setEditing,
        })}

      <ConfirmRemovalDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`¿Dar de baja el ${noun}?`}
        description={removalDescription}
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
