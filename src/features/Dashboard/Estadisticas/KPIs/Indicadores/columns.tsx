import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import moment from 'moment';
import type { KpiListItem } from './actions.server';

// ============================================================================
// TYPES
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT = [
  'number',
  'technical_support',
  'improvement_opportunities',
  'calculation_formula',
  'created_at',
];

// ============================================================================
// COLUMNS DEFINITION
// ============================================================================

export function getColumns(
  permissions: Permissions,
  onView: (kpi: KpiListItem) => void,
  onEdit: (kpi: KpiListItem) => void
): ColumnDef<KpiListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'kpis', 'update');

  return [
    // ── Código ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'code',
      id: 'code',
      meta: { title: 'Código' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Código" />,
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.code}</span>,
    },

    // ── Nombre ───────────────────────────────────────────────────────────────
    {
      accessorKey: 'name',
      id: 'name',
      meta: { title: 'Nombre' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },

    // ── Número (umbral) ──────────────────────────────────────────────────────
    {
      accessorKey: 'number',
      id: 'number',
      meta: { title: 'Número (Umbral)' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Número" />,
      cell: ({ row }) => <span>{row.original.number ?? <span className="text-muted-foreground">-</span>}</span>,
    },

    // ── Vigencia ─────────────────────────────────────────────────────────────
    {
      accessorKey: 'validity_date',
      id: 'validity_date',
      meta: { title: 'Vigencia' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Vigencia" />,
      cell: ({ row }) => {
        const date = row.original.validity_date;
        if (!date) return <span className="text-muted-foreground">-</span>;
        const formatted = moment(date).format('DD/MM/YYYY');
        const isExpired = moment(date).isBefore(moment(), 'day');
        return (
          <span className={isExpired ? 'text-red-500 font-medium' : ''}>
            {formatted}
            {isExpired && <span className="ml-1 text-xs">(Vencido)</span>}
          </span>
        );
      },
    },

    // ── Fórmula de Cálculo ────────────────────────────────────────────────────
    {
      accessorKey: 'calculation_formula',
      id: 'calculation_formula',
      meta: { title: 'Fórmula de Cálculo' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fórmula" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs truncate max-w-[200px] block">{row.original.calculation_formula}</span>
      ),
    },

    // ── Oportunidades de Mejora ───────────────────────────────────────────────
    {
      accessorKey: 'improvement_opportunities',
      id: 'improvement_opportunities',
      meta: { title: 'Oportunidades de Mejora' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Oportunidades de Mejora" />,
      cell: ({ row }) => (
        <span className="truncate max-w-[200px] block">
          {row.original.improvement_opportunities ?? <span className="text-muted-foreground">-</span>}
        </span>
      ),
      enableSorting: false,
    },

    // ── Soporte Técnico ───────────────────────────────────────────────────────
    {
      accessorKey: 'technical_support',
      id: 'technical_support',
      meta: { title: 'Soporte Técnico' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Soporte Técnico" />,
      cell: ({ row }) => {
        const value = row.original.technical_support;
        return <Badge variant={value ? 'success' : 'secondary'}>{value ? 'Sí' : 'No'}</Badge>;
      },
      filterFn: (row, _id, value: string[]) => {
        const val = row.original.technical_support;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(val));
      },
    },

    // ── Estado (is_active) ────────────────────────────────────────────────────
    {
      accessorKey: 'is_active',
      id: 'is_active',
      meta: { title: 'Estado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const isActive = row.original.is_active;
        return <Badge variant={isActive ? 'success' : 'secondary'}>{isActive ? 'Activo' : 'Inactivo'}</Badge>;
      },
      filterFn: (row, _id, value: string[]) => {
        const val = row.original.is_active;
        if (val == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(String(val));
      },
    },

    // ── Fecha de Creación ─────────────────────────────────────────────────────
    {
      accessorKey: 'created_at',
      id: 'created_at',
      meta: { title: 'Fecha de Creación' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Creado" />,
      cell: ({ row }) => {
        const date = row.original.created_at;
        if (!date) return <span className="text-muted-foreground">-</span>;
        return <span>{moment(date).format('DD/MM/YYYY')}</span>;
      },
    },

    // ── Acciones ──────────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="link"
            className="hover:text-blue-400 p-0 h-auto"
            onClick={() => onView(row.original)}
          >
            Ver
          </Button>
          {canUpdate && (
            <Button
              size="sm"
              variant="link"
              className="hover:text-blue-400 p-0 h-auto"
              onClick={() => onEdit(row.original)}
            >
              Editar
            </Button>
          )}
        </div>
      ),
    },
  ];
}
