'use client';

import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import { ResourceCell } from '../components/ResourceCell';
import type { DailyReportDetailRow } from '../types';
import { EmployeeBadgeCell, EquipmentBadgeCell, renderEmployeeBadge } from './badge-cells';
import { buildEmployeeLabel, buildRowDescription } from './helpers';
import type { DeviationGetters } from './types';

// ============================================================================
// COLUMNAS — Recursos asignados a la fila (roles de empleados + empleados +
// equipos)
// ============================================================================

/** Jornadas en las que aplican los roles de día (12 y 24 h) y los de noche (solo 24 h). */
const DAY_WORKDAYS = ['jornada 12 horas', 'jornada 24 horas'];
const NIGHT_WORKDAYS = ['jornada 24 horas'];

const dashCell = <span className="text-muted-foreground text-xs">—</span>;

/** Columna de un rol con un solo empleado (chofer): badge con desvíos, "—" fuera de la jornada que lo admite. */
function driverColumn(
  role: 'chofer_dia' | 'chofer_noche',
  title: string,
  workdays: string[],
  deviations: DeviationGetters
): ColumnDef<DailyReportDetailRow> {
  const findRel = (row: DailyReportDetailRow) => row.dailyreportemployeerelations.find((r) => r.role === role);
  return {
    id: role,
    accessorFn: (row) => {
      const rel = findRel(row);
      if (!rel?.employees) return '';
      return buildEmployeeLabel(rel.employees);
    },
    ...titled(title),
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const a = findRel(rowA.original)?.employees?.lastname ?? '';
      const b = findRel(rowB.original)?.employees?.lastname ?? '';
      return a.localeCompare(b);
    },
    cell: ({ row }) => {
      const wday = row.original.working_day?.toLowerCase();
      if (!wday || !workdays.includes(wday)) return dashCell;
      const rel = findRel(row.original);
      if (!rel?.employees) {
        return <span className="text-muted-foreground text-xs italic">Sin asignar</span>;
      }
      return renderEmployeeBadge(
        rel.employee_id ?? '',
        buildEmployeeLabel(rel.employees),
        row.original.id,
        deviations,
        `${role}_${rel.employee_id ?? rel.id}`
      );
    },
  };
}

/** Columna de un rol que admite varios empleados (ayudantes): lista con desvíos, "Opcional" si no hay ninguno. */
function helperColumn(
  role: 'ayudante_dia' | 'ayudante_noche',
  title: string,
  dialogTitle: string,
  workdays: string[],
  deviations: DeviationGetters
): ColumnDef<DailyReportDetailRow> {
  return {
    id: role,
    accessorFn: (row) =>
      row.dailyreportemployeerelations
        .filter((r) => r.role === role && r.employees)
        .map((r) => buildEmployeeLabel(r.employees!))
        .join(', '),
    ...titled(title),
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const firstLastname = (row: typeof rowA) =>
        row.original.dailyreportemployeerelations
          .filter((r) => r.role === role)
          .map((r) => r.employees?.lastname ?? '')
          .sort()[0] ?? '';
      return firstLastname(rowA).localeCompare(firstLastname(rowB));
    },
    cell: ({ row }) => {
      const wday = row.original.working_day?.toLowerCase();
      if (!wday || !workdays.includes(wday)) return dashCell;
      const rels = row.original.dailyreportemployeerelations.filter((r) => r.role === role && r.employees);
      if (rels.length === 0) {
        return <span className="text-muted-foreground text-xs italic">Opcional</span>;
      }
      const items = rels.map((rel) =>
        renderEmployeeBadge(
          rel.employee_id ?? '',
          buildEmployeeLabel(rel.employees!),
          row.original.id,
          deviations,
          `${role}_${rel.employee_id ?? rel.id}`
        )
      );
      return (
        <ResourceCell
          items={items}
          title={dialogTitle}
          buttonLabel="Ver ayudantes"
          description={buildRowDescription(row.original)}
        />
      );
    },
  };
}

export function getEmployeeColumns(deviations: DeviationGetters): ColumnDef<DailyReportDetailRow>[] {
  return [
    // Roles de empleado: los de día valen en jornada de 12 y 24 h; los de noche, solo en la de 24 h.
    driverColumn('chofer_dia', 'Chofer Día', DAY_WORKDAYS, deviations),
    helperColumn('ayudante_dia', 'Ayudante Día', 'Ayudantes Día', DAY_WORKDAYS, deviations),
    driverColumn('chofer_noche', 'Chofer Noche', NIGHT_WORKDAYS, deviations),
    helperColumn('ayudante_noche', 'Ayudante Noche', 'Ayudantes Noche', NIGHT_WORKDAYS, deviations),

    // ── Empleados (M:M — todos los empleados de la fila, virtual) ────────────
    {
      id: 'employees',
      accessorFn: (row) =>
        row.dailyreportemployeerelations
          .map((r) => {
            const emp = r.employees;
            return emp ? `[${emp.file ?? '?'}] ${emp.lastname ?? ''}`.trim() : '';
          })
          .filter(Boolean)
          .join(', '),
      ...titled('Empleados'),
      enableSorting: false,
      cell: ({ row }) => <EmployeeBadgeCell row={row.original} deviations={deviations} />,
      filterFn: (row, _id, value: string[]) => {
        const relations = row.original.dailyreportemployeerelations;
        if (!relations || relations.length === 0) return value.includes(NULL_FILTER_VALUE);
        return relations.some((r) => r.employee_id && value.includes(r.employee_id));
      },
    },

    // ── Equipos (M:M — virtual) ───────────────────────────────────────────────
    {
      id: 'equipment',
      accessorFn: (row) =>
        row.dailyreportequipmentrelations
          .map((r) => {
            if (r.vehicles) return r.vehicles.domain ?? r.vehicles.intern_number ?? '';
            if (r.other_equipment) return r.other_equipment.intern_number ?? r.other_equipment.serial_number ?? '';
            return '';
          })
          .filter(Boolean)
          .join(', '),
      ...titled('Equipos'),
      enableSorting: false,
      cell: ({ row }) => <EquipmentBadgeCell row={row.original} deviations={deviations} />,
      filterFn: (row, _id, value: string[]) => {
        const relations = row.original.dailyreportequipmentrelations;
        if (!relations || relations.length === 0) return value.includes(NULL_FILTER_VALUE);
        return relations.some(
          (r) =>
            (r.equipment_id && value.includes(r.equipment_id)) ||
            (r.other_equipment_id && value.includes(r.other_equipment_id))
        );
      },
    },
  ];
}
