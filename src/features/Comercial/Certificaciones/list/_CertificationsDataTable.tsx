'use client';

import { Button } from '@/components/ui/button';
import { certification_status } from '@/generated/prisma/enums';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import {
  createFacetFilters,
  dateRangeFilter,
  enumFilterOptions,
  textFilter,
} from '@/shared/components/common/DataTable/facet-filters';
import type { DataTableFacetedFilterConfig, DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import { useServerTableView } from '@/shared/components/common/DataTable/useServerTableView';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { formatAmountText } from '@/shared/utils/amount-text';
import { Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { CertificationPermissions } from '../lib/permissions';
import { CERTIFICATIONS_LIST_QUERY_KEY } from '../lib/query-keys';
import { CERTIFICATION_STATUS_LABELS } from '../lib/state-machine';
import {
  getCertificationSingleFacet,
  getCertificationsForExport,
  getCertificationsPaginated,
  type CertificationListItem,
} from './actions.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, formatDateOnly, getCertificationColumns, statusIcons } from './columns';

// El detalle y el alta solo se necesitan al abrirlos: no entran en el bundle de la lista.
const CertificationDetailSheet = dynamic(
  () => import('../components/CertificationDetailSheet').then((m) => m.CertificationDetailSheet),
  { ssr: false }
);
const CreateCertificationDialog = dynamic(
  () => import('../components/CreateCertificationDialog').then((m) => m.CreateCertificationDialog),
  { ssr: false }
);

interface CertificationsDataTableProps {
  data: CertificationListItem[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  permissions: CertificationPermissions;
  /** Banda de atención resuelta en el servidor; se muestra sobre la tabla. */
  topSlot?: ReactNode;
  initialColumnVisibility?: Record<string, boolean>;
  initialFilterVisibility?: Record<string, boolean>;
}

/** Solo 3 filtros visibles de entrada; el resto se activa desde el toggle de filtros. */
const DEFAULT_VISIBLE_FILTERS = ['status', 'customer', 'period'];

const UNASSIGNED = { label: 'Sin asignar' };

const facets = createFacetFilters(getCertificationSingleFacet);

const DEFAULT_SORTING = [{ id: 'period', desc: true }];

const formatTimestamp = (value: unknown) => (value ? formatArgentinaDateTime(value as string) : '');

export default function _CertificationsDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  permissions,
  topSlot,
  initialColumnVisibility,
  initialFilterVisibility,
}: CertificationsDataTableProps) {
  const { canCreate, canViewPrices } = permissions;

  // ─── Detalle y alta ────────────────────────────────────────────────────────
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const openDetail = useCallback((id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  }, []);

  const columns = useMemo(
    () => getCertificationColumns({ canViewPrices, onOpenDetail: openDetail }),
    [canViewPrices, openDetail]
  );

  const tableQueryFn = useCallback((params: DataTableSearchParams) => getCertificationsPaginated(params), []);

  // ─── Filtros (lazy-load por filtro) ────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      facets.fixed(
        'status',
        'Estado',
        enumFilterOptions(Object.values(certification_status), CERTIFICATION_STATUS_LABELS, statusIcons)
      ),
      facets.lookup('customer', 'Cliente', undefined, UNASSIGNED),
      dateRangeFilter('period', 'Período'),
      facets.lookup('contract', 'Contrato', undefined, UNASSIGNED),
      facets.lookup('currency', 'Moneda', undefined, UNASSIGNED),

      // ── Texto ──
      textFilter('number', 'Número', 'Ej: CERT-2026-0001...'),
      ...(canViewPrices ? [textFilter('total', 'Total', 'Importe exacto, ej: 1234,56')] : []),
      textFilter('notes', 'Observaciones', 'Buscar en observaciones...'),
      textFilter('voided_reason', 'Motivo de anulación', 'Buscar en el motivo...'),

      // ── Fechas ──
      dateRangeFilter('issued_at', 'Fecha de emisión'),
      dateRangeFilter('confirmed_at', 'Fecha de confirmación'),
      dateRangeFilter('voided_at', 'Fecha de anulación'),
      dateRangeFilter('created_at', 'Fecha de creación'),
    ],
    [canViewPrices]
  );

  const { currentParams, tableProps } = useServerTableView({
    searchParams,
    tableId,
    hiddenColumnsByDefault: HIDDEN_COLUMNS_BY_DEFAULT,
    defaultVisibleFilters: DEFAULT_VISIBLE_FILTERS,
    facetedFilters,
    initialColumnVisibility,
    savedFilterVisibility: initialFilterVisibility,
  });

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {topSlot}

      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        {...tableProps}
        initialSorting={DEFAULT_SORTING}
        showSearch
        searchPlaceholder="Buscar por número, cliente o contrato..."
        queryFn={tableQueryFn}
        queryKey={CERTIFICATIONS_LIST_QUERY_KEY}
        emptyMessage="Todavía no hay certificaciones. Se arma una eligiendo contrato y período."
        data-testid="certifications-table"
        toolbarActions={
          canCreate ? (
            <Button type="button" size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              Nueva certificación
            </Button>
          ) : undefined
        }
        exportConfig={{
          fetchAllData: async () => unwrapExportResult(await getCertificationsForExport(currentParams)),
          options: {
            filename: 'certificaciones',
            sheetName: 'Certificaciones',
            title: 'Listado de certificaciones',
          },
          formatters: {
            contract: (_value, row) =>
              [row.contract.name ?? 'Sin nombre', row.contract.number && `N° ${row.contract.number}`]
                .filter(Boolean)
                .join(' · '),
            period: (_value, row) => `${formatDateOnly(row.periodFrom)} — ${formatDateOnly(row.periodTo)}`,
            status: (_value, row) => CERTIFICATION_STATUS_LABELS[row.status],
            total: (_value, row) => (row.total === null ? '' : formatAmountText(row.total)),
            notes: (value) => (value ? String(value) : ''),
            voided_reason: (value) => (value ? String(value) : ''),
            issued_at: formatTimestamp,
            confirmed_at: formatTimestamp,
            voided_at: formatTimestamp,
            created_at: formatTimestamp,
          },
        }}
      />

      {detailId ? (
        <CertificationDetailSheet
          certificationId={detailId}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          permissions={permissions}
        />
      ) : null}

      {canCreate && creating ? (
        <CreateCertificationDialog open={creating} onOpenChange={setCreating} onCreated={openDetail} />
      ) : null}
    </div>
  );
}
