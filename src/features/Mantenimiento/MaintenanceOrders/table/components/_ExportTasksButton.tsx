'use client';

/**
 * Exportar a Excel a nivel de tarea (ticket 682).
 *
 * Reemplaza al botón de exportación estándar del DataTable: el mecanismo
 * genérico (`exportConfig`) arma las columnas del Excel a partir de las
 * columnas de la GRILLA (`meta.title` de cada `ColumnDef`), que están a nivel
 * de orden de mantenimiento (OM). Acá el Excel necesita otra granularidad —
 * una fila por tarea (work_order_item_repairs), con columnas que no existen
 * en la grilla (N° OT, tipo de tarea, estado de la tarea, sector de la
 * tarea) — así que arma sus propias columnas y llama a `exportToExcel`
 * directamente en vez de usar `exportConfig`/`_DataTableExportButton`.
 */

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  WORK_ORDER_ITEM_STATUS_LABELS,
  type WorkOrderItemStatus,
} from '@/features/Mantenimiento/shared/work-order-types';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { exportToExcel, type ExcelColumn } from '@/shared/lib/excel-export';
import { typeOfMaintenanceLabels } from '@/shared/utils/mappers';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { getMaintenanceOrderTasksForExport } from '../actions.server';
import { statusLabels } from '../columns';

interface Props {
  searchParams: DataTableSearchParams;
}

const EXCEL_COLUMNS: ExcelColumn[] = [
  { key: 'om_order_number', title: 'N° Orden (OM)' },
  { key: 'ot_order_number', title: 'N° OT' },
  { key: 'vehicle_label', title: 'Equipo' },
  { key: 'task_name', title: 'Tarea' },
  {
    key: 'type_of_maintenance',
    title: 'Tipo de Mantenimiento',
    formatter: (val) => (val ? typeOfMaintenanceLabels[val as string] ?? String(val) : ''),
  },
  {
    key: 'task_status',
    title: 'Estado de la Tarea',
    formatter: (val) => WORK_ORDER_ITEM_STATUS_LABELS[val as WorkOrderItemStatus] ?? String(val ?? ''),
  },
  {
    key: 'task_sector',
    title: 'Sector de Taller (Tarea)',
    formatter: (val) => (val as string) || 'Sin asignar',
  },
  {
    key: 'is_diagnostico',
    title: 'Es Diagnóstico',
    formatter: (val) => (val ? 'Si' : 'No'),
  },
  {
    key: 'om_status',
    title: 'Estado (OM)',
    formatter: (val) => statusLabels[val as string] ?? String(val ?? ''),
  },
  {
    key: 'workshop_entry_date',
    title: 'Ingreso a Taller',
    formatter: (val) => (val ? formatArgentinaDay(val as string | Date) : ''),
  },
  {
    key: 'created_at',
    title: 'Fecha Creación',
    formatter: (val) => (val ? formatArgentinaDateTime(val as string | Date) : ''),
  },
  { key: 'description', title: 'Descripción' },
];

export function _ExportTasksButton({ searchParams }: Props) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = unwrapExportResult(await getMaintenanceOrderTasksForExport(searchParams));

      if (data.length === 0) {
        toast.warning('No hay tareas para exportar');
        return;
      }

      await exportToExcel(data as unknown as Record<string, unknown>[], EXCEL_COLUMNS, {
        filename: 'tareas-ordenes-mantenimiento',
        title: 'Tareas de Órdenes de Mantenimiento',
        sheetName: 'Tareas',
      });

      toast.success(`Exportado: ${data.length} tareas`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al exportar');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={isExporting} className="h-8 gap-1.5">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Excel</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Exportar tareas (OT) filtradas a Excel — una fila por tarea</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
