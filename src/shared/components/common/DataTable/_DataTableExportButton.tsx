'use client';

import { Download, Loader2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ExcelExportOptions } from '@/shared/lib/excel-export';

export interface DataTableExportConfig<TData> {
  /**
   * Función que obtiene TODOS los datos con los filtros actuales (sin paginación)
   * Debe retornar los datos a exportar
   */
  fetchAllData: () => Promise<TData[]>;
  /**
   * Opciones de exportación
   */
  options: ExcelExportOptions;
  /**
   * Formatters personalizados por key de columna
   * Ejemplo: { status: (val) => statusLabels[val] }
   */
  formatters?: Record<string, (value: unknown, row: TData) => string | number | null>;
  /**
   * Columnas a excluir (además de 'select' y 'actions' que se excluyen por defecto)
   */
  excludeColumns?: string[];
}

interface Props<TData, TValue = unknown> {
  /**
   * Columnas de TanStack Table (para extraer meta.title)
   */
  columns: ReadonlyArray<ColumnDef<TData, TValue>>;
  /**
   * Configuración de exportación
   */
  exportConfig: DataTableExportConfig<TData>;
}

/**
 * Handler de exportación compartido entre el botón de desktop y el ⋯ mobile.
 * `excel-export` (y exceljs, que arrastra) se carga recién al hacer clic.
 */
export function useDataTableExport<TData extends Record<string, unknown>, TValue = unknown>(
  columns: ReadonlyArray<ColumnDef<TData, TValue>>,
  exportConfig: DataTableExportConfig<TData>
) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const data = await exportConfig.fetchAllData();

      if (data.length === 0) {
        toast.warning('No hay datos para exportar');
        return;
      }

      const { exportToExcel, tanstackColumnsToExcelColumns } = await import('@/shared/lib/excel-export');

      // Convertir columnas de TanStack a formato Excel
      const excelColumns = tanstackColumnsToExcelColumns<TData>(columns as ReadonlyArray<ColumnDef<TData, unknown>>, {
        exclude: ['select', 'actions', ...(exportConfig.excludeColumns || [])],
        formatters: exportConfig.formatters,
      });

      await exportToExcel(data, excelColumns, exportConfig.options);

      toast.success(`Exportado: ${data.length} registros`);
    } catch (error) {
      toast.error('Error al exportar');
      throw error;
    } finally {
      setIsExporting(false);
    }
  };

  return { handleExport, isExporting };
}

export function _DataTableExportButton<TData extends Record<string, unknown>, TValue = unknown>({
  columns,
  exportConfig,
}: Props<TData, TValue>) {
  const { handleExport, isExporting } = useDataTableExport(columns, exportConfig);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleExport}
          disabled={isExporting}
          aria-busy={isExporting}
        >
          {isExporting ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download aria-hidden="true" />}
          {isExporting ? 'Exportando…' : 'Exportar'}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Exportar todos los datos filtrados a Excel</p>
      </TooltipContent>
    </Tooltip>
  );
}
