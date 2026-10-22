import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import moment from 'moment';
import { DiagramCell } from '../components/DiagramCell';
import type { DiagramReportListItem } from './actions.server';

// ============================================================================
// COLUMNS HIDDEN BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at', 'cuil', 'comments', 'day', 'month', 'year'];

// ============================================================================
// HELPERS
// ============================================================================

/** `DD/MM/YYYY` de la fecha de la novedad (`YYYY-MM-DD`, sin zona horaria). */
export function formatReportDate(date: string): string {
  return moment.utc(date, 'YYYY-MM-DD').format('DD/MM/YYYY');
}

/** `Apellido Nombre` del empleado de una fila. */
export function reportEmployeeName(item: DiagramReportListItem): string {
  return `${item.employee.lastname} ${item.employee.firstname}`.trim();
}

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

interface ColumnsHandlers {
  /** Abre el detalle (novedad, edición rápida si hay permiso e historial) de una fila. */
  onOpenDetail: (item: DiagramReportListItem) => void;
}

export function getColumns({ onOpenDetail }: ColumnsHandlers): ColumnDef<DiagramReportListItem>[] {
  return [
    // ── Legajo (file number) — columna separada OBLIGATORIA, antes del nombre ──
    {
      id: 'fileNumber',
      accessorFn: (row) => row.employee.fileNumber,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Legajo" />,
      meta: { title: 'Legajo' },
      cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.employee.fileNumber}</span>,
    },

    // ── Empleado (apellido + nombre) ──────────────────────────────────────────
    {
      id: 'employee',
      accessorFn: (row) => reportEmployeeName(row),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Empleado" />,
      meta: { title: 'Empleado' },
      cell: ({ row }) => <span className="font-medium">{reportEmployeeName(row.original)}</span>,
      filterFn: (row, _id, value: string[]) => value.includes(row.original.employee.id),
    },

    // ── CUIL ─────────────────────────────────────────────────────────────────
    {
      id: 'cuil',
      accessorFn: (row) => row.employee.cuil,
      header: ({ column }) => <DataTableColumnHeader column={column} title="CUIL" />,
      meta: { title: 'CUIL' },
      cell: ({ row }) => <span className="tabular-nums">{row.original.employee.cuil}</span>,
    },

    // ── Puesto (company position — FK nullable) ───────────────────────────────
    {
      id: 'companyPosition',
      accessorFn: (row) => row.position?.name ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Puesto" />,
      meta: { title: 'Puesto' },
      cell: ({ row }) => <span className="text-sm">{row.original.position?.name ?? '-'}</span>,
      filterFn: (row, _id, value: string[]) => {
        const positionId = row.original.position?.id;
        if (positionId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(positionId);
      },
    },

    // ── Novedad: casilla de color + nombre (el color y la sigla son los del calendario) ──
    {
      id: 'diagramType',
      accessorFn: (row) => row.diagramType.name ?? row.diagramType.shortDescription,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Novedad" />,
      meta: { title: 'Novedad' },
      cell: ({ row }) => {
        const { diagramType, date } = row.original;
        return (
          <div className="flex items-center gap-2">
            <DiagramCell
              size="sm"
              date={date}
              diagramType={{
                name: diagramType.name,
                short_description: diagramType.shortDescription,
                color: diagramType.color,
              }}
              onClick={() => onOpenDetail(row.original)}
            />
            <span className="text-sm">{diagramType.name ?? diagramType.shortDescription}</span>
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.diagramType.id),
    },

    // ── Comentario (texto libre, cargado desde Cargar Diagrama) ───────────────
    {
      id: 'comments',
      accessorFn: (row) => row.comments ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Comentario" />,
      meta: { title: 'Comentario' },
      cell: ({ row }) => {
        const comment = row.original.comments;
        if (!comment) return <span className="text-muted-foreground">-</span>;
        return (
          <span className="block max-w-[240px] truncate text-sm" title={comment}>
            {comment}
          </span>
        );
      },
    },

    // ── Fecha de la novedad (se arma en el servidor desde day/month/year) ─────
    {
      id: 'date',
      accessorFn: (row) => row.date,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      meta: { title: 'Fecha' },
      cell: ({ row }) => <span className="tabular-nums">{formatReportDate(row.original.date)}</span>,
    },

    // ── Día ──────────────────────────────────────────────────────────────────
    {
      id: 'day',
      accessorFn: (row) => row.day,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Día" />,
      meta: { title: 'Día' },
      cell: ({ row }) => <span className="tabular-nums">{row.original.day}</span>,
    },

    // ── Mes ──────────────────────────────────────────────────────────────────
    {
      id: 'month',
      accessorFn: (row) => row.month,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Mes" />,
      meta: { title: 'Mes' },
      cell: ({ row }) => <span className="tabular-nums">{row.original.month}</span>,
    },

    // ── Año ──────────────────────────────────────────────────────────────────
    {
      id: 'year',
      accessorFn: (row) => row.year,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Año" />,
      meta: { title: 'Año' },
      cell: ({ row }) => <span className="tabular-nums">{row.original.year}</span>,
    },

    // ── Registrado ───────────────────────────────────────────────────────────
    {
      id: 'created_at',
      accessorFn: (row) => row.createdAt,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Registrado" />,
      meta: { title: 'Registrado' },
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm tabular-nums">{formatArgentinaDay(row.original.createdAt)}</span>
      ),
    },

    // ── Acciones: el detalle lo ve cualquiera con acceso al reporte; la edición se gatea dentro del Sheet ──
    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      meta: { title: 'Acciones', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onOpenDetail(row.original)}
          aria-label={`Ver detalle de la novedad de ${reportEmployeeName(row.original)} del ${formatReportDate(row.original.date)}`}
        >
          <Eye aria-hidden="true" className="size-4" />
        </Button>
      ),
    },
  ];
}
