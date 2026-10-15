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
import { invalidateAllMaintenanceQueries } from '@/features/Mantenimiento/utils/queryInvalidation';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { CatalogCreateButton, CatalogFormSheet, useCatalogSheet } from '@/shared/components/common/CatalogFormSheet';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { RepairTypeFormFields } from './RepairTypeFormFields';
import { RepairTypesTable } from './RepairTypesTable';
import { deleteTypeOfRepair } from './actions/actions';
import type { RepairTypeRow } from './repair-type-columns';

/**
 * Tipos de reparación: tabla a ancho completo; alta y edición en un Sheet (`RepairTypeFormFields`)
 * y baja desde la fila, con su confirmación fuera del Sheet.
 */
export function RepairTypesView({ types_of_repairs }: { types_of_repairs: RepairTypeRow[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();

  const canCreate = hasPermission('configuracion', 'type_of_repair', 'create');
  const canUpdate = hasPermission('configuracion', 'type_of_repair', 'update');
  const canDelete = hasPermission('configuracion', 'type_of_repair', 'delete');

  const sheet = useCatalogSheet<RepairTypeRow>({ canCreate, canUpdate });

  const [pendingDelete, setPendingDelete] = useState<RepairTypeRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const onDelete = async (id: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteTypeOfRepair(id);
      if (!result.ok) throw new Error(result.error);
      toast.success('Tipo de reparación eliminado con éxito');
      setPendingDelete(null);
      invalidateAllMaintenanceQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['repair-type-sectors'] });
      queryClient.invalidateQueries({ queryKey: ['datatable-facet'] });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Hubo un error al eliminar el tipo de reparación');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <RepairTypesTable
        rows={types_of_repairs}
        onEdit={sheet.openEdit}
        canEdit={canUpdate}
        onDelete={canDelete ? setPendingDelete : undefined}
        toolbarActions={<CatalogCreateButton sheet={sheet} label="Nuevo tipo de reparación" />}
      />
      <CatalogFormSheet
        sheet={sheet}
        getKey={(repair) => repair.id}
        title={{ create: 'Nuevo tipo de reparación', edit: 'Editar tipo de reparación' }}
        size="xl"
      >
        {({ item }) => <RepairTypeFormFields repair={item} />}
      </CatalogFormSheet>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !isDeleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro de que deseas eliminar este tipo de reparación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si el tipo ya se usó en solicitudes u órdenes no se puede eliminar, y en
              ese caso conviene desactivarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                type="button"
                onClick={() => pendingDelete && onDelete(pendingDelete.id)}
                disabled={isDeleting}
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
