'use client';

import { DataTableColumnHeader } from '@/shared/components/common/DataTable';
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

export function getEmployeeColumns(deviations: DeviationGetters): ColumnDef<DailyReportDetailRow>[] {
  return [
    // ── Chofer Día (rol de empleado — jornada 12h o 24h) ─────────────────────
    {
      id: 'chofer_dia',
      accessorFn: (row) => {
        const rel = row.dailyreportemployeerelations.find((r) => r.role === 'chofer_dia');
        if (!rel?.employees) return '';
        return buildEmployeeLabel(rel.employees);
      },
      meta: { title: 'Chofer Día' },
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a =
          rowA.original.dailyreportemployeerelations.find((r) => r.role === 'chofer_dia')?.employees?.lastname ?? '';
        const b =
          rowB.original.dailyreportemployeerelations.find((r) => r.role === 'chofer_dia')?.employees?.lastname ?? '';
        return a.localeCompare(b);
      },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Chofer Día" />,
      cell: ({ row }) => {
        const wday = row.original.working_day?.toLowerCase();
        if (wday !== 'jornada 12 horas' && wday !== 'jornada 24 horas') {
          return <span className="text-muted-foreground text-xs">—</span>;
        }
        const rel = row.original.dailyreportemployeerelations.find((r) => r.role === 'chofer_dia');
        if (!rel?.employees) {
          return <span className="text-muted-foreground text-xs italic">Sin asignar</span>;
        }
        const emp = rel.employees;
        const label = buildEmployeeLabel(emp);
        return renderEmployeeBadge(
          rel.employee_id ?? '',
          label,
          row.original.id,
          deviations,
          `chofer_dia_${rel.employee_id ?? rel.id}`
        );
      },
    },

    // ── Ayudante Día (rol de empleado — jornada 12h o 24h, admite varios) ────
    {
      id: 'ayudante_dia',
      accessorFn: (row) =>
        row.dailyreportemployeerelations
          .filter((r) => r.role === 'ayudante_dia' && r.employees)
          .map((r) => buildEmployeeLabel(r.employees!))
          .join(', '),
      meta: { title: 'Ayudante Día' },
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const firstLastname = (row: typeof rowA) =>
          row.original.dailyreportemployeerelations
            .filter((r) => r.role === 'ayudante_dia')
            .map((r) => r.employees?.lastname ?? '')
            .sort()[0] ?? '';
        return firstLastname(rowA).localeCompare(firstLastname(rowB));
      },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ayudante Día" />,
      cell: ({ row }) => {
        const wday = row.original.working_day?.toLowerCase();
        if (wday !== 'jornada 12 horas' && wday !== 'jornada 24 horas') {
          return <span className="text-muted-foreground text-xs">—</span>;
        }
        const rels = row.original.dailyreportemployeerelations.filter((r) => r.role === 'ayudante_dia' && r.employees);
        if (rels.length === 0) {
          return <span className="text-muted-foreground text-xs italic">Opcional</span>;
        }
        const items = rels.map((rel) =>
          renderEmployeeBadge(
            rel.employee_id ?? '',
            buildEmployeeLabel(rel.employees!),
            row.original.id,
            deviations,
            `ayudante_dia_${rel.employee_id ?? rel.id}`
          )
        );
        return (
          <ResourceCell
            items={items}
            title="Ayudantes Día"
            buttonLabel="Ver ayudantes"
            description={buildRowDescription(row.original)}
          />
        );
      },
    },

    // ── Chofer Noche (rol de empleado — solo jornada 24h) ────────────────────
    {
      id: 'chofer_noche',
      accessorFn: (row) => {
        const rel = row.dailyreportemployeerelations.find((r) => r.role === 'chofer_noche');
        if (!rel?.employees) return '';
        return buildEmployeeLabel(rel.employees);
      },
      meta: { title: 'Chofer Noche' },
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a =
          rowA.original.dailyreportemployeerelations.find((r) => r.role === 'chofer_noche')?.employees?.lastname ?? '';
        const b =
          rowB.original.dailyreportemployeerelations.find((r) => r.role === 'chofer_noche')?.employees?.lastname ?? '';
        return a.localeCompare(b);
      },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Chofer Noche" />,
      cell: ({ row }) => {
        const wday = row.original.working_day?.toLowerCase();
        if (wday !== 'jornada 24 horas') {
          return <span className="text-muted-foreground text-xs">—</span>;
        }
        const rel = row.original.dailyreportemployeerelations.find((r) => r.role === 'chofer_noche');
        if (!rel?.employees) {
          return <span className="text-muted-foreground text-xs italic">Sin asignar</span>;
        }
        const emp = rel.employees;
        const label = buildEmployeeLabel(emp);
        return renderEmployeeBadge(
          rel.employee_id ?? '',
          label,
          row.original.id,
          deviations,
          `chofer_noche_${rel.employee_id ?? rel.id}`
        );
      },
    },

    // ── Ayudante Noche (rol de empleado — solo jornada 24h, admite varios) ───
    {
      id: 'ayudante_noche',
      accessorFn: (row) =>
        row.dailyreportemployeerelations
          .filter((r) => r.role === 'ayudante_noche' && r.employees)
          .map((r) => buildEmployeeLabel(r.employees!))
          .join(', '),
      meta: { title: 'Ayudante Noche' },
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const firstLastname = (row: typeof rowA) =>
          row.original.dailyreportemployeerelations
            .filter((r) => r.role === 'ayudante_noche')
            .map((r) => r.employees?.lastname ?? '')
            .sort()[0] ?? '';
        return firstLastname(rowA).localeCompare(firstLastname(rowB));
      },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ayudante Noche" />,
      cell: ({ row }) => {
        const wday = row.original.working_day?.toLowerCase();
        if (wday !== 'jornada 24 horas') {
          return <span className="text-muted-foreground text-xs">—</span>;
        }
        const rels = row.original.dailyreportemployeerelations.filter(
          (r) => r.role === 'ayudante_noche' && r.employees
        );
        if (rels.length === 0) {
          return <span className="text-muted-foreground text-xs italic">Opcional</span>;
        }
        const items = rels.map((rel) =>
          renderEmployeeBadge(
            rel.employee_id ?? '',
            buildEmployeeLabel(rel.employees!),
            row.original.id,
            deviations,
            `ayudante_noche_${rel.employee_id ?? rel.id}`
          )
        );
        return (
          <ResourceCell
            items={items}
            title="Ayudantes Noche"
            buttonLabel="Ver ayudantes"
            description={buildRowDescription(row.original)}
          />
        );
      },
    },

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
      meta: { title: 'Empleados' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Empleados" />,
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
      meta: { title: 'Equipos' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Equipos" />,
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
