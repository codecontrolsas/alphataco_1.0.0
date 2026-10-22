'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DocumentNameCell, DocumentStatePill } from '@/features/Documentacion/shared/components/DocumentCells';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import {
  matchesNullableColumnValue,
  matchesNullableId,
  titled,
} from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { HelpCircle } from 'lucide-react';
import Link from 'next/link';

/**
 * Columnas que repiten las listas de documentos de empleados y equipos (permanentes y mensuales):
 * documento, estado, fecha de carga, afectaciones, mandatorio, multirecurso, período y motivo de rechazo.
 * Cada lista las ubica en su orden; el `id` de la columna lo define quien la usa porque lo leen los
 * filtros, la visibilidad inicial y la exportación.
 */

/** Forma mínima de una fila de documento que usan las columnas compartidas. */
export interface DocumentColumnRow {
  id_document_types: string | null;
  state: string | null;
  notApplicable?: boolean;
  requestedBy?: string | null;
  deny_reason: string | null;
  isMissing?: boolean;
  created_at: Date | string | null;
  period?: string | null;
  document_types: {
    name: string | null;
    mandatory?: boolean | null;
    multiresource?: boolean | null;
  } | null;
}

/** Afectación de un empleado o equipo a un cliente. */
type ContractorLink = { customers: { id: string; name: string | null } | null };

const dash = <span className="text-muted-foreground">-</span>;

/** Documento: nombre, obligatorio/opcional, motivo de rechazo y (en mensuales) el período. */
export function documentTypeColumn<T extends DocumentColumnRow>(id: string, withPeriod: boolean): ColumnDef<T> {
  return {
    id,
    accessorFn: (row) => row.document_types?.name ?? '',
    ...titled('Documento'),
    cell: ({ row }) => (
      <DocumentNameCell
        name={row.original.document_types?.name}
        mandatory={row.original.document_types?.mandatory}
        {...(withPeriod ? { period: row.original.period } : {})}
        denyReason={row.original.deny_reason}
        state={row.original.state}
        requestedBy={row.original.requestedBy}
        archived={row.original.notApplicable}
      />
    ),
    filterFn: matchesNullableId<T>((row) => row.id_document_types),
    enableSorting: true,
  };
}

export function documentStateColumn<T extends DocumentColumnRow>(): ColumnDef<T> {
  return {
    id: 'state',
    accessorKey: 'state',
    ...titled('Estado'),
    cell: ({ row }) => <DocumentStatePill state={row.original.state} archived={row.original.notApplicable} />,
    filterFn: matchesNullableColumnValue,
    enableSorting: true,
  };
}

/**
 * "Subido el". `getLogDate` devuelve la fecha del log más reciente: si existe gana sobre `created_at`
 * (las listas de empleados permanentes no la usan).
 */
export function uploadedAtColumn<T extends DocumentColumnRow>(
  getLogDate?: (row: T) => Date | string | null | undefined
): ColumnDef<T> {
  return {
    id: 'created_at',
    accessorKey: 'created_at',
    ...titled('Subido el'),
    cell: ({ row }) => {
      const date = getLogDate?.(row.original) ?? row.original.created_at;
      if (row.original.isMissing || !date) return <span className="text-muted-foreground">No disponible</span>;
      return <span className="font-mono tabular-nums">{formatArgentinaDay(date)}</span>;
    },
    enableSorting: true,
  };
}

