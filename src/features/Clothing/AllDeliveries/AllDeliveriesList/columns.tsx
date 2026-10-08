'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DeliveryStatusBadge } from '@/features/Clothing/components/DeliveryStatusBadge';
import { DELIVERY_STATUS_ACTIVE, DELIVERY_STATUS_CANCELLED } from '@/features/Clothing/lib/delivery-stock-where';
import { DeliveryReceiptButton } from '@/features/Clothing/pdf/DeliveryReceiptButton';
import { clothingDeliveryTypeBadges, clothingDeliveryTypeLabels } from '@/features/Clothing/utils/mappers';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from 'lucide-react';
import moment from 'moment';
import type { AllDeliveryListItem } from './actions.server';

// ============================================================================
// COLUMNS HIDDEN BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = ['notes', 'delivered_by_file', 'employee_file'];

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns(): ColumnDef<AllDeliveryListItem>[] {
  return [
    // ── select ────────────────────────────────────────────────────────────────
    {
      id: 'select',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todas las visibles"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar entrega"
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },

    // ── delivered_at ──────────────────────────────────────────────────────────
    {
      accessorKey: 'delivered_at',
      id: 'delivered_at',
      meta: { title: 'Fecha de entrega' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha de entrega" />,
      cell: ({ row }) => (row.original.delivered_at ? moment(row.original.delivered_at).format('DD/MM/YYYY') : '-'),
    },

    // ── employee_file — legajo del destinatario ───────────────────────────────
    {
      id: 'employee_file',
      accessorFn: (row) => row.employees_clothing_deliveries_employee_idToemployees?.file ?? '',
      meta: { title: 'Legajo (destinatario)' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Legajo (destinatario)" />,
      cell: ({ row }) => {
        const file = row.original.employees_clothing_deliveries_employee_idToemployees?.file;
        return <span className="font-mono text-xs">{file ?? '-'}</span>;
      },
    },

    // ── employee_id — nombre del destinatario ─────────────────────────────────
    {
      id: 'employee_id',
      accessorFn: (row) => {
        const emp = row.employees_clothing_deliveries_employee_idToemployees;
        if (!emp) return null;
        return emp.id;
      },
      meta: { title: 'Destinatario' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Destinatario" />,
      cell: ({ row }) => {
        const emp = row.original.employees_clothing_deliveries_employee_idToemployees;
        if (!emp) return <span className="text-muted-foreground">-</span>;
        return (
          <span>
            {emp.lastname ?? ''} {emp.firstname ?? ''}
          </span>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const emp = row.original.employees_clothing_deliveries_employee_idToemployees;
        const id = emp?.id ?? null;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── delivery_type ─────────────────────────────────────────────────────────
    {
      accessorKey: 'delivery_type',
      id: 'delivery_type',
      meta: { title: 'Tipo de entrega' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de entrega" />,
      cell: ({ row }) => {
        const type = row.original.delivery_type;
        if (!type) return <span className="text-muted-foreground">-</span>;
        return <Badge variant={clothingDeliveryTypeBadges[type]}>{clothingDeliveryTypeLabels[type]}</Badge>;
      },
      filterFn: (row, id, value: string[]) => {
        const val = row.getValue(id);
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(val as string);
      },
    },

    // ── status (virtual: cancelled_at) ────────────────────────────────────────
    {
      id: 'status',
      accessorFn: (row) => (row.cancelled_at ? DELIVERY_STATUS_CANCELLED : DELIVERY_STATUS_ACTIVE),
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => (
        <DeliveryStatusBadge cancelledAt={row.original.cancelled_at} cancelReason={row.original.cancel_reason} />
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) as string),
    },

    // ── delivered_by_file — legajo del que entrega ────────────────────────────
    {
      id: 'delivered_by_file',
      accessorFn: (row) => row.employees_clothing_deliveries_delivered_by_idToemployees?.file ?? '',
      meta: { title: 'Legajo (entregó)' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Legajo (entregó)" />,
      cell: ({ row }) => {
        const file = row.original.employees_clothing_deliveries_delivered_by_idToemployees?.file;
        return <span className="font-mono text-xs">{file ?? '-'}</span>;
      },
    },

    // ── delivered_by ──────────────────────────────────────────────────────────
    {
      id: 'delivered_by_id',
      accessorFn: (row) => {
        const emp = row.employees_clothing_deliveries_delivered_by_idToemployees;
        if (!emp) return null;
        return emp.id;
      },
      meta: { title: 'Entregado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Entregado por" />,
      cell: ({ row }) => {
        const emp = row.original.employees_clothing_deliveries_delivered_by_idToemployees;
        if (!emp) return <span className="text-muted-foreground">-</span>;
        return (
          <span>
            {emp.lastname ?? ''} {emp.firstname ?? ''}
          </span>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const emp = row.original.employees_clothing_deliveries_delivered_by_idToemployees;
        const id = emp?.id ?? null;
        if (id == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(id);
      },
    },

    // ── items_detail (virtual) ────────────────────────────────────────────────
    {
      id: 'items_detail',
      accessorFn: () => null,
      meta: { title: 'Artículos' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Artículos" />,
      cell: ({ row }) => {
        const items = row.original.clothing_delivery_items ?? [];
        if (items.length === 0) {
          return <span className="text-muted-foreground">Sin artículos</span>;
        }

        const itemLabels = items.map((item) => {
          const name = item.clothing_items?.name ?? 'Artículo';
          const brand = item.clothing_brands?.name;
          const size = item.clothing_sizes?.name;
          const qty = item.quantity;
          const detail = [brand, size].filter(Boolean).join(', ');
          return `${name}${detail ? ` (${detail})` : ''} x${qty}`;
        });

        const firstLabel = itemLabels[0];
        const hasMore = itemLabels.length > 1;

        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex cursor-default">
                  <span className="text-sm">
                    {firstLabel}
                    {hasMore && <span className="ml-1 text-muted-foreground">+{itemLabels.length - 1} más</span>}
                  </span>
                </div>
              </TooltipTrigger>
              {hasMore && (
                <TooltipContent className="rounded-lg bg-black p-2 text-white">
                  <div className="flex flex-col gap-1">
                    {itemLabels.map((label, idx) => (
                      <span key={idx} className="text-sm">
                        {label}
                      </span>
                    ))}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
    },

    // ── has_signature (computed boolean) ─────────────────────────────────────
    {
      id: 'has_signature',
      accessorFn: (row) => (row.signature_url != null ? 'true' : 'false'),
      meta: { title: 'Firma' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Firma" />,
      cell: ({ row }) =>
        row.original.signature_url ? (
          <Check className="h-4 w-4 text-green-600" aria-label="Con firma" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground" aria-label="Sin firma" />
        ),
      filterFn: (row, id, value: string[]) => {
        return value.includes(String(row.getValue(id)));
      },
    },

    // ── notes (hidden by default) ─────────────────────────────────────────────
    {
      accessorKey: 'notes',
      id: 'notes',
      meta: { title: 'Notas' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Notas" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.notes ?? '-'}</span>,
    },

    // ── actions — PDF download ────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => <DeliveryReceiptButton deliveryId={row.original.id} compact />,
    },
  ];
}
