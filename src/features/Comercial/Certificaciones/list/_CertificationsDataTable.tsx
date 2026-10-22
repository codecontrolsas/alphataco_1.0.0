'use client';

import { Button } from '@/components/ui/button';
import { certification_status } from '@/generated/prisma/enums';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { type DataTableFacetedFilterConfig, type DataTableSearchParams, type FacetResult } from '@/shared/components/common/DataTable/types';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import { unwrapExportResult } from '@/shared/lib/export-result';
import { formatAmountText } from '@/shared/utils/amount-text';
import { CircleOff, Plus } from 'lucide-react';
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

  // ─── Client-side navigation ────────────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);
  const handleStateChange = useCallback((params: DataTableSearchParams) => setCurrentParams(params), []);
  const tableQueryFn = useCallback((params: DataTableSearchParams) => getCertificationsPaginated(params), []);

  // ─── Visibilidad: preferencias guardadas > defaults ────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) defaults[col] = false;
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ─── fetchFacet factories (lazy-load por filtro) ───────────────────────────
  const makeEnumFetchFacet = useCallback(
    (columnId: string, options: FacetResult['options']) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getCertificationSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map<string, number>() };
        return { options, counts: result.counts };
      },
    []
  );

  const makeFkFetchFacet = useCallback(
    (columnId: string) =>
      async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getCertificationSingleFacet(columnId, params);
        if (!result) return { options: [], counts: new Map() };
        return {
          options: [
            ...(result.resolvedOptions?.map((o) => ({ value: o.id, label: o.name ?? '' })) ?? []),
            ...(result.counts.has(NULL_FILTER_VALUE)
              ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
              : []),
          ],
          counts: result.counts,
        };
      },
    []
  );

  // ─── Filtros ───────────────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: makeEnumFetchFacet(
          'status',
          Object.values(certification_status).map((value) => ({
            value,
            label: CERTIFICATION_STATUS_LABELS[value],
            icon: statusIcons[value],
          }))
        ),
      },
      { columnId: 'customer', title: 'Cliente', fetchFacet: makeFkFetchFacet('customer') },
      { columnId: 'period', title: 'Período', type: 'dateRange' as const },
      { columnId: 'contract', title: 'Contrato', fetchFacet: makeFkFetchFacet('contract') },
      { columnId: 'currency', title: 'Moneda', fetchFacet: makeFkFetchFacet('currency') },

      // ── Texto ──
      { columnId: 'number', title: 'Número', type: 'text' as const, placeholder: 'Ej: CERT-2026-0001...' },
      ...(canViewPrices
        ? [{ columnId: 'total', title: 'Total', type: 'text' as const, placeholder: 'Importe exacto, ej: 1234,56' }]
        : []),
      { columnId: 'notes', title: 'Observaciones', type: 'text' as const, placeholder: 'Buscar en observaciones...' },
      {
        columnId: 'voided_reason',
        title: 'Motivo de anulación',
        type: 'text' as const,
        placeholder: 'Buscar en el motivo...',
      },

      // ── Fechas ──
      { columnId: 'issued_at', title: 'Fecha de emisión', type: 'dateRange' as const },
      { columnId: 'confirmed_at', title: 'Fecha de confirmación', type: 'dateRange' as const },
      { columnId: 'voided_at', title: 'Fecha de anulación', type: 'dateRange' as const },
      { columnId: 'created_at', title: 'Fecha de creación', type: 'dateRange' as const },
    ],
    [makeEnumFetchFacet, makeFkFetchFacet, canViewPrices]
  );

  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, DEFAULT_VISIBLE_FILTERS.includes(f.columnId)]));
  }, [initialFilterVisibility, facetedFilters]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {topSlot}

      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        tableId={tableId}
        paramNamespace={tableId}
        facetedFilters={facetedFilters}
        initialColumnVisibility={mergedColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        initialSorting={DEFAULT_SORTING}
        showSearch
        searchPlaceholder="Buscar por número, cliente o contrato..."
        showFilterToggle
        queryFn={tableQueryFn}
        queryKey={CERTIFICATIONS_LIST_QUERY_KEY}
        onStateChange={handleStateChange}
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
