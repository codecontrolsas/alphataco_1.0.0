'use client';

import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { createFacetFilters, dateRangeFilter, textFilter } from '@/shared/components/common/DataTable/facet-filters';
import type {
  DataTableExportConfig,
  DataTableFacetedFilterConfig,
  DataTableSearchParams,
} from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { Briefcase, FileText } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { HSE_ACK_STATUS_LABELS, HSE_QUERY_KEYS } from '../../../lib/constants';
import { HSE_ACK_STATUS_UI } from '../../../lib/status-presentation';
import {
  getAllHseComplianceForExport,
  getHseCompliancePaginated,
  getHseComplianceSingleFacet,
  type HseComplianceListItem,
} from '../actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns } from '../columns';

interface Props {
  data: HseComplianceListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  /** Acota la tabla a un documento (detalle). */
  documentId: string | null;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

const STATUS_VALUES = Object.keys(HSE_ACK_STATUS_LABELS) as (keyof typeof HSE_ACK_STATUS_LABELS)[];

export function _ComplianceDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  documentId,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getHseCompliancePaginated(params, documentId),
    [documentId]
  );
  const columns = useMemo(() => getColumns({ showDocument: documentId === null }), [documentId]);

  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(() => {
    const facets = createFacetFilters((columnId, params) => getHseComplianceSingleFacet(columnId, params, documentId));
    return [
      facets.fixed(
        'status',
        'Estado',
        STATUS_VALUES.map((value) => ({
          value,
          label: HSE_ACK_STATUS_LABELS[value],
          icon: HSE_ACK_STATUS_UI[value].icon,
        }))
      ),
      ...(documentId === null ? [facets.lookup('document', 'Documento', FileText)] : []),
      facets.lookup('position', 'Puesto', Briefcase, { label: 'Sin puesto' }),
      textFilter('file', 'Legajo', 'Buscar por legajo...'),
      textFilter('employee', 'Empleado', 'Buscar por apellido o nombre...'),
      textFilter('version', 'Versión', 'Número de versión, ej: 2'),
      textFilter('reject_reason', 'Motivo del rechazo', 'Buscar en el motivo...'),
      dateRangeFilter('responded_at', 'Respondió'),
      dateRangeFilter('created_at', 'Asignado'),
    ];
  }, [documentId]);

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: documentId === null ? ['status', 'document', 'position'] : ['status', 'position', 'file'],
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  const exportConfig: DataTableExportConfig<HseComplianceListItem> = useMemo(
    () => ({
      fetchAllData: async () => unwrapExportResult(await getAllHseComplianceForExport(currentParams, documentId)),
      options: { filename: 'cumplimiento-hse', title: 'Cumplimiento HSE', sheetName: 'Cumplimiento' },
      formatters: {
        status: (value) => HSE_ACK_STATUS_LABELS[value as keyof typeof HSE_ACK_STATUS_LABELS] ?? '',
        version: (value) => `v${value}`,
        responded_at: (value) => (value ? formatArgentinaDateTime(value as string | Date) : ''),
        created_at: (value) => (value ? formatArgentinaDateTime(value as string | Date) : ''),
      },
    }),
    [currentParams, documentId]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      totalRows={totalRows}
      {...tableProps}
      queryFn={tableQueryFn}
      queryKey={[...HSE_QUERY_KEYS.compliance, documentId ?? 'all']}
      searchPlaceholder="Buscar por legajo, nombre o documento"
      emptyMessage={
        documentId === null
          ? 'Todavía no hay documentos publicados con destinatarios'
          : 'Este documento no tiene destinatarios vigentes'
      }
      exportConfig={exportConfig}
      data-testid="hse-compliance-table"
    />
  );
}
