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
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { reactivateSupplier, removeSupplier } from '../../actions/suppliers.server';
import { PURCHASES_QUERY_KEYS } from '../../lib/query-keys';

interface Props {
  supplierId: string;
  name: string;
  isActive: boolean;
  canDelete: boolean;
  canUpdate: boolean;
}

/** Baja (borra si no tiene uso; si no, desactiva) y reactivacion del proveedor. */
export function SupplierStatusActions({ supplierId, name, isActive, canDelete, canUpdate }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: async () => unwrapAction(await removeSupplier(supplierId)),
    onSuccess: ({ mode }) => {
      void queryClient.invalidateQueries({ queryKey: PURCHASES_QUERY_KEYS.suppliers });
      if (mode === 'delete') {
        toast.success(`${name} eliminado`);
        router.push('/dashboard/purchases?tab=proveedores');
      } else {
        toast.success(`${name} desactivado: tiene solicitudes o documentos`);
        setConfirming(false);
        router.refresh();
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo dar de baja el proveedor'),
  });

  const reactivate = useMutation({
    mutationFn: async () => unwrapAction(await reactivateSupplier(supplierId)),
    onSuccess: () => {
      toast.success(`${name} reactivado`);
      void queryClient.invalidateQueries({ queryKey: PURCHASES_QUERY_KEYS.suppliers });
      router.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo reactivar el proveedor'),
  });

  if (!isActive) {
    return canUpdate ? (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => reactivate.mutate()}
        disabled={reactivate.isPending}
      >
        <RotateCcw className="mr-1 h-4 w-4" />
        Reactivar
      </Button>
    ) : null;
  }
  if (!canDelete) return null;

  return (
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="mr-1 h-4 w-4" />
        Dar de baja
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Dar de baja a {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Si tiene solicitudes o documentos se desactiva y deja de ofrecerse como proveedor sugerido; si no, se
            elimina.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              remove.mutate();
            }}
          >
            {remove.isPending ? 'Procesando…' : 'Dar de baja'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
