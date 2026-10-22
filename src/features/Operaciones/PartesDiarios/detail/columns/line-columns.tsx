'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StackedCell } from '@/shared/components/common/StackedCell';
import { cn } from '@/lib/utils';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Truck } from 'lucide-react';
import { deviationText, employeeDeviations, equipmentDeviations } from '../../lib/resource-deviations';
import { canEditRow } from '../lib/row-permissions';
import type { DailyReportDetailRow } from '../types';
import { formatRowTime } from './helpers';
import type { DeviationGetters, Permissions, RowActionHandlers } from './types';

// ============================================================================
// COLUMNAS COMPUESTAS — solo presentación (no se exportan ni se ordenan).
// Las columnas atómicas siguen definidas, ocultas por defecto: la toolbar resuelve los filtros
// con `table.getColumn(id)` y el export recorre todas las ColumnDef.
// ============================================================================

/** Cuántos chips de cada grupo (personal / equipos) se ven antes del "+N". */
const VISIBLE_CHIPS_PER_GROUP = 2;

const EMPLOYEE_ROLE_LABELS: Record<string, string> = {
  chofer_dia: 'Chofer día',
  ayudante_dia: 'Ayudante día',
  chofer_noche: 'Chofer noche',
  ayudante_noche: 'Ayudante noche',
};

/** Clases escritas completas: Tailwind no genera las que se arman en runtime. */
const CHIP_BASE =
  'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
const CHIP_OK = 'border-border bg-card text-foreground';
const CHIP_WARN = 'border-warn/50 bg-warn-subtle text-warn-subtle-foreground';

interface ChipData {
  key: string;
  label: string;
  kind: 'employee' | 'equipment';
  initials?: string;
  /** Texto del tooltip: rol y desvíos. */
  notes: string[];
  hasDeviation: boolean;
}

