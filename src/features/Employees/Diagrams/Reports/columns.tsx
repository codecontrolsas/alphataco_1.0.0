import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { Calendar, FileText, MessageSquare, User } from 'lucide-react';
import moment from 'moment';
import type { DiagramReportListItem } from './actions.server';

// ============================================================================
// COLUMNS HIDDEN BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at', 'cuil', 'comments'];

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export function getColumns(): ColumnDef<DiagramReportListItem>[] {
  return [
    // ── Select ──────────────────────────────────────────────────────────────
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todo"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar fila"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { title: '', excludeFromExport: true },
    },

    // ── Legajo (file number) — columna separada OBLIGATORIA ─────────────────
    {
      id: 'fileNumber',
      accessorFn: (row) => row.employees?.file ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Legajo" />,
      meta: { title: 'Legajo' },
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium tabular-nums">{row.original.employees?.file ?? '-'}</span>
        </div>
      ),
    },

    // ── Empleado (lastname + firstname) ───────────────────────────────────────
    {
      id: 'employee',
      accessorFn: (row) => `${row.employees?.lastname ?? ''} ${row.employees?.firstname ?? ''}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Empleado" />,
      meta: { title: 'Empleado' },
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">
            {row.original.employees?.lastname} {row.original.employees?.firstname}
          </span>
        </div>
      ),
      filterFn: (row, _id, value: string[]) => {
        const employeeId = row.original.employee_id;
        if (employeeId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(employeeId);
      },
    },

    // ── CUIL ─────────────────────────────────────────────────────────────────
    {
      id: 'cuil',
      accessorFn: (row) => row.employees?.cuil ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="CUIL" />,
      meta: { title: 'CUIL' },
      cell: ({ row }) => <span className="tabular-nums">{row.original.employees?.cuil ?? '-'}</span>,
    },

    // ── Puesto (company position — FK) ────────────────────────────────────────
    {
      id: 'companyPosition',
      accessorFn: (row) => row.employees?.company_positions?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Puesto" />,
      meta: { title: 'Puesto' },
      cell: ({ row }) => <span className="text-sm">{row.original.employees?.company_positions?.name ?? '-'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const positionId = row.original.employees?.company_positions?.id;
        if (positionId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(positionId);
      },
    },

    // ── Tipo de novedad — nombre completo (FK) ─────────────────────────────
    {
      id: 'diagramType',
      accessorFn: (row) => row.diagram_type_employees_diagram_diagram_typeTodiagram_type?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de novedad" />,
      meta: { title: 'Tipo de novedad' },
      cell: ({ row }) => {
        const dt = row.original.diagram_type_employees_diagram_diagram_typeTodiagram_type;
        return (
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm">{dt?.name ?? '-'}</span>
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const dtId = row.original.diagram_type;
        if (dtId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(dtId);
      },
    },

    // ── Novedad abreviada (badge con color) ───────────────────────────────────
    {
      id: 'shortDescription',
      accessorFn: (row) => row.diagram_type_employees_diagram_diagram_typeTodiagram_type?.short_description ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Novedad" />,
      meta: { title: 'Novedad (abrev.)' },
      enableSorting: false,
      cell: ({ row }) => {
        const dt = row.original.diagram_type_employees_diagram_diagram_typeTodiagram_type;
        if (!dt) return <span className="text-muted-foreground">-</span>;

        return (
          <Badge
            variant="outline"
            style={{
              color: dt.color,
              borderColor: dt.color,
              backgroundColor: `${dt.color}18`,
            }}
          >
            {dt.short_description}
          </Badge>
        );
      },
    },

    // ── Comentario (texto libre, cargado desde Cargar Diagrama) ───────────────
    {
      id: 'comments',
      accessorKey: 'comments',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Comentario" />,
      meta: { title: 'Comentario' },
      cell: ({ row }) => {
        const comment = row.original.comments;
        if (!comment) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex max-w-[240px] items-center gap-2" title={comment}>
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm">{comment}</span>
          </div>
        );
      },
    },

    // ── Fecha (computed from day/month/year Decimal) ──────────────────────────
    {
      id: 'date',
      accessorFn: (row) => {
        const d = Number(row.day);
        const m = Number(row.month);
        const y = Number(row.year);
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        return dateStr;
      },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      meta: { title: 'Fecha' },
      enableSorting: false,
      cell: ({ row }) => {
        const d = Number(row.original.day);
        const m = Number(row.original.month);
        const y = Number(row.original.year);
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        return (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="tabular-nums">{moment(dateStr, 'YYYY-MM-DD').format('DD/MM/YYYY')}</span>
          </div>
        );
      },
    },

    // ── Día ──────────────────────────────────────────────────────────────────
    {
      id: 'day',
      accessorFn: (row) => Number(row.day),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Día" />,
      meta: { title: 'Día' },
      cell: ({ row }) => <span className="tabular-nums">{Number(row.original.day)}</span>,
    },

    // ── Mes ──────────────────────────────────────────────────────────────────
    {
      id: 'month',
      accessorFn: (row) => Number(row.month),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mes" />,
      meta: { title: 'Mes' },
      cell: ({ row }) => <span className="tabular-nums">{Number(row.original.month)}</span>,
    },

    // ── Año ──────────────────────────────────────────────────────────────────
    {
      id: 'year',
      accessorFn: (row) => Number(row.year),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Año" />,
      meta: { title: 'Año' },
      cell: ({ row }) => <span className="tabular-nums">{Number(row.original.year)}</span>,
    },

    // ── Creado ───────────────────────────────────────────────────────────────
    {
      id: 'created_at',
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Registrado" />,
      meta: { title: 'Registrado' },
      cell: ({ row }) =>
        row.original.created_at ? (
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatArgentinaDay(row.original.created_at)}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
  ];
}
