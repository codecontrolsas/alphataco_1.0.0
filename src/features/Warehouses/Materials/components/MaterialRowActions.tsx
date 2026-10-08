'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Logger } from '@/lib/logger';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  getMaterialForEdit,
  getMaterialFormLookups,
  reactivateMaterial,
  removeMaterial,
} from '../../actions/catalog.server';
import { ConfirmRemovalDialog } from '../../components/ConfirmRemovalDialog';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';
import { MaterialFormDialog } from './MaterialFormDialog';

const logger = new Logger('Warehouses/MaterialRowActions');

export interface MaterialRowActionsProps {
  materialId: string;
  isActive: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

/** Acciones por fila de la tabla de materiales (editar, dar de baja, reactivar). */
export function MaterialRowActions({ materialId, isActive, canUpdate, canDelete }: MaterialRowActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const { data: editData, isFetching: loadingEdit, dataUpdatedAt } = useQuery({
    queryKey: ['warehouse-material-edit', materialId],
    queryFn: async () => {
      const [material, lookups] = await Promise.all([getMaterialForEdit(materialId), getMaterialFormLookups()]);
      if (!material) throw new Error('El material no existe');
      return { material, lookups };
    },
    enabled: editing,
    staleTime: 0,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.materials });
    queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.stock });
    router.refresh();
  };

  const remove = useMutation({
    mutationFn: async () => unwrapAction(await removeMaterial(materialId)),
    onSuccess: ({ mode }) => {
      toast.success(mode === 'delete' ? 'Material eliminado' : 'Material desactivado: ya no se ofrece en los movimientos');
      setRemoving(false);
      refresh();
    },
    onError: (error) => {
      logger.error('Error al dar de baja el material', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo dar de baja el material');
    },
  });

  const reactivate = useMutation({
    mutationFn: async () => unwrapAction(await reactivateMaterial(materialId)),
    onSuccess: () => {
      toast.success('Material reactivado');
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo reactivar el material'),
  });

  if (!canUpdate && !canDelete) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Acciones del material">
            {loadingEdit || reactivate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
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

      {editData && !loadingEdit && (
        <MaterialFormDialog
          // Se remonta con cada lectura: React Hook Form no toma defaultValues nuevos.
          key={`${editData.material.id}-${dataUpdatedAt}`}
          lookups={editData.lookups}
          material={editData.material}
          open={editing}
          onOpenChange={setEditing}
        />
      )}

      <ConfirmRemovalDialog
        open={removing}
        onOpenChange={setRemoving}
        title="¿Dar de baja el material?"
        description="Si ya tiene movimientos se desactiva (su historial se conserva y deja de ofrecerse en los formularios). Si nunca se usó, se elimina."
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
