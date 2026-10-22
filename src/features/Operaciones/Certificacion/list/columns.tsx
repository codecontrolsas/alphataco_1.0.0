'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ServiceDetailModal } from '@/features/Operaciones/PartesDiarios/components/ServiceDetailModal';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { matchesAnyIdOrNone, matchesNullableId, titled } from '@/shared/components/common/DataTable/column-helpers';
import { argentinaDate, formatDateAr } from '@/shared/lib/argentina-time';
import { employeeLabel } from '@/shared/lib/resource-labels';
import {
  dailyReportRowStatusLabels,
  dailyReportRowStatusTones,
  dailyReportTypeServiceLabels,
} from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit, FileText, History } from 'lucide-react';
import { rowStatusIcons } from '../../lib/row-facet-options';
import type { CertificationRow } from '../actions/queries.server';

// ============================================================================
// TIPOS
// ============================================================================

/** Acciones por fila: las resuelve el componente de la tabla (modales, store del formulario). */
export interface CertificationRowHandlers {
  onEdit: (row: CertificationRow) => void;
  onViewHistory: (row: CertificationRow) => void;
  onManageRemitos: (row: CertificationRow) => void;
}

// ============================================================================
// HELPERS DE PRESENTACIÓN
// ============================================================================

/** Color de fondo de la fila: agregada después de la fecha del parte, o editada por Comercial. */
export function getCertificationRowClassName(row: CertificationRow): string {
  if (row.created_at && row.report_date && argentinaDate(new Date(row.created_at)) > row.report_date) {
    return 'bg-warn-subtle/60';
  }
  if (row.last_comercial_edit_at) return 'bg-brand-subtle/60';
  return '';
}

function ChipList({ items, variant = 'secondary' }: { items: string[]; variant?: 'secondary' | 'outline' }) {
  if (items.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, index) => (
        <Badge key={`${item}-${index}`} variant={variant} className="rounded-sm">
          {item}
        </Badge>
      ))}
    </div>
  );
}

/** Botón de ícono con tooltip. */
function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* El `span` enfocable hace que el tooltip del botón deshabilitado siga apareciendo. */}
        <span className="inline-flex" tabIndex={disabled ? 0 : undefined}>
          <Button type="button" variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// COLUMNAS
// ============================================================================

