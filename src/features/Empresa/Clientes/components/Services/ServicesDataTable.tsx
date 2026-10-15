'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DataTable,
  DataTableColumnHeader,
  inMemoryFacetedFilterFn,
  inMemoryTextFilterFn,
  type DataTableFacetedFilterConfig,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { argentinaDate } from '@/shared/lib/argentina-time';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { AlertCircle, Building2, CheckCircle2, CircleOff, Clock, Eye, Layers, MapPin, XCircle } from 'lucide-react';
import { useMemo } from 'react';
import type { CustomerServiceRow } from '../../actions/services.server';
import { CustomersTableSkeleton } from '../../fallback/CustomersTableSkeleton';
import { useTablePreferences } from '../../hooks/useTablePreferences';
import {
  contractValidityTone,
  daysUntilDbDate,
  dbDateToIso,
  formatDbDate,
  type ValidityTone,
} from '../../lib/service-dates';

interface ServicesDataTableProps {
  services: CustomerServiceRow[];
  /** Comercial lista los contratos de toda la empresa (con columna Cliente); la ficha, los de un cliente. */
  showCustomerColumn: boolean;
  onOpen: (service: CustomerServiceRow) => void;
}

const TABLE_ID_COMPANY = 'company-contracts';
const TABLE_ID_CUSTOMER = 'customer-contracts';

/** Columnas que arrancan ocultas (las del detalle fino). */
const HIDDEN_COLUMNS_BY_DEFAULT = ['sectors'];

const STATUS_LABELS = { true: 'Activo', false: 'Inactivo' } as const;
const STATUS_ICONS = { true: CheckCircle2, false: XCircle } as const;

function areaNames(service: CustomerServiceRow): string[] {
  return service.service_areas.map((a) => a.areas_cliente.nombre);
}

function sectorNames(service: CustomerServiceRow): string[] {
  return service.service_sectors.map((s) => s.sectors.name);
}

/** Igual que antes de la migración: `null` se mostraba como inactivo. */
function isServiceActive(service: CustomerServiceRow): boolean {
  return service.is_active === true;
}

const emptyValue = <span className="text-muted-foreground">-</span>;

