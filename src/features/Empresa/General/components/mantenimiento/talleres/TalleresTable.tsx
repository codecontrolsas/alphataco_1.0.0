'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import {
  DataTable,
  DataTableColumnHeader,
  inMemoryFacetedFilterFn,
  inMemoryTextFilterFn,
  type DataTableFacetedFilterConfig,
  type TablePreferences,
} from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { Building2, Check, CircleOff, MapPin, Pencil, Truck, X } from 'lucide-react';
import { use, useMemo } from 'react';
import type { Workshop } from '../../../actions/workshops.server';
import { useTalleresStore } from './store/talleres.store';

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

export function getTalleresColumns(onEdit: (workshop: Workshop) => void, canEdit: boolean): ColumnDef<Workshop>[] {
  const columns: ColumnDef<Workshop>[] = [
    {
      accessorKey: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      accessorKey: 'type',
      meta: { title: 'Tipo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
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
      meta: { title: 'Dirección' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Dirección" />,
      cell: ({ row }) => row.original.address || <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'province',
      accessorFn: (row) => row.provinces?.name ?? '',
      meta: { title: 'Provincia' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Provincia" />,
      cell: ({ row }) => row.original.provinces?.name || <span className="text-muted-foreground">-</span>,
      filterFn: nullableFacetedFilterFn,
    },
    {
      id: 'city',
      accessorFn: (row) => row.cities?.name ?? '',
      meta: { title: 'Ciudad' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ciudad" />,
      cell: ({ row }) => row.original.cities?.name || <span className="text-muted-foreground">-</span>,
      filterFn: nullableFacetedFilterFn,
    },
    {
      id: 'provider_name',
      accessorFn: (row) => row.provider_name ?? '',
      meta: { title: 'Proveedor' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Proveedor" />,
      cell: ({ row }) => row.original.provider_name || <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'provider_phone',
      accessorFn: (row) => row.provider_phone ?? '',
      meta: { title: 'Teléfono proveedor' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Teléfono proveedor" />,
      cell: ({ row }) => row.original.provider_phone || <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'provider_email',
      accessorFn: (row) => row.provider_email ?? '',
      meta: { title: 'Email proveedor' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email proveedor" />,
      cell: ({ row }) => row.original.provider_email || <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'latitude',
      accessorFn: (row) => (row.latitude == null ? '' : String(row.latitude)),
      meta: { title: 'Latitud' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Latitud" />,
      cell: ({ row }) => row.original.latitude ?? <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'longitude',
      accessorFn: (row) => (row.longitude == null ? '' : String(row.longitude)),
      meta: { title: 'Longitud' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Longitud" />,
      cell: ({ row }) => row.original.longitude ?? <span className="text-muted-foreground">-</span>,
      filterFn: inMemoryTextFilterFn,
    },
    {
      id: 'is_active',
      accessorFn: (row) => String(row.is_active),
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
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

  if (canEdit) {
    columns.push({
      id: 'actions',
      meta: { title: 'Acciones', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
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
      ),
    });
  }

  return columns;
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) => a.localeCompare(b));
}

export function TalleresTable({
  workshops,
  preferences,
}: {
  workshops: Promise<Workshop[]>;
  preferences: Promise<TablePreferences>;
}) {
  const workshopsData = use(workshops);
  const prefs = use(preferences);
  const onEdit = useTalleresStore((state) => state.setWorkshop);
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('configuracion', 'talleres', 'update');

  // Los inactivos siempre al final; la lista se DERIVA de la prop para que un alta + refresh la muestre.
  const data = useMemo(
    () => [...workshopsData].sort((a, b) => Number(b.is_active) - Number(a.is_active)),
    [workshopsData]
  );
  const columns = useMemo(() => getTalleresColumns(onEdit, canEdit), [onEdit, canEdit]);

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
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-xl font-bold">Talleres</h2>
      <DataTable
        columns={columns}
        data={data}
        totalRows={data.length}
        searchParams={{}}
        inMemory
        mobileCards
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
