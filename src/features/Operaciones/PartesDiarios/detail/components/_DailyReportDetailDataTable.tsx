'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  DataTable,
  type DataTableFacetedFilterConfig,
  type DataTableSearchParams,
  type FacetResult,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { dailyReportRowStatusLabels, dailyReportTypeServiceLabels } from '@/shared/utils/mappers';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  CheckCircle2,
  CircleOff,
  Pencil,
  Plus,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import moment from 'moment';
import { DAILY_REPORT_ROW_STATUS_ICONS } from '../../lib/daily-report-status-ui';
import { ROW_HIGHLIGHT_CLASSES } from '../lib/row-highlight';
import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { useDailyReportDetailFormStore } from '../../store/dailyReportDetailFormStore';
import { getDailyReportDetailForExport } from '../export.server';
import { getCustomersForForm, getEmployeesForForm, getOtherEquipmentForForm, getVehiclesForForm } from '../form-data.server';
import { getDailyReportDetailPaginated, getDailyReportDetailSingleFacet } from '../queries.server';
import { HIDDEN_COLUMNS_BY_DEFAULT, getColumns, type RowActionHandlers } from '../columns';
import { useDailyReportDetailInvalidation } from '../hooks/useDailyReportDetail';
import { useValidationData } from '../hooks/useValidationData';
import type { DailyReportDetailRow } from '../types';

// Lightweight modals — regular imports
import { BulkEditModal } from './BulkEditModal';
import { DeleteRowDialog } from './DeleteRowDialog';
import { ServiceDetailDialog } from './ServiceDetailDialog';

// Heavy modals — dynamic imports with ssr:false
const DailyReportRowForm = dynamic(
  () => import('./DailyReportRowForm').then((m) => ({ default: m.DailyReportRowForm })),
  { ssr: false }
);

const HistoryDialog = dynamic(() => import('./HistoryDialog').then((m) => ({ default: m.HistoryDialog })), {
  ssr: false,
});

// El gestor de remitos es el mismo que usa Comercial; se carga recién cuando se abre
const RemitosManagerModal = dynamic(
  () => import('../../remitManager').then((m) => ({ default: m.RemitosManagerModal })),
  { ssr: false }
);
const CloneRowsDialog = dynamic(() => import('./CloneRowsDialog').then((m) => ({ default: m.CloneRowsDialog })), {
  ssr: false,
});

// ============================================================================
// CONSTANTS
// ============================================================================

/** Only 3 filters visible by default */
const DEFAULT_VISIBLE_FILTERS = ['status', 'customer', 'working_day'];

/** Íconos de estado del filtro: los mismos que el badge de la columna */
const rowStatusIcons: Record<string, LucideIcon> = DAILY_REPORT_ROW_STATUS_ICONS;

// ============================================================================
// PROPS
// ============================================================================

interface Props {
  data: DailyReportDetailRow[];
  totalRows: number;
  searchParams: DataTableSearchParams;
  tableId: string;
  dailyReportId: string;
  /** ISO date string of the daily report — used for employee diagram deviation detection */
  reportDate: string;
  /** Status del parte diario (abierto/cerrado/etc.) — para deshabilitar Crear */
  dailyReportStatus: string;
  canUpdate: boolean;
  canDelete: boolean;
  canAssignResources: boolean;
  initialColumnVisibility: Record<string, boolean>;
  initialFilterVisibility: Record<string, boolean>;
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export function _DailyReportDetailDataTable({
  data,
  totalRows,
  searchParams,
  tableId,
  dailyReportId,
  reportDate,
  dailyReportStatus,
  canUpdate,
  canDelete,
  canAssignResources,
  initialColumnVisibility,
  initialFilterVisibility,
}: Props) {
  // ── Client-side navigation mode ──────────────────────────────────────────
  const [currentParams, setCurrentParams] = useState<DataTableSearchParams>(searchParams);

  const handleStateChange = useCallback((params: DataTableSearchParams) => {
    setCurrentParams(params);
  }, []);

  const tableQueryFn = useCallback(
    (params: DataTableSearchParams) => getDailyReportDetailPaginated(dailyReportId, params, reportDate),
    [dailyReportId, reportDate]
  );

  // ── Query invalidation ────────────────────────────────────────────────────
  const { invalidateDetail } = useDailyReportDetailInvalidation();

  // ── Datos de validaciones de desvíos (empleados y equipos) ───────────────
  const {
    isLoading: loadingValidations,
    getEmployeeDeviation,
    getEquipmentDeviation,
  } = useValidationData(dailyReportId, reportDate);

  // ── Zustand store for DailyReportRowForm Sheet ────────────────────────────
  const { isOpen: isFormOpen, open: openForm, close: closeForm, editingRowId } = useDailyReportDetailFormStore();

  // ── Crear: disponible si canUpdate Y (parte abierto O es el día de hoy) ────
  const isReportToday = moment(reportDate).isSame(moment(), 'day');
  const canCreate = canUpdate && (dailyReportStatus === 'abierto' || isReportToday);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [deleteRow, setDeleteRow] = useState<DailyReportDetailRow | null>(null);
  const [detailRowId, setDetailRowId] = useState<string | null>(null);
  const [historyRowId, setHistoryRowId] = useState<string | null>(null);
  const [remitRow, setRemitRow] = useState<{ id: string; customerName?: string } | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showClone, setShowClone] = useState(false);

