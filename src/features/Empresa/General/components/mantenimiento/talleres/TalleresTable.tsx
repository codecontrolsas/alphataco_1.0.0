'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { DataTable } from '@/shared/components/common/DataTable/DataTable';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE, type TablePreferences } from '@/shared/components/common/DataTable/helpers';
import { inMemoryFacetedFilterFn, inMemoryTextFilterFn } from '@/shared/components/common/DataTable/in-memory';
import { type DataTableFacetedFilterConfig } from '@/shared/components/common/DataTable/types';
import { useDataTableFilter } from '@/shared/components/common/DataTable/useDataTableFilter';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { Building2, Check, CircleOff, Layers, MapPin, Pencil, Truck, X } from 'lucide-react';
import { use, useCallback, useMemo, type ReactNode } from 'react';
import type { Workshop } from '../../../actions/workshops.server';

const TABLE_ID = 'workshops';

const TYPE_LABELS: Record<Workshop['type'], string> = { interno: 'Interno', externo: 'Externo' };
const ACTIVE_LABELS: Record<'true' | 'false', string> = { true: 'Activo', false: 'Inactivo' };

/** Filtro facetado de una columna que puede estar vacía: el valor vacío se filtra como "Sin asignar". */
function nullableFacetedFilterFn(row: Row<Workshop>, id: string, value: unknown) {
  const values = Array.isArray(value) ? value.map(String) : [];
  if (values.length === 0) return true;
  const cell = String(row.getValue(id) ?? '');
  return cell === '' ? values.includes(NULL_FILTER_VALUE) : values.includes(cell);
}

export function getTalleresColumns(
  onEdit: (workshop: Workshop) => void,
  canEdit: boolean,
  onViewSectors?: (workshop: Workshop) => void
): ColumnDef<Workshop>[] {
  const columns: ColumnDef<Workshop>[] = [
    {
      accessorKey: 'name',
      ...titled('Nombre'),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'type',
      ...titled('Tipo'),
      cell: ({ row }) => {
        const Icon = row.original.type === 'interno' ? Building2 : Truck;
        return (
          <Badge variant={row.original.type === 'interno' ? 'default' : 'secondary'}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {TYPE_LABELS[row.original.type]}
          </Badge>
        );
      },
      filterFn: inMemoryFacetedFilterFn,
    },
    {
      id: 'address',
      accessorFn: (row) => row.address ?? '',
      ...titled('Dirección'),
      cell: ({ row }) => row.original.address || <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'province',
      accessorFn: (row) => row.provinces?.name ?? '',
      ...titled('Provincia'),
      cell: ({ row }) => row.original.provinces?.name || <span className="text-muted-foreground">-</span>,
      filterFn: nullableFacetedFilterFn,
    },
    {
      id: 'city',
      accessorFn: (row) => row.cities?.name ?? '',
      ...titled('Ciudad'),
      cell: ({ row }) => row.original.cities?.name || <span className="text-muted-foreground">-</span>,
      filterFn: nullableFacetedFilterFn,
    },
    {
      id: 'provider_name',
      accessorFn: (row) => row.provider_name ?? '',
      ...titled('Proveedor'),
      cell: ({ row }) => row.original.provider_name || <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'provider_phone',
      accessorFn: (row) => row.provider_phone ?? '',
      ...titled('Teléfono proveedor'),
      cell: ({ row }) => row.original.provider_phone || <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'provider_email',
      accessorFn: (row) => row.provider_email ?? '',
      ...titled('Email proveedor'),
      cell: ({ row }) => row.original.provider_email || <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'latitude',
      accessorFn: (row) => (row.latitude == null ? '' : String(row.latitude)),
      ...titled('Latitud'),
      cell: ({ row }) => row.original.latitude ?? <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'longitude',
      accessorFn: (row) => (row.longitude == null ? '' : String(row.longitude)),
      ...titled('Longitud'),
      cell: ({ row }) => row.original.longitude ?? <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'is_active',
      accessorFn: (row) => String(row.is_active),
      ...titled('Estado'),
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <X className="h-3 w-3" aria-hidden="true" />
          )}
          {row.original.is_active ? ACTIVE_LABELS.true : ACTIVE_LABELS.false}
        </Badge>
      ),
      filterFn: inMemoryFacetedFilterFn,
    },
  ];

  if (canEdit || onViewSectors) {
    columns.push({
      id: 'actions',
      meta: { title: 'Acciones', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {onViewSectors && row.original.type === 'interno' ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Ver sectores del taller ${row.original.name}`}
              onClick={() => onViewSectors(row.original)}
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              Ver sectores
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Editar taller ${row.original.name}`}
              onClick={() => onEdit(row.original)}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Editar
            </Button>
          ) : null}
        </div>
      ),
    });
  }

  return columns;
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b));
}

/** Id (ancla) del bloque de sectores y `tableId` de su tabla, para el atajo "Ver sectores". */
const SECTORS_ANCHOR_ID = 'sectores-taller';
const SECTORS_TABLE_ID = 'workshop-sectors';

