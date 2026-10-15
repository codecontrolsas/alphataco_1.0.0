'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { dailyReportTypeServiceLabels } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import type { DailyReportDetailRow } from '../types';
import { CustomerEquipmentBadgeCell } from './badge-cells';

/** Status que NO permiten selección. Los registros ejecutados SÍ se pueden seleccionar
 *  (el botón de edición masiva tiene su propio guard que los excluye). */
const NON_SELECTABLE_STATUSES = new Set(['sin_recursos_asignados', 'reprogramado']);

// ============================================================================
// COLUMNAS — Selección, identidad del servicio (cliente/servicio/ítem/sector/área)
// y equipo del cliente
// ============================================================================

export function getResourceColumns(): ColumnDef<DailyReportDetailRow>[] {
  return [
    // ── Select (checkbox) ────────────────────────────────────────────────────
    {
      id: 'select',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todos"
          className="cursor-pointer"
        />
      ),
      cell: ({ row }) => {
        const disabled = NON_SELECTABLE_STATUSES.has(row.original.status);
        return (
          <Checkbox
            checked={row.getIsSelected()}
            disabled={disabled}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Seleccionar fila"
            className={disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}
          />
        );
      },
    },

    // ── Cliente (FK UUID nullable) ────────────────────────────────────────────
    {
      id: 'customer',
      accessorFn: (row) => row.customers?.name ?? '',
      meta: { title: 'Cliente' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
      cell: ({ row }) => <span className="font-medium">{row.original.customers?.name ?? '—'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.customer_id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Servicio (FK UUID nullable) ───────────────────────────────────────────
    {
      id: 'service',
      accessorFn: (row) => row.customer_services?.service_name ?? '',
      meta: { title: 'Servicio' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Servicio" />,
      cell: ({ row }) => <span>{row.original.customer_services?.service_name ?? '—'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.service_id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Ítem (FK UUID nullable) ──────────────────────────────────────────────
    {
      id: 'item',
      accessorFn: (row) => row.service_items?.item_name ?? '',
      meta: { title: 'Ítem' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ítem" />,
      cell: ({ row }) => <span>{row.original.service_items?.item_name ?? '—'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const id = row.original.item_id;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── Sector (FK nullable via service_sectors → sectors) ───────────────────
    {
      id: 'sector',
      accessorFn: (row) => row.service_sectors?.sectors?.name ?? '',
      meta: { title: 'Sector' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sector" />,
      cell: ({ row }) => {
        const name = row.original.service_sectors?.sectors?.name;
        if (!name) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <Badge variant="outline" className="font-medium">
            {name}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const sectorId = row.original.service_sectors?.sectors?.id;
        if (sectorId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(sectorId);
      },
    },

    // ── Área (FK nullable via service_areas → areas_cliente) ─────────────────
    {
      id: 'area',
      accessorFn: (row) => row.service_areas?.areas_cliente?.descripcion_corta ?? '',
      meta: { title: 'Área' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Área" />,
      cell: ({ row }) => {
        const name = row.original.service_areas?.areas_cliente?.descripcion_corta;
        if (!name) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <Badge variant="outline" className="font-medium">
            {name}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const areaId = row.original.service_areas?.areas_cliente?.id;
        if (areaId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(areaId);
      },
    },

    // ── Tipo Servicio (enum nullable) ─────────────────────────────────────────
    {
      accessorKey: 'type_service',
      meta: { title: 'Tipo Servicio' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo Servicio" />,
      cell: ({ row }) => {
        const val = row.original.type_service;
        if (!val) return <span className="text-muted-foreground text-xs">—</span>;
        return <Badge className="font-medium capitalize">{dailyReportTypeServiceLabels[val] ?? val}</Badge>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id) as string | null;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val);
      },
    },

    // ── Equipo Cliente (M:M — virtual) — movido arriba de los roles ──────────
    {
      id: 'customer_equipment',
      accessorFn: (row) =>
        row.dailyreport_customer_equipment_relations
          .map((r) => r.equipos_clientes?.name ?? '')
          .filter(Boolean)
          .join(', '),
      meta: { title: 'Equipo cliente' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo cliente" />,
      cell: ({ row }) => <CustomerEquipmentBadgeCell row={row.original} />,
      filterFn: (row, _id, value: string[]) => {
        const relations = row.original.dailyreport_customer_equipment_relations;
        if (!relations || relations.length === 0) return value.includes(NULL_FILTER_VALUE);
        return relations.some((r) => r.customer_equipment_id && value.includes(r.customer_equipment_id));
      },
    },
  ];
}
