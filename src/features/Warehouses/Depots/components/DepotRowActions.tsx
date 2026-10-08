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
import { getDepotForEdit, reactivateWarehouse, removeWarehouse } from '../../actions/catalog.server';
import { ConfirmRemovalDialog } from '../../components/ConfirmRemovalDialog';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { unwrapAction } from '../../lib/unwrap-action';
import { DepotFormDialog } from './DepotFormDialog';

const logger = new Logger('Warehouses/DepotRowActions');

export interface DepotRowActionsProps {
  warehouseId: string;
  isActive: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

/** Acciones por fila de la tabla de depositos (editar, dar de baja, reactivar). */
export function DepotRowActions({ warehouseId, isActive, canUpdate, canDelete }: DepotRowActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const { data: depot, isFetching: loadingEdit, dataUpdatedAt } = useQuery({
    queryKey: ['warehouse-depot-edit', warehouseId],
    queryFn: async () => {
      const found = await getDepotForEdit(warehouseId);
      if (!found) throw new Error('El depósito no existe');
      return found;
    },
    enabled: editing,
    staleTime: 0,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.depots });
    queryClient.invalidateQueries({ queryKey: WAREHOUSE_QUERY_KEYS.stock });
    router.refresh();
  };

  const remove = useMutation({
    mutationFn: async () => unwrapAction(await removeWarehouse(warehouseId)),
    onSuccess: ({ mode }) => {
      toast.success(mode === 'delete' ? 'Depósito eliminado' : 'Depósito desactivado: ya no se ofrece en los movimientos');
      setRemoving(false);
      refresh();
    },
    onError: (error) => {
      logger.error('Error al dar de baja el depósito', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo dar de baja el depósito');
    },
  });

  const reactivate = useMutation({
    mutationFn: async () => unwrapAction(await reactivateWarehouse(warehouseId)),
    onSuccess: () => {
      toast.success('Depósito reactivado');
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo reactivar el depósito'),
  });

  if (!canUpdate && !canDelete) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Acciones del depósito">
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

      {depot && !loadingEdit && (
        <DepotFormDialog key={`${depot.id}-${dataUpdatedAt}`} depot={depot} open={editing} onOpenChange={setEditing} />
      )}

      <ConfirmRemovalDialog
        open={removing}
        onOpenChange={setRemoving}
        title="¿Dar de baja el depósito?"
        description="Tiene que estar sin stock. Si tuvo movimientos se desactiva (su historial se conserva); si nunca se usó, se elimina."
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