/** Etiquetas con "+N" y el resto en un tooltip enfocable con teclado (áreas y sectores del contrato). */
function NamesBadge({ names, label }: { names: string[]; label: string }) {
  if (names.length === 0) return emptyValue;
  const [first, ...rest] = names;
  if (rest.length === 0) return <Badge variant="default">{first}</Badge>;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${label}: ${names.join(', ')}`}
            className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]"
          >
            <Badge variant="default">
              {first} +{rest.length}
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-1">
            {names.map((name) => (
              <p key={name}>{name}</p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Vigencia: tono `warn` si vence en 30 días o menos, `danger` si ya venció y el contrato sigue activo. */
function ValidityCell({ service, tone, today }: { service: CustomerServiceRow; tone: ValidityTone; today: string }) {
  const label = formatDbDate(service.service_validity);
  if (tone === 'expiring' && service.service_validity) {
    const days = daysUntilDbDate(service.service_validity, today);
    return (
      <Badge variant="warning" className="gap-1 tabular-nums">
        <Clock aria-hidden="true" />
        {label}
        <span className="sr-only">{days === 0 ? ', vence hoy' : `, vence en ${days} días`}</span>
      </Badge>
    );
  }
  if (tone === 'expired') {
    return (
      <Badge variant="destructive" className="gap-1 tabular-nums">
        <AlertCircle aria-hidden="true" />
        {label}
        <span className="sr-only">, vencido</span>
      </Badge>
    );
  }
  return <span className="tabular-nums">{label}</span>;
}

/** Filtro M:M por nombre: el valor de la fila es la lista de nombres; `NULL_FILTER_VALUE` = sin ninguno. */
function namesFilterFn(row: Row<CustomerServiceRow>, id: string, value: string[]): boolean {
  if (!Array.isArray(value) || value.length === 0) return true;
  const names = row.getValue<string[]>(id);
  if (names.length === 0) return value.includes(NULL_FILTER_VALUE);
  return value.some((v) => names.includes(v));
}

export function getServiceColumns(
  showCustomerColumn: boolean,
  today: string,
  onOpen: (service: CustomerServiceRow) => void
): ColumnDef<CustomerServiceRow>[] {
  const columns: ColumnDef<CustomerServiceRow>[] = [
    {
      accessorKey: 'service_name',
      meta: { title: 'Contrato' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Contrato" />,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-left font-medium whitespace-normal"
          onClick={() => onOpen(row.original)}
        >
          {row.original.service_name}
        </Button>
      ),
      filterFn: inMemoryTextFilterFn,
    },
  ];

  if (showCustomerColumn) {
    columns.push({
      id: 'customer',
      accessorFn: (row) => row.customers?.name ?? '',
      meta: { title: 'Cliente' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
      cell: ({ row }) => row.original.customers?.name || emptyValue,
      filterFn: inMemoryFacetedFilterFn,
    });
  }

  columns.push(
    {
      id: 'contract_number',
      accessorFn: (row) => row.contract_number ?? '',
      meta: { title: 'N° Contrato' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° Contrato" />,
      cell: ({ row }) => row.original.contract_number || emptyValue,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'areas',
      accessorFn: (row) => areaNames(row),
      meta: { title: 'Áreas' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Áreas" />,
      enableSorting: false,
      cell: ({ row }) => <NamesBadge names={areaNames(row.original)} label="Áreas" />,
      filterFn: namesFilterFn,
    },
    {
      id: 'sectors',
      accessorFn: (row) => sectorNames(row),
      meta: { title: 'Sectores' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sectores" />,
      enableSorting: false,
      cell: ({ row }) => <NamesBadge names={sectorNames(row.original)} label="Sectores" />,
      filterFn: namesFilterFn,
    },
    {
      id: 'service_start',
      // `YYYY-MM-DD`: ordena bien como texto; la celda muestra DD/MM/YYYY.
      accessorFn: (row) => dbDateToIso(row.service_start),
      meta: { title: 'Inicio' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Inicio" />,
      cell: ({ row }) => <span className="tabular-nums">{formatDbDate(row.original.service_start)}</span>,
    },
    {
      id: 'service_validity',
      accessorFn: (row) => dbDateToIso(row.service_validity),
      meta: { title: 'Vigencia' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vigencia" />,
      cell: ({ row }) => (
        <ValidityCell
          service={row.original}
          tone={contractValidityTone(row.original.service_validity, isServiceActive(row.original), today)}
          today={today}
        />
      ),
    },
    {
      id: 'status',
      accessorFn: (row) => String(isServiceActive(row)),
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const active = isServiceActive(row.original);
        const key = String(active) as keyof typeof STATUS_LABELS;
        const Icon = STATUS_ICONS[key];
        return (
          <Badge variant={active ? 'success' : 'destructive'}>
            <Icon aria-hidden="true" />
            {STATUS_LABELS[key]}
          </Badge>
        );
      },
      filterFn: inMemoryFacetedFilterFn,
    },
    {
      id: 'actions',
      meta: { title: 'Acciones', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Ver contrato ${row.original.service_name}`}
          onClick={() => onOpen(row.original)}
        >
          <Eye className="h-4 w-4" />
          Ver
        </Button>
      ),
    }
  );

  return columns;
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/**
 * Contratos (de un cliente o de toda la empresa): un catálogo chico que llega completo del servidor, así que
 * ordena, filtra y pagina en memoria. Las fechas son columnas `date` y no tienen filtro de rango: `inMemory`
 * no resuelve `dateRange`; se ordenan y exportan.
 */