export function getCertificationColumns(
  canEdit: boolean,
  handlers: CertificationRowHandlers
): ColumnDef<CertificationRow>[] {
  return [
    // ── Selección (solo con permiso de edición; solo líneas ejecutadas) ──────
    {
      id: 'select',
      meta: { title: '', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) =>
        canEdit ? (
          <Checkbox
            disabled={table.getRowModel().rows.every((row) => !row.getCanSelect())}
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Seleccionar todas las líneas ejecutadas de la página"
            className="cursor-pointer"
          />
        ) : null,
      cell: ({ row }) =>
        canEdit ? (
          <Checkbox
            disabled={!row.getCanSelect()}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Seleccionar línea"
            className={row.getCanSelect() ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}
          />
        ) : null,
    },

    // ── Fecha del parte (dateRange) ───────────────────────────────────────────
    {
      id: 'date',
      accessorFn: (row) => row.report_date ?? '',
      ...titled('Fecha'),
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {row.original.report_date ? formatDateAr(row.original.report_date) : '—'}
        </span>
      ),
    },

    // ── Cliente (FK UUID nullable) ────────────────────────────────────────────
    {
      id: 'customer',
      accessorFn: (row) => row.customer,
      ...titled('Cliente'),
      cell: ({ row }) => <span className="font-medium">{row.original.customer || '—'}</span>,
      filterFn: matchesNullableId((row) => row.customer_id),
    },

    // ── Servicio (FK UUID nullable) ───────────────────────────────────────────
    {
      id: 'service',
      accessorFn: (row) => row.services,
      ...titled('Servicio'),
      cell: ({ row }) => <span>{row.original.services || '—'}</span>,
      filterFn: matchesNullableId((row) => row.service_id),
    },

    // ── Ítem (FK UUID nullable) ───────────────────────────────────────────────
    {
      id: 'item',
      accessorFn: (row) => row.item,
      ...titled('Ítem'),
      cell: ({ row }) => <span>{row.original.item || '—'}</span>,
      filterFn: matchesNullableId((row) => row.item_id),
    },

    // ── Descripción del ítem (texto de la relación) ───────────────────────────
    {
      id: 'item_description',
      accessorFn: (row) => row.item_description,
      ...titled('Descripción del ítem'),
      cell: ({ row }) => (
        <div className="max-w-[150px] whitespace-pre-wrap break-words">
          <span className="text-muted-foreground text-sm">{row.original.item_description || '—'}</span>
        </div>
      ),
    },

    // ── Equipo del cliente (M:M) ──────────────────────────────────────────────
    {
      id: 'customer_equipment',
      accessorFn: (row) => row.customer_equipment.map((equipment) => equipment.name).join(', '),
      ...titled('Equipo del cliente'),
      enableSorting: false,
      cell: ({ row }) => <ChipList items={row.original.customer_equipment.map((equipment) => equipment.name)} />,
      filterFn: matchesAnyIdOrNone((row) => row.customer_equipment.map((item) => item.id)),
    },

    // ── Área (FK UUID nullable) ───────────────────────────────────────────────
    {
      id: 'area',
      accessorFn: (row) => row.area,
      ...titled('Área'),
      cell: ({ row }) => <span>{row.original.area || '—'}</span>,
      filterFn: matchesNullableId((row) => row.area_id),
    },

    // ── Sector (FK UUID nullable) ─────────────────────────────────────────────
    {
      id: 'sector',
      accessorFn: (row) => row.sector,
      ...titled('Sector'),
      cell: ({ row }) => <span>{row.original.sector || '—'}</span>,
      filterFn: matchesNullableId((row) => row.sector_id),
    },

    // ── Tipo de servicio (enum nullable) ──────────────────────────────────────
    {
      id: 'type_service',
      accessorFn: (row) => row.type_service,
      ...titled('Tipo de servicio'),
      cell: ({ row }) => {
        const type = row.original.type_service;
        return type ? (
          <span>{dailyReportTypeServiceLabels[type] ?? type}</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        );
      },
      filterFn: matchesNullableId((row) => row.type_service),
    },

    // ── N° de remito (1:N; filtro de texto) ───────────────────────────────────
    {
      id: 'remit_number',
      accessorFn: (row) => row.remit_number,
      ...titled('N° de remito'),
      enableSorting: false,
      cell: ({ row }) => (
        <ChipList
          variant="outline"
          items={row.original.remit_number
            .split(',')
            .map((remit) => remit.trim())
            .filter(Boolean)}
        />
      ),
    },

    // ── Estado (enum NOT NULL) ────────────────────────────────────────────────
    {
      id: 'status',
      accessorFn: (row) => row.status,
      ...titled('Estado'),
      cell: ({ row }) => {
        const status = row.original.status;
        const Icon = rowStatusIcons[status];
        return (
          <Badge variant={dailyReportRowStatusTones[status] ?? 'default'}>
            {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
            {dailyReportRowStatusLabels[status] ?? status}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.status),
    },

    // ── Empleados (M:M) — legajo antes del nombre ─────────────────────────────
    {
      id: 'employees',
      accessorFn: (row) => row.employees_references.map((employee) => employeeLabel(employee)).join(', '),
      meta: { title: 'Empleados' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader className="min-w-[200px]" column={column} title="Empleados" />,
      cell: ({ row }) => (
        <ChipList items={row.original.employees_references.map((employee) => employeeLabel(employee))} />
      ),
      filterFn: matchesAnyIdOrNone((row) => row.employees_references.map((item) => item.id)),
    },

    // ── Equipo de la empresa (M:M) ────────────────────────────────────────────
    {
      id: 'equipment',
      accessorFn: (row) => row.equipment_references.map((equipment) => equipment.name).join(', '),
      ...titled('Equipo de la empresa'),
      enableSorting: false,
      cell: ({ row }) => <ChipList items={row.original.equipment_references.map((equipment) => equipment.name)} />,
      filterFn: matchesAnyIdOrNone((row) => row.equipment_references.map((item) => item.id)),
    },

    // ── Jornada (texto nullable) ──────────────────────────────────────────────
    {
      id: 'working_day',
      accessorFn: (row) => row.working_day,
      ...titled('Jornada'),
      cell: ({ row }) => <span>{row.original.working_day || '—'}</span>,
      filterFn: matchesNullableId((row) => row.working_day),
    },

    // ── Descripción (texto) ───────────────────────────────────────────────────
    {
      id: 'description',
      accessorFn: (row) => row.description,
      meta: { title: 'Descripción' },
      header: ({ column }) => <DataTableColumnHeader className="min-w-[300px]" column={column} title="Descripción" />,
      cell: ({ row }) =>
        row.original.description ? (
          <div className="max-w-[300px] whitespace-pre-wrap break-words">{row.original.description}</div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },

    // ── Acciones ──────────────────────────────────────────────────────────────
    {
      id: 'actions',
      meta: { title: 'Acciones', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: 'Acciones',
      cell: ({ row }) => {
        const line = row.original;
        const isCertifying = line.status === 'en_certificacion';
        const isDailyReportOpen = line.dailyReportStatus === 'abierto';

        return (
          <div className="flex items-center gap-1">
            {canEdit && !isCertifying ? (
              <IconAction
                label={isDailyReportOpen ? 'El parte está abierto: debe editarse desde Operaciones' : 'Editar'}
                disabled={isDailyReportOpen}
                onClick={() => handlers.onEdit(line)}
              >
                <Edit className="size-4" aria-hidden="true" />
              </IconAction>
            ) : null}

            <Tooltip>
              <TooltipTrigger asChild>
                <ServiceDetailModal rowId={line.id} reportDate={line.date} serviceData={line} />
              </TooltipTrigger>
              <TooltipContent>
                <p>Ver detalles</p>
              </TooltipContent>
            </Tooltip>

            <IconAction label="Ver historial" onClick={() => handlers.onViewHistory(line)}>
              <History className="size-4" aria-hidden="true" />
            </IconAction>

            {canEdit && isCertifying ? (
              <IconAction label="Gestionar remitos" onClick={() => handlers.onManageRemitos(line)}>
                <FileText className="size-4" aria-hidden="true" />
              </IconAction>
            ) : null}
          </div>
        );
      },
    },
  ];
}