function ResourceChip({ chip }: { chip: ChipData }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn(CHIP_BASE, chip.hasDeviation ? CHIP_WARN : CHIP_OK)}>
          {chip.kind === 'employee' ? (
            <span
              aria-hidden="true"
              className="bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
            >
              {chip.initials}
            </span>
          ) : (
            <Truck className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{chip.label}</span>
          {chip.hasDeviation ? <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" /> : null}
          <span className="sr-only">
            {chip.notes.length > 0 ? `. ${chip.hasDeviation ? 'Desvíos: ' : ''}${chip.notes.join('. ')}` : ''}
          </span>
        </span>
      </TooltipTrigger>
      {chip.notes.length > 0 ? (
        <TooltipContent className="max-w-xs">
          {chip.notes.map((note) => (
            <p key={note} className="text-xs">
              {note}
            </p>
          ))}
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}

function buildEmployeeChips(row: DailyReportDetailRow, deviations: DeviationGetters): ChipData[] {
  const chips: ChipData[] = [];
  for (const rel of row.dailyreportemployeerelations) {
    const emp = rel.employees;
    if (!emp) continue;
    const dev = rel.employee_id ? deviations.getEmployeeDeviation(rel.employee_id, row.id) : null;
    const messages = dev ? employeeDeviations(dev).map(deviationText) : [];
    const roleLabel = rel.role ? EMPLOYEE_ROLE_LABELS[rel.role] ?? rel.role : null;
    const fullName = [emp.lastname, emp.firstname].filter(Boolean).join(' ');
    chips.push({
      key: rel.id,
      label: `[${emp.file ?? '?'}] ${emp.lastname ?? ''}`.trim(),
      kind: 'employee',
      initials: `${emp.lastname?.charAt(0) ?? ''}${emp.firstname?.charAt(0) ?? ''}`.toUpperCase() || '?',
      notes: [...(roleLabel ? [`${roleLabel}: ${fullName}`] : [fullName]), ...messages],
      hasDeviation: messages.length > 0,
    });
  }
  return chips;
}

function buildEquipmentChips(row: DailyReportDetailRow, deviations: DeviationGetters): ChipData[] {
  const chips: ChipData[] = [];
  for (const rel of row.dailyreportequipmentrelations) {
    const vehicle = rel.vehicles;
    const other = rel.other_equipment;
    if (!vehicle && !other) continue;
    const label = vehicle
      ? vehicle.domain ?? vehicle.intern_number ?? 'Equipo'
      : other?.intern_number ?? other?.serial_number ?? 'Equipo';
    const equipmentId = vehicle ? rel.equipment_id : rel.other_equipment_id;
    const dev = equipmentId ? deviations.getEquipmentDeviation(equipmentId, row.id) : null;
    const messages = dev ? equipmentDeviations(dev).map(deviationText) : [];
    chips.push({
      key: rel.id,
      label,
      kind: 'equipment',
      notes: [
        ...(vehicle?.brand_vehicles?.name ? [`${label} — ${vehicle.brand_vehicles.name}`] : [label]),
        ...messages,
      ],
      hasDeviation: messages.length > 0,
    });
  }
  return chips;
}

function MoreChip({ hidden }: { hidden: ChipData[] }) {
  if (hidden.length === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="text-muted-foreground focus-visible:ring-ring/50 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium outline-none focus-visible:ring-[3px]"
        >
          +{hidden.length}
          <span className="sr-only">: {hidden.map((chip) => chip.label).join(', ')}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {hidden.map((chip) => (
          <p key={chip.key} className="text-xs">
            {chip.label}
            {chip.hasDeviation ? ' (con desvíos)' : ''}
          </p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

function LineResourcesCell({ row, deviations }: { row: DailyReportDetailRow; deviations: DeviationGetters }) {
  const employees = buildEmployeeChips(row, deviations);
  const equipment = buildEquipmentChips(row, deviations);

  if (employees.length === 0 && equipment.length === 0) {
    if (row.status === 'sin_recursos_asignados') {
      return (
        <span className="bg-danger-subtle text-danger-subtle-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
          Sin personal ni equipos
        </span>
      );
    }
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {employees.slice(0, VISIBLE_CHIPS_PER_GROUP).map((chip) => (
        <ResourceChip key={chip.key} chip={chip} />
      ))}
      <MoreChip hidden={employees.slice(VISIBLE_CHIPS_PER_GROUP)} />
      {equipment.slice(0, VISIBLE_CHIPS_PER_GROUP).map((chip) => (
        <ResourceChip key={chip.key} chip={chip} />
      ))}
      <MoreChip hidden={equipment.slice(VISIBLE_CHIPS_PER_GROUP)} />
    </div>
  );
}

const DAY_NIGHT_ON = 'bg-ok-subtle text-ok-subtle-foreground';
const DAY_NIGHT_OFF = 'bg-muted text-muted-foreground';

function ShiftMark({ letter, label, done }: { letter: string; label: string; done: boolean }) {
  return (
    <span
      role="img"
      aria-label={`${label}: ${done ? 'completado' : 'sin completar'}`}
      className={cn(
        'inline-flex size-5 items-center justify-center rounded text-[10px] font-semibold',
        done ? DAY_NIGHT_ON : DAY_NIGHT_OFF
      )}
    >
      {letter}
    </span>
  );
}

export function getLineColumns(
  permissions: Permissions,
  handlers: RowActionHandlers,
  reportDate: string,
  deviations: DeviationGetters
): ColumnDef<DailyReportDetailRow>[] {
  return [
    // ── Servicio: cliente + servicio · ítem. Abre la línea (edición si puede, detalle si no) ─────
    {
      id: 'line_service',
      meta: { title: 'Servicio', excludeFromExport: true },
      enableSorting: false,
      enableHiding: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Servicio" />,
      cell: ({ row }) => {
        const line = row.original;
        const secondary = [line.customer_services?.service_name, line.service_items?.item_name]
          .filter((part): part is string => Boolean(part))
          .join(' · ');
        const deviationCount = deviations.getRowDeviationCount(line.id);
        const opensForm = canEditRow(line, permissions, reportDate);

        return (
          <button
            type="button"
            onClick={() => (opensForm ? handlers.onEdit(line) : handlers.onViewDetail(line))}
            className="focus-visible:ring-ring/50 flex max-w-[220px] min-w-0 items-center gap-2 rounded text-left outline-none hover:underline focus-visible:ring-[3px]"
          >
            <StackedCell
              primary={line.customers?.name ?? 'Sin cliente'}
              secondary={secondary || undefined}
              maxWidthClass="max-w-[200px]"
            />
            {deviationCount > 0 ? (
              <>
                <AlertTriangle className="text-warn-subtle-foreground size-4 shrink-0" aria-hidden="true" />
                <span className="sr-only">
                  {deviationCount === 1
                    ? '1 desvío en el personal o los equipos'
                    : `${deviationCount} desvíos en el personal o los equipos`}
                </span>
              </>
            ) : null}
          </button>
        );
      },
    },

    // ── Dónde y cuándo: sector · área / jornada · horario ───────────────────────────────────────
    {
      id: 'line_where',
      meta: { title: 'Dónde y cuándo', excludeFromExport: true },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Dónde y cuándo" />,
      cell: ({ row }) => {
        const line = row.original;
        const place = [line.service_sectors?.sectors?.name, line.service_areas?.areas_cliente?.descripcion_corta]
          .filter((part): part is string => Boolean(part))
          .join(' · ');
        const start = formatRowTime(line.start_time);
        const end = formatRowTime(line.end_time);
        const schedule = [line.working_day, start && end ? `${start}–${end}` : start ?? end]
          .filter((part): part is string => Boolean(part))
          .join(' · ');

        return <StackedCell primary={place || '—'} secondary={schedule || undefined} maxWidthClass="max-w-[190px]" />;
      },
    },

    // ── Recursos: chips de personal (iniciales + [legajo] Apellido) y equipos (dominio) ─────────
    {
      id: 'line_resources',
      meta: { title: 'Recursos', excludeFromExport: true },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Recursos" />,
      cell: ({ row }) => <LineResourcesCell row={row.original} deviations={deviations} />,
    },

    // ── Remito y turnos completados (D = día, N = noche) ────────────────────────────────────────
    {
      id: 'line_remit',
      meta: { title: 'Remito', excludeFromExport: true },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Remito" />,
      cell: ({ row }) => {
        const line = row.original;
        const is24Hours = line.working_day?.toLowerCase() === 'jornada 24 horas';
        const showShifts = is24Hours || line.completed_day != null || line.completed_night != null;

        return (
          <div className="flex flex-col gap-1">
            <span className="text-foreground font-mono text-sm tabular-nums">{line.remit_number ?? '—'}</span>
            {showShifts ? (
              <span className="flex items-center gap-1">
                <ShiftMark letter="D" label="Turno día" done={Boolean(line.completed_day)} />
                <ShiftMark letter="N" label="Turno noche" done={Boolean(line.completed_night)} />
              </span>
            ) : null}
          </div>
        );
      },
    },
  ];
}
