'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, type DataTableFacetedFilterConfig } from '@/shared/components/common/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DepartmentAbsenceSummaryItem } from '../../actions.server';
import { formatAbsencePercent } from '../../lib/absence-level';
import { _EmployeeAbsenceDataTable } from '../EmployeeAbsenceTable/_EmployeeAbsenceDataTable';
import { getDepartmentSummaryColumns } from './columns';

// DataTable requires TData extends Record<string, unknown>.
type DepartmentSummaryRecord = DepartmentAbsenceSummaryItem & Record<string, unknown>;

interface Props {
  data: DepartmentAbsenceSummaryItem[];
}

export function _DepartmentSummaryDataTable({ data }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<DepartmentAbsenceSummaryItem | null>(null);

  const handleViewEmployees = (row: DepartmentAbsenceSummaryItem) => {
    setSelectedRow(row);
    setIsOpen(true);
  };

  const columns = useMemo(
    () => getDepartmentSummaryColumns(handleViewEmployees) as ColumnDef<DepartmentSummaryRecord>[],
    []
  );

  const castedData = data as DepartmentSummaryRecord[];

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'sector',
        title: 'Sector',
        type: 'text',
        placeholder: 'Buscar sector...',
      },
      { columnId: 'dotacion', title: 'Dotación', type: 'text', placeholder: 'Buscar dotación...' },
      { columnId: 'ausentes', title: 'Ausentes', type: 'text', placeholder: 'Buscar ausentes...' },
      { columnId: 'porcentaje', title: '% Ausentismo', type: 'text', placeholder: 'Buscar porcentaje...' },
    ],
    []
  );

  const exportConfig = useMemo(
    () => ({
      fetchAllData: async () => castedData,
      options: {
        filename: 'resumen-ausentismo-sectores',
        sheetName: 'Resumen por Sector',
        title: 'Resumen de Ausentismo por Sector',
      },
      formatters: {
        porcentaje: (val: unknown) => (val == null ? '' : formatAbsencePercent(val as number)),
      },
    }),
    [castedData]
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={castedData}
        totalRows={castedData.length}
        facetedFilters={facetedFilters}
        searchPlaceholder="Buscar sector..."
        showSearch
        showFilterToggle
        emptyMessage="No hay datos de sectores disponibles."
        exportConfig={exportConfig}
        tableId="dept-summary"
        paramNamespace="dept-summary"
        inMemory
      />

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{selectedRow ? `Ausentes en ${selectedRow.sector}` : 'Ausentes'}</DialogTitle>
            <DialogDescription>Detalle de empleados ausentes en el sector seleccionado.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {!selectedRow || selectedRow.data.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">No hay ausentes para este sector.</div>
            ) : (
              <_EmployeeAbsenceDataTable
                data={selectedRow.data}
                title={`Ausentes en ${selectedRow.sector}`}
                tableId="dept-summary-modal"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