  // ── Bulk action state ─────────────────────────────────────────────────────
  const [selectedRows, setSelectedRows] = useState<DailyReportDetailRow[]>([]);

  // ── Form catalog data — lazy-load on first open ───────────────────────────
  const { data: formCustomers = [] } = useQuery({
    queryKey: ['form-customers'],
    queryFn: () => getCustomersForForm(),
    enabled: isFormOpen,
    staleTime: 5 * 60 * 1000,
  });

  const { data: formEmployees = [] } = useQuery({
    queryKey: ['form-employees', reportDate],
    queryFn: () => getEmployeesForForm(reportDate),
    enabled: isFormOpen,
    staleTime: 5 * 60 * 1000,
  });

  const { data: formVehicles = [] } = useQuery({
    queryKey: ['form-vehicles'],
    queryFn: () => getVehiclesForForm(),
    enabled: isFormOpen,
    staleTime: 5 * 60 * 1000,
  });

  const { data: formOtherEquipment = [] } = useQuery({
    queryKey: ['form-other-equipment'],
    queryFn: () => getOtherEquipmentForForm(),
    enabled: isFormOpen,
    staleTime: 5 * 60 * 1000,
  });

  // ── Row action handlers ───────────────────────────────────────────────────
  const handlers: RowActionHandlers = useMemo(
    () => ({
      onViewDetail: (row) => setDetailRowId(row.id),
      onEdit: (row) => openForm(row.id),
      onAssignResources: (row) => openForm(row.id, 'resources'),
      onHistory: (row) => setHistoryRowId(row.id),
      onDelete: (row) => setDeleteRow(row),
      onManageRemitos: (row) => setRemitRow({ id: row.id, customerName: row.customers?.name ?? undefined }),
    }),
    [openForm]
  );

  // ── Permissions ───────────────────────────────────────────────────────────
  const permissions = useMemo(
    () => ({ canUpdate, canDelete, canAssignResources }),
    [canUpdate, canDelete, canAssignResources]
  );

  // ── Deviation getters (estables para el memo de columnas) ─────────────────
  const deviationGetters = useMemo(
    () => ({
      getEmployeeDeviation,
      getEquipmentDeviation,
      loadingValidations,
    }),
    [getEmployeeDeviation, getEquipmentDeviation, loadingValidations]
  );

