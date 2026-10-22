'use client';

import { BulkDownloadBar } from '@/features/Clothing/pdf/BulkDownloadBar';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import type { DataTableProps } from '@/shared/components/common/DataTable/types';
import { useCallback, useState } from 'react';

/**
 * Tabla de entregas de ropa: `DataTable` con buscador y selección de filas, más la barra de descarga
 * masiva de constancias PDF (la selección sobrevive al cambio de página). Fija las props de buscador y
 * selección: quien la usa no las pasa.
 */
export function DeliveriesTable<T extends Record<string, unknown>>(props: DataTableProps<T>) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clearTrigger, setClearTrigger] = useState(0);
  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setClearTrigger((n) => n + 1);
  }, []);

  return (
    <>
      <DataTable
        {...props}
        showSearch={true}
        enableRowSelection
        showRowSelection
        onRowSelectionIdsChange={setSelectedIds}
        clearSelectionTrigger={clearTrigger}
      />
      <BulkDownloadBar selectedIds={selectedIds} onClear={clearSelection} />
    </>
  );
}