function TalleresTable({
  workshops,
  preferences,
  onEdit,
  toolbarActions,
}: {
  workshops: Promise<Workshop[]>;
  preferences: Promise<TablePreferences>;
  /** Abre el Sheet de edición (lo maneja `TalleresTabClient`). */
  onEdit: (workshop: Workshop) => void;
  /** Botón "Nuevo taller" en la barra de la tabla. */
  toolbarActions?: ReactNode;
}) {
  const workshopsData = use(workshops);
  const prefs = use(preferences);
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('configuracion', 'talleres', 'update');
  const canViewSectors = hasPermission('configuracion', 'sectores_taller', 'view');

  // "Ver sectores": filtra la tabla de sectores (mismo bloque apilado) por este taller y baja hasta ella.
  const [, setSectorsWorkshop] = useDataTableFilter(SECTORS_TABLE_ID, 'workshop');
  const handleViewSectors = useCallback(
    (workshop: Workshop) => {
      setSectorsWorkshop(workshop.name);
      document.getElementById(SECTORS_ANCHOR_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [setSectorsWorkshop]
  );

  // Los inactivos siempre al final; la lista se DERIVA de la prop para que un alta + refresh la muestre.
  const data = useMemo(
    () => [...workshopsData].sort((a, b) => Number(b.is_active) - Number(a.is_active)),
    [workshopsData]
  );
  const columns = useMemo(
    () => getTalleresColumns(onEdit, canEdit, canViewSectors ? handleViewSectors : undefined),
    [onEdit, canEdit, canViewSectors, handleViewSectors]
  );

  const facetedFilters = useMemo<DataTableFacetedFilterConfig[]>(() => {
    const provinces = uniqueSorted(data.map((w) => w.provinces?.name));
    const cities = uniqueSorted(data.map((w) => w.cities?.name));
    const nullOption = (hasNull: boolean) =>
      hasNull ? [{ value: NULL_FILTER_VALUE, label: 'Sin asignar', icon: CircleOff }] : [];
    return [
      { columnId: 'name', title: 'Nombre', type: 'text', placeholder: 'Buscar por nombre...' },
      {
        columnId: 'type',
        title: 'Tipo',
        options: (['interno', 'externo'] as const).map((t) => ({
          value: t,
          label: TYPE_LABELS[t],
          icon: t === 'interno' ? Building2 : Truck,
        })),
      },
      {
        columnId: 'is_active',
        title: 'Estado',
        options: [
          { value: 'true', label: ACTIVE_LABELS.true, icon: Check },
          { value: 'false', label: ACTIVE_LABELS.false, icon: X },
        ],
      },
      { columnId: 'address', title: 'Dirección', type: 'text', placeholder: 'Buscar por dirección...' },
      {
        columnId: 'province',
        title: 'Provincia',
        options: [
          ...provinces.map((name) => ({ value: name, label: name, icon: MapPin })),
          ...nullOption(data.some((w) => !w.provinces)),
        ],
      },
      {
        columnId: 'city',
        title: 'Ciudad',
        options: [
          ...cities.map((name) => ({ value: name, label: name, icon: MapPin })),
          ...nullOption(data.some((w) => !w.cities)),
        ],
      },
      { columnId: 'provider_name', title: 'Proveedor', type: 'text', placeholder: 'Buscar por proveedor...' },
      { columnId: 'provider_phone', title: 'Teléfono proveedor', type: 'text', placeholder: 'Buscar por teléfono...' },
      { columnId: 'provider_email', title: 'Email proveedor', type: 'text', placeholder: 'Buscar por email...' },
      { columnId: 'latitude', title: 'Latitud', type: 'text', placeholder: 'Buscar por latitud...' },
      { columnId: 'longitude', title: 'Longitud', type: 'text', placeholder: 'Buscar por longitud...' },
    ];
  }, [data]);

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={columns}
        data={data}
        totalRows={data.length}
        searchParams={{}}
        inMemory
        mobileCards
        toolbarActions={toolbarActions}
        tableId={TABLE_ID}
        paramNamespace={TABLE_ID}
        facetedFilters={facetedFilters}
        initialColumnVisibility={
          prefs.columnVisibility ?? { latitude: false, longitude: false, provider_phone: false, provider_email: false }
        }
        initialFilterVisibility={prefs.filterVisibility ?? { name: true, type: true, is_active: true }}
        searchPlaceholder="Buscar por nombre, dirección o proveedor"
        showSearch
        showFilterToggle
        emptyMessage="No hay talleres cargados"
        data-testid="workshops-table"
        exportConfig={{
          fetchAllData: async () => data,
          options: { filename: 'talleres', title: 'Talleres', sheetName: 'Talleres' },
          formatters: {
            type: (value) => TYPE_LABELS[value as Workshop['type']] ?? String(value ?? ''),
            is_active: (value) => (String(value) === 'true' ? ACTIVE_LABELS.true : ACTIVE_LABELS.false),
          },
        }}
      />
    </div>
  );
}

export default TalleresTable;