export function ServicesDataTable({ services, showCustomerColumn, onOpen }: ServicesDataTableProps) {
  const tableId = showCustomerColumn ? TABLE_ID_COMPANY : TABLE_ID_CUSTOMER;
  const preferences = useTablePreferences(tableId);
  // "Hoy" en hora argentina, una vez por montaje: el servidor corre en UTC y el navegador en cualquier zona.
  const today = useMemo(() => argentinaDate(), []);

  const columns = useMemo(
    () => getServiceColumns(showCustomerColumn, today, onOpen),
    [showCustomerColumn, today, onOpen]
  );

  const facetedFilters = useMemo<DataTableFacetedFilterConfig[]>(() => {
    const areas = sortedUnique(services.flatMap(areaNames));
    const sectors = sortedUnique(services.flatMap(sectorNames));
    const hasNoAreas = services.some((s) => s.service_areas.length === 0);
    const hasNoSectors = services.some((s) => s.service_sectors.length === 0);
    const filters: DataTableFacetedFilterConfig[] = [
      { columnId: 'service_name', title: 'Contrato', type: 'text', placeholder: 'Buscar por contrato...' },
    ];
    if (showCustomerColumn) {
      filters.push({
        columnId: 'customer',
        title: 'Cliente',
        options: sortedUnique(services.map((s) => s.customers?.name ?? '')).map((name) => ({
          value: name,
          label: name,
          icon: Building2,
        })),
      });
    }
    filters.push(
      { columnId: 'contract_number', title: 'N° Contrato', type: 'text', placeholder: 'Buscar por número...' },
      {
        columnId: 'areas',
        title: 'Áreas',
        options: [
          ...areas.map((name) => ({ value: name, label: name, icon: MapPin })),
          ...(hasNoAreas ? [{ value: NULL_FILTER_VALUE, label: 'Sin afectar', icon: CircleOff }] : []),
        ],
      },
      {
        columnId: 'sectors',
        title: 'Sectores',
        options: [
          ...sectors.map((name) => ({ value: name, label: name, icon: Layers })),
          ...(hasNoSectors ? [{ value: NULL_FILTER_VALUE, label: 'Sin afectar', icon: CircleOff }] : []),
        ],
      },
      {
        columnId: 'status',
        title: 'Estado',
        options: (['true', 'false'] as const).map((value) => ({
          value,
          label: STATUS_LABELS[value],
          icon: STATUS_ICONS[value],
        })),
      }
    );
    return filters;
  }, [services, showCustomerColumn]);

  const initialColumnVisibility = useMemo(() => {
    const saved = preferences.data?.columnVisibility;
    if (saved && Object.keys(saved).length > 0) return saved;
    return Object.fromEntries(HIDDEN_COLUMNS_BY_DEFAULT.map((id) => [id, false]));
  }, [preferences.data]);

  // Solo 3 filtros a la vista; el resto se activa con el toggle. Las preferencias guardadas mandan.
  const initialFilterVisibility = useMemo(() => {
    const saved = preferences.data?.filterVisibility;
    if (saved && Object.keys(saved).length > 0) return saved;
    const visible = showCustomerColumn
      ? ['service_name', 'customer', 'status']
      : ['service_name', 'contract_number', 'status'];
    return Object.fromEntries(facetedFilters.map((f) => [f.columnId, visible.includes(f.columnId)]));
  }, [preferences.data, facetedFilters, showCustomerColumn]);

  if (preferences.isPending) return <CustomersTableSkeleton rows={4} />;

  return (
    <DataTable
      columns={columns}
      data={services}
      totalRows={services.length}
      searchParams={{}}
      inMemory
      mobileCards
      tableId={tableId}
      paramNamespace={tableId}
      facetedFilters={facetedFilters}
      initialColumnVisibility={initialColumnVisibility}
      initialFilterVisibility={initialFilterVisibility}
      searchPlaceholder="Buscar por contrato, cliente o número"
      showSearch
      showFilterToggle
      emptyMessage={
        showCustomerColumn ? 'Todavía no hay contratos cargados' : 'Este cliente no tiene contratos cargados'
      }
      data-testid="contracts-table"
      exportConfig={{
        fetchAllData: async () => services,
        options: { filename: 'contratos', title: 'Contratos', sheetName: 'Contratos' },
        formatters: {
          areas: (value) => (Array.isArray(value) ? value.join(', ') : String(value ?? '')),
          sectors: (value) => (Array.isArray(value) ? value.join(', ') : String(value ?? '')),
          service_start: (_value, row) => formatDbDate(row.service_start),
          service_validity: (_value, row) => formatDbDate(row.service_validity),
          status: (_value, row) => (isServiceActive(row) ? 'Activo' : 'Inactivo'),
        },
      }}
    />
  );
}