/** "Afectado a": clientes a los que está afectado el empleado o equipo (badge con tooltip si son varios). */
export function contractorColumn<T extends DocumentColumnRow>(
  getLinks: (row: T) => ContractorLink[] | undefined
): ColumnDef<T> {
  const namesOf = (row: T) =>
    getLinks(row)
      ?.map((ce) => ce.customers?.name ?? '')
      .filter(Boolean) ?? [];

  return {
    id: 'contractor',
    accessorFn: (row) => namesOf(row).join(', '),
    ...titled('Afectado a'),
    cell: ({ row }) => {
      const contractors = namesOf(row.original);

      if (contractors.length === 0) return <Badge variant="outline">Sin afectar</Badge>;

      const [first, ...rest] = contractors;
      if (rest.length === 0) return <Badge>{first}</Badge>;

      return (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="cursor-pointer">
                {first} +{rest.length}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="bg-black text-white rounded-lg p-2">
              <div className="flex flex-col gap-1">
                {contractors.map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    filterFn: (row, _id, value: string[]) => {
      const contractors = getLinks(row.original) ?? [];
      if (contractors.length === 0) return value.includes(NULL_FILTER_VALUE);
      return contractors.some((ce) => ce.customers?.id && value.includes(ce.customers.id));
    },
    enableSorting: false,
  };
}

/** Sí/No de un indicador del tipo de documento (`mandatory`, `multiresource`). */
function typeFlagColumn<T extends DocumentColumnRow>(id: 'mandatory' | 'multiresource', title: string): ColumnDef<T> {
  return {
    id,
    accessorFn: (row) => (row.document_types?.[id] != null ? String(row.document_types[id]) : null),
    ...titled(title),
    cell: ({ row }) => {
      const val = row.original.document_types?.[id];
      if (val == null) return dash;
      return <span>{val ? 'Sí' : 'No'}</span>;
    },
    filterFn: (row, _id, value: string[]) => {
      const val = row.original.document_types?.[id];
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(val));
    },
    enableSorting: false,
  };
}

export const mandatoryColumn = <T extends DocumentColumnRow>() => typeFlagColumn<T>('mandatory', 'Mandatorio');

export const multiresourceColumn = <T extends DocumentColumnRow>() =>
  typeFlagColumn<T>('multiresource', 'Multirecurso');

export function periodColumn<T extends DocumentColumnRow>(): ColumnDef<T> {
  return {
    id: 'period',
    accessorKey: 'period',
    ...titled('Período'),
    cell: ({ row }) => <span>{row.original.period ?? '-'}</span>,
    enableSorting: true,
  };
}

/** Motivo de rechazo (las listas lo rotulan "Razón" o "Motivo" según el caso: no se unificó). */
export function denyReasonColumn<T extends DocumentColumnRow>(title: string): ColumnDef<T> {
  return {
    id: 'deny_reason',
    accessorKey: 'deny_reason',
    ...titled(title),
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.deny_reason ?? '-'}</span>,
    enableSorting: false,
  };
}

/** Columna de acciones: sin título, fuera de la exportación y sin ocultar. */
export function actionsColumn<T>(render: (row: T) => React.ReactNode): ColumnDef<T> {
  return {
    id: 'actions',
    meta: { title: '', excludeFromExport: true },
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => render(row.original),
  };
}

/** Datos del empleado que muestran las columnas de identidad. */
type EmployeeIdentity = { id: string; file: string | number | null; firstname: string; lastname: string };

/** "Legajo" y "Empleado": identidad de las listas de documentos de empleados. */
export function employeeIdentityColumns<T>(
  getEmployee: (row: T) => EmployeeIdentity | null | undefined
): ColumnDef<T>[] {
  return [
    {
      id: 'fileNumber',
      accessorFn: (row) => getEmployee(row)?.file ?? '',
      meta: { title: 'Legajo' },
      header: ({ column }) => (
        <div className="flex items-center gap-1">
          <DataTableColumnHeader column={column} title="Legajo" />
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help" aria-label="Coincidencia exacta: ingrese el legajo completo">
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Coincidencia exacta: ingrese el legajo completo</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
      cell: ({ row }) => {
        const file = getEmployee(row.original)?.file;
        if (!file) return dash;
        return <span className="font-mono font-semibold tabular-nums text-foreground">{file}</span>;
      },
      enableSorting: false,
    },
    {
      id: 'employee',
      accessorFn: (row) => {
        const employee = getEmployee(row);
        return employee ? `${employee.lastname} ${employee.firstname}` : '';
      },
      ...titled('Empleado'),
      cell: ({ row }) => {
        const employee = getEmployee(row.original);
        if (!employee) return dash;
        return (
          <Link
            href={`/dashboard/employee/action?action=view&employee_id=${employee.id}`}
            className="font-semibold text-foreground hover:text-brand-ink hover:underline"
            target="_blank"
          >
            {employee.lastname} {employee.firstname}
          </Link>
        );
      },
      enableSorting: true,
    },
  ];
}
