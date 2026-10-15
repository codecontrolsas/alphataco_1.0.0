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
import { createFilterOptions } from '@/features/Employees/Empleados/components/utils/utils';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { Logger } from '@/lib/logger';
import { BaseDataTable } from '@/shared/components/data-table/base/data-table';
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import { PencilIcon, TrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { deleteMeasureUnit, type MeasureUnitRow } from '../../actions/measure-units.server';

const logger = new Logger('features/Empresa/Clientes/MensureUnitsTable');

interface MensureUnitsTableProps {
  units: MeasureUnitRow[];
  setSelectedUnit: (unit: MeasureUnitRow | null) => void;
  setMode: (mode: 'create' | 'edit') => void;
  savedVisibility: VisibilityState;
  savedFilters: string[];
}

function includesValue(value: unknown, filter: unknown): boolean {
  return Array.isArray(filter) && filter.includes(value);
}

function MensureUnitsTable({ units, setSelectedUnit, setMode, savedVisibility, savedFilters }: MensureUnitsTableProps) {
  const [unitToDelete, setUnitToDelete] = useState<MeasureUnitRow | null>(null);
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('comercial', 'mensure_units', 'update');

  const handleConfirmDelete = async () => {
    if (!unitToDelete) return;
    try {
      const result = await deleteMeasureUnit(unitToDelete.id);
      if (result.ok) {
        toast.success('Unidad de medida eliminada correctamente');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      logger.error('Error al eliminar la unidad de medida', { data: { error } });
      toast.error('Error al eliminar la unidad de medida');
    } finally {
      setUnitToDelete(null);
    }
  };

  const columns = useMemo(() => {
    const base: ColumnDef<MeasureUnitRow>[] = [
      {
        accessorKey: 'simbol',
        header: 'Símbolo',
        id: 'Símbolo',
        filterFn: (row, id, value) => includesValue(row.getValue(id), value),
      },
      {
        accessorKey: 'unit',
        header: 'Unidad',
        id: 'Unidad',
        filterFn: (row, id, value) => includesValue(row.getValue(id), value),
      },
      {
        accessorKey: 'tipo',
        header: 'Tipo',
        id: 'Tipo',
        filterFn: (row, id, value) => includesValue(row.getValue(id), value),
      },
    ];
    if (canEdit) {
      base.push({
        id: 'actions',
        cell: ({ row }) => {
          const unit = row.original;
          return (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSelectedUnit(unit);
                  setMode('edit');
                }}
                title="Editar unidad"
                aria-label="Editar unidad"
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setUnitToDelete(unit)}
                title="Eliminar unidad"
                aria-label="Eliminar unidad"
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>
          );
        },
      });
    }
    return base;
  }, [canEdit, setSelectedUnit, setMode]);

  const filterOptions = useMemo(
    () => ({
      simbols: createFilterOptions(units, (unit) => unit.simbol),
      units: createFilterOptions(units, (unit) => unit.unit),
      types: createFilterOptions(units, (unit) => unit.tipo),
    }),
    [units]
  );

  return (
    <div className="flex flex-col gap-4 p-4 pt-0">
      <h2 className="text-xl font-bold">Unidades de Medida</h2>

      <BaseDataTable
        columns={columns}
        data={units}
        savedVisibility={savedVisibility}
        tableId="meanureUnitsTable"
        toolbarOptions={{
          initialVisibleFilters: savedFilters,
          filterableColumns: [
            { columnId: 'Símbolo', title: 'Símbolo', options: filterOptions.simbols },
            { columnId: 'Unidad', title: 'Unidad', options: filterOptions.units },
            { columnId: 'Tipo', title: 'Tipo', options: filterOptions.types },
          ],
        }}
      />

      <AlertDialog open={!!unitToDelete} onOpenChange={(open) => !open && setUnitToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar unidad de medida</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Está seguro de que desea eliminar la unidad {unitToDelete?.simbol}? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default MensureUnitsTable;