  // ── Column visibility ─────────────────────────────────────────────────────
  const mergedColumnVisibility = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const col of HIDDEN_COLUMNS_BY_DEFAULT) {
      defaults[col] = false;
    }
    return { ...defaults, ...initialColumnVisibility };
  }, [initialColumnVisibility]);

  // ── Filter visibility — 3 visible by default ──────────────────────────────
  const mergedFilterVisibility = useMemo(() => {
    if (initialFilterVisibility && Object.keys(initialFilterVisibility).length > 0) {
      return initialFilterVisibility;
    }
    const allFilterIds = [
      'status',
      'customer',
      'service',
      'item',
      'sector',
      'area',
      'type_service',
      'working_day',
      'description',
      'remit_number',
      'completed_day',
      'completed_night',
      'employees',
      'equipment',
      'customer_equipment',
    ];
    return Object.fromEntries(allFilterIds.map((id) => [id, DEFAULT_VISIBLE_FILTERS.includes(id)]));
  }, [initialFilterVisibility]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => getColumns(permissions, handlers, reportDate, deviationGetters),
    [permissions, handlers, reportDate, deviationGetters]
  );

  // ── Row className — indicadores visuales por estado ───────────────────────
  const reportDateMoment = useMemo(() => moment(reportDate), [reportDate]);
  const getRowClassName = useCallback(
    (row: DailyReportDetailRow) => {
      if (row.last_comercial_edit_at) return ROW_HIGHLIGHT_CLASSES.commercialEdit;
      if (row.created_at && moment(row.created_at).isAfter(reportDateMoment))
        return ROW_HIGHLIGHT_CLASSES.lateCreated;
      return '';
    },
    [reportDateMoment]
  );

  // ── Lazy-load facet factory ───────────────────────────────────────────────

  /**
   * Creates a fetchFacet callback for FK/text-as-faceted columns.
   * The server returns resolvedOptions (labels) + counts.
   */
  const makeFkFetchFacet = useCallback(
    (columnId: string, nullLabel = 'Sin asignar') => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getDailyReportDetailSingleFacet(dailyReportId, columnId, params);
        if (!result) return { options: [], counts: new Map() };

        const options = [
          ...(result.resolvedOptions ?? []).map((opt) => ({
            value: opt.value,
            label: opt.label,
          })),
          ...(result.counts.has(NULL_FILTER_VALUE)
            ? [{ value: NULL_FILTER_VALUE, label: nullLabel, icon: CircleOff }]
            : []),
        ];
        return { options, counts: result.counts };
      };
    },
    [dailyReportId]
  );

  /** Creates a fetchFacet callback for enum columns with static label/icon maps */
  const makeEnumFetchFacet = useCallback(
    (
      columnId: string,
      enumValues: string[],
      labels: Record<string, string>,
      icons?: Record<string, LucideIcon>,
      allowNull?: boolean
    ) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getDailyReportDetailSingleFacet(dailyReportId, columnId, params);
        if (!result) return { options: [], counts: new Map() };

        const options = [
          ...enumValues.map((value) => ({
            value,
            label: labels[value] ?? value,
            ...(icons?.[value] ? { icon: icons[value] } : {}),
          })),
          ...(allowNull && result.counts.has(NULL_FILTER_VALUE)
            ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
            : []),
        ];
        return { options, counts: result.counts };
      };
    },
    [dailyReportId]
  );

  /** Creates a fetchFacet callback for boolean nullable columns */
  const makeBoolFetchFacet = useCallback(
    (columnId: string) => {
      return async (params: DataTableSearchParams): Promise<FacetResult> => {
        const result = await getDailyReportDetailSingleFacet(dailyReportId, columnId, params);
        if (!result) return { options: [], counts: new Map() };

        const options = [
          { value: 'true', label: 'Sí', icon: CheckCircle2 },
          { value: 'false', label: 'No', icon: XCircle },
          ...(result.counts.has(NULL_FILTER_VALUE)
            ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }]
            : []),
        ];
        return { options, counts: result.counts };
      };
    },
    [dailyReportId]
  );

  // ── Individual fetchFacet callbacks (stable references) ──────────────────

  const fetchStatusFacet = useMemo(
    () =>
      makeEnumFetchFacet(
        'status',
        ['pendiente', 'sin_recursos_asignados', 'ejecutado', 'reprogramado', 'cancelado', 'en_certificacion'],
        dailyReportRowStatusLabels,
        rowStatusIcons
      ),
    [makeEnumFetchFacet]
  );

  const fetchTypeServiceFacet = useMemo(
    () =>
      makeEnumFetchFacet(
        'type_service',
        ['mensual', 'adicional', 'adicional_permanente'],
        dailyReportTypeServiceLabels,
        undefined,
        true // allowNull
      ),
    [makeEnumFetchFacet]
  );

  const fetchCustomerFacet = useMemo(() => makeFkFetchFacet('customer'), [makeFkFetchFacet]);

  const fetchServiceFacet = useMemo(() => makeFkFetchFacet('service'), [makeFkFetchFacet]);

  const fetchItemFacet = useMemo(() => makeFkFetchFacet('item'), [makeFkFetchFacet]);

  const fetchSectorFacet = useMemo(() => makeFkFetchFacet('sector'), [makeFkFetchFacet]);

  const fetchAreaFacet = useMemo(() => makeFkFetchFacet('area'), [makeFkFetchFacet]);

  const fetchWorkingDayFacet = useMemo(() => makeFkFetchFacet('working_day', 'Sin jornada'), [makeFkFetchFacet]);

  const fetchCompletedDayFacet = useMemo(() => makeBoolFetchFacet('completed_day'), [makeBoolFetchFacet]);

  const fetchCompletedNightFacet = useMemo(() => makeBoolFetchFacet('completed_night'), [makeBoolFetchFacet]);

  const fetchEmployeesFacet = useMemo(() => makeFkFetchFacet('employees', 'Sin empleados'), [makeFkFetchFacet]);

  const fetchEquipmentFacet = useMemo(() => makeFkFetchFacet('equipment', 'Sin equipos'), [makeFkFetchFacet]);

  const fetchCustomerEquipmentFacet = useMemo(
    () => makeFkFetchFacet('customer_equipment', 'Sin equipo cliente'),
    [makeFkFetchFacet]
  );

  // ── Faceted filters ───────────────────────────────────────────────────────
  const facetedFilters: DataTableFacetedFilterConfig[] = useMemo(
    () => [
      // ── Estado (enum NOT NULL) ──────────────────────────────────────────────
      {
        columnId: 'status',
        title: 'Estado',
        fetchFacet: fetchStatusFacet,
      },

      // ── Cliente (FK UUID nullable) ──────────────────────────────────────────
      {
        columnId: 'customer',
        title: 'Cliente',
        fetchFacet: fetchCustomerFacet,
      },

      // ── Servicio (FK UUID nullable) ─────────────────────────────────────────
      {
        columnId: 'service',
        title: 'Servicio',
        fetchFacet: fetchServiceFacet,
      },

      // ── Ítem (FK UUID nullable) ─────────────────────────────────────────────
      {
        columnId: 'item',
        title: 'Ítem',
        fetchFacet: fetchItemFacet,
      },

      // ── Sector (FK nullable) ────────────────────────────────────────────────
      {
        columnId: 'sector',
        title: 'Sector',
        fetchFacet: fetchSectorFacet,
      },

      // ── Área (FK nullable) ──────────────────────────────────────────────────
      {
        columnId: 'area',
        title: 'Área',
        fetchFacet: fetchAreaFacet,
      },

      // ── Tipo Servicio (enum nullable) ───────────────────────────────────────
      {
        columnId: 'type_service',
        title: 'Tipo Servicio',
        fetchFacet: fetchTypeServiceFacet,
      },

      // ── Jornada (texto como faceted) ────────────────────────────────────────
      {
        columnId: 'working_day',
        title: 'Jornada',
        fetchFacet: fetchWorkingDayFacet,
      },

      // ── Descripción (texto libre) ───────────────────────────────────────────
      {
        columnId: 'description',
        title: 'Descripción',
        type: 'text' as const,
        placeholder: 'Buscar en descripción...',
      },

      // ── Remitos (texto libre sobre los remitos de la línea) ──────────────────
      {
        columnId: 'remit_number',
        title: 'Remitos',
        type: 'text' as const,
        placeholder: 'Buscar remito...',
      },

      // ── Completado Día (booleano nullable) ──────────────────────────────────
      {
        columnId: 'completed_day',
        title: 'Completado Día',
        fetchFacet: fetchCompletedDayFacet,
      },

      // ── Completado Noche (booleano nullable) ────────────────────────────────
      {
        columnId: 'completed_night',
        title: 'Completado Noche',
        fetchFacet: fetchCompletedNightFacet,
      },

      // ── Empleados (M:M via dailyreportemployeerelations) ─────────────────────
      {
        columnId: 'employees',
        title: 'Empleados',
        fetchFacet: fetchEmployeesFacet,
      },

      // ── Equipos (M:M mixto: vehicles + other_equipment) ──────────────────────
      {
        columnId: 'equipment',
        title: 'Equipos',
        fetchFacet: fetchEquipmentFacet,
      },

      // ── Equipo Cliente (M:M via dailyreport_customer_equipment_relations) ─────
      {
        columnId: 'customer_equipment',
        title: 'Equipo cliente',
        fetchFacet: fetchCustomerEquipmentFacet,
      },
    ],
    [
      fetchStatusFacet,
      fetchCustomerFacet,
      fetchServiceFacet,
      fetchItemFacet,
      fetchSectorFacet,
      fetchAreaFacet,
      fetchTypeServiceFacet,
      fetchWorkingDayFacet,
      fetchCompletedDayFacet,
      fetchCompletedNightFacet,
      fetchEmployeesFacet,
      fetchEquipmentFacet,
      fetchCustomerEquipmentFacet,
    ]
  );

  // ── Toolbar: bulk Editar (solo con selección activa) ──────────────────────
  const toolbarActions = useMemo(() => {
    const selectedCount = selectedRows.length;
    const hasBulk = selectedCount > 0;
    const hasExecutedSelected = selectedRows.some((r) => r.status === 'ejecutado');

    if (!hasBulk || !canUpdate) return null;

    return (
      <TooltipProvider delayDuration={150}>
        <div className="flex items-center gap-2">
          {hasExecutedSelected ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  <Button variant="outline" size="sm" className="gap-1.5" disabled>
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                    <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] font-medium">
                      {selectedCount}
                    </Badge>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="max-w-xs text-xs">
                  No se pueden editar registros ejecutados. Deseleccioná las filas con estado{' '}
                  <span className="font-medium">Ejecutado</span> para continuar.
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowBulkEdit(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Editar
              <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] font-medium">
                {selectedCount}
              </Badge>
            </Button>
          )}
        </div>
      </TooltipProvider>
    );
  }, [selectedRows, canUpdate]);

  // ── Top action bar: Crear + Clonar (estilo prod, encima de la tabla) ─────
  const topActionBar = useMemo(() => {
    if (!canUpdate) return null;
    const selectedCount = selectedRows.length;
    const hasBulk = selectedCount > 0;

    return (
      <TooltipProvider delayDuration={150}>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate ? (
            <Button variant="brand" size="sm" onClick={() => openForm()}>
              <Plus className="mr-2 size-4" />
              Crear registro
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  <Button variant="brand" size="sm" disabled>
                    <Plus className="mr-2 size-4" />
                    Crear registro
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="max-w-xs text-xs">El parte está cerrado y no es el día de hoy</p>
              </TooltipContent>
            </Tooltip>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowClone(true)} className="order-first gap-1.5">
            <CalendarCheck className="size-4" />
            {hasBulk ? (
              <>
                Clonar
                <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px] font-medium">
                  {selectedCount}
                </Badge>
              </>
            ) : (
              'Clonar Registros'
            )}
          </Button>
        </div>
      </TooltipProvider>
    );
  }, [canUpdate, canCreate, openForm, selectedRows]);

  // ── Export formatters ─────────────────────────────────────────────────────
  const exportFormatters = useMemo(
    () => ({
      // Enum → label legible
      status: (val: unknown) => dailyReportRowStatusLabels[val as string] ?? String(val ?? ''),
      type_service: (val: unknown) => (val ? dailyReportTypeServiceLabels[val as string] ?? String(val) : ''),
      // Booleanos
      completed_day: (val: unknown) => {
        if (val === null || val === undefined) return '';
        return val ? 'Sí' : 'No';
      },
      completed_night: (val: unknown) => {
        if (val === null || val === undefined) return '';
        return val ? 'Sí' : 'No';
      },
      // Times — ISO Date string → HH:mm
      start_time: (val: unknown) => {
        if (!val) return '';
        try {
          const d = new Date(val as string);
          const hh = String(d.getUTCHours()).padStart(2, '0');
          const mm = String(d.getUTCMinutes()).padStart(2, '0');
          return `${hh}:${mm}`;
        } catch {
          return String(val ?? '');
        }
      },
      end_time: (val: unknown) => {
        if (!val) return '';
        try {
          const d = new Date(val as string);
          const hh = String(d.getUTCHours()).padStart(2, '0');
          const mm = String(d.getUTCMinutes()).padStart(2, '0');
          return `${hh}:${mm}`;
        } catch {
          return String(val ?? '');
        }
      },
      // M:M relations — accessorFn returns comma-separated string already,
      // but the export needs the same format
      employees: (val: unknown) => String(val ?? ''),
      equipment: (val: unknown) => String(val ?? ''),
      customer_equipment: (val: unknown) => String(val ?? ''),
      // Columnas de roles de empleado
      chofer_dia: (val: unknown) => String(val ?? ''),
      ayudante_dia: (val: unknown) => String(val ?? ''),
      chofer_noche: (val: unknown) => String(val ?? ''),
      ayudante_noche: (val: unknown) => String(val ?? ''),
    }),
    []
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        searchParams={searchParams}
        queryFn={tableQueryFn}
        queryKey={['daily-report-detail', dailyReportId]}
        onStateChange={handleStateChange}
        tableId={tableId}
        paramNamespace={tableId}
        facetedFilters={facetedFilters}
        initialColumnVisibility={mergedColumnVisibility}
        initialFilterVisibility={mergedFilterVisibility}
        showFilterToggle={true}
        searchPlaceholder="Buscar por descripción, remito, cliente, servicio..."
        emptyMessage="No hay registros en este parte diario"
        enableRowSelection={true}
        showRowSelection={true}
        onRowSelectionChange={setSelectedRows}
        toolbarActions={
          toolbarActions || topActionBar ? (
            <>
              {toolbarActions}
              {topActionBar}
            </>
          ) : undefined
        }
        mobileCards
        rowClassName={getRowClassName}
        data-testid="daily-report-detail-table"
        exportConfig={{
          fetchAllData: () => getDailyReportDetailForExport(dailyReportId, currentParams),
          options: {
            filename: 'detalle-parte-diario',
            sheetName: 'Detalle Parte Diario',
            title: 'Detalle de Parte Diario',
          },
          formatters: exportFormatters,
        }}
      />

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      <DeleteRowDialog
        open={deleteRow !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteRow(null);
        }}
        row={deleteRow}
        dailyReportId={dailyReportId}
        onSuccess={invalidateDetail}
      />

      {remitRow && (
        <RemitosManagerModal
          dailyReportRowId={remitRow.id}
          customerName={remitRow.customerName}
          isOpen
          onClose={() => setRemitRow(null)}
        />
      )}

      <ServiceDetailDialog
        open={detailRowId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailRowId(null);
        }}
        rowId={detailRowId}
      />

      <HistoryDialog
        open={historyRowId !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryRowId(null);
        }}
        rowId={historyRowId}
      />

      <BulkEditModal
        open={showBulkEdit}
        onOpenChange={setShowBulkEdit}
        selectedRows={selectedRows}
        dailyReportId={dailyReportId}
        onSuccess={() => {
          invalidateDetail();
          setSelectedRows([]);
        }}
      />

      <CloneRowsDialog
        open={showClone}
        onOpenChange={setShowClone}
        mode={selectedRows.length > 0 ? 'selected' : 'all'}
        selectedRows={selectedRows}
        dailyReportId={dailyReportId}
        reportDate={reportDate}
        onSuccess={() => {
          invalidateDetail();
          setSelectedRows([]);
        }}
      />

      {isFormOpen && (
        <DailyReportRowForm
          dailyReportId={dailyReportId}
          reportDate={reportDate}
          customers={formCustomers}
          employees={formEmployees}
          vehicles={formVehicles}
          otherEquipment={formOtherEquipment}
          onSuccess={invalidateDetail}
        />
      )}
    </>
  );
}
