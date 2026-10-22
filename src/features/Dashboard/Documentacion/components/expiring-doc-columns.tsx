'use client';

import { Badge } from '@/components/ui/badge';
import { DocumentExpiryCell } from '@/features/Documentacion/shared/components/DocumentCells';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import {
  createFacetFilters,
  dateRangeFilter,
  enumFilterOptions,
} from '@/shared/components/common/DataTable/facet-filters';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { DataTableFacetedFilterConfig } from '@/shared/components/common/DataTable/types';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { EmployeeExpiringDocListItem } from '../lib/expiring-docs-types';

/**
 * Columnas y filtros que repiten las tablas de documentos por vencer de empleados y equipos: tipo de
 * documento, vencimiento, estado, fecha de carga y el enlace al documento.
 */

/** Campos de la fila que usan las columnas compartidas (los tienen las dos tablas). */
type ExpiringDocRow = Pick<
  EmployeeExpiringDocListItem,
  'id' | 'id_document_types' | 'document_types' | 'validity' | 'state' | 'created_at'
>;

export const stateLabels: Record<string, string> = {
  presentado: 'Presentado',
  rechazado: 'Rechazado',
  aprobado: 'Aprobado',
  vencido: 'Vencido',
};

const stateIcons: Record<string, LucideIcon> = {
  presentado: CheckCircle2,
  aprobado: CheckCircle2,
  rechazado: XCircle,
  vencido: AlertTriangle,
};

// Badge variants por estado
const stateBadgeVariants: Record<string, 'default' | 'success' | 'destructive' | 'yellow' | 'secondary'> = {
  presentado: 'default',
  aprobado: 'success',
  rechazado: 'destructive',
  vencido: 'yellow',
};

/** Columnas ocultas por defecto en las dos tablas. */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = ['created_at'];

/** Tipo de documento (FK → document_types). */
export function documentTypeColumn<T extends ExpiringDocRow>(): ColumnDef<T> {
  return {
    id: 'document_type',
    accessorFn: (row) => row.document_types?.name ?? '',
    ...titled('Tipo de Documento'),
    cell: ({ row }) => <span>{row.original.document_types?.name ?? '—'}</span>,
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.id_document_types;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
  };
}

/** Vencimiento (fecha con iconos de urgencia). */
export function validityColumn<T extends ExpiringDocRow>(): ColumnDef<T> {
  return {
    accessorKey: 'validity',
    ...titled('Vencimiento'),
    cell: ({ row }) => <DocumentExpiryCell validity={row.original.validity} state={row.original.state} />,
  };
}

/** Estado del documento. */
export function stateColumn<T extends ExpiringDocRow>(): ColumnDef<T> {
  return {
    accessorKey: 'state',
    ...titled('Estado'),
    cell: ({ row }) => {
      const stateVal = row.original.state as string | null;
      if (!stateVal) return <span className="text-muted-foreground">—</span>;

      const Icon = stateIcons[stateVal];
      const label = stateLabels[stateVal] ?? stateVal;
      const variant = stateBadgeVariants[stateVal] ?? 'secondary';

      return (
        <Badge variant={variant} className="gap-1">
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </Badge>
      );
    },
    filterFn: (row, id, value: string[]) => {
      const val = row.getValue(id) as string | null;
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val);
    },
  };
}

/** Subido el (fecha de carga). */
export function uploadedAtColumn<T extends ExpiringDocRow>(): ColumnDef<T> {
  return {
    accessorKey: 'created_at',
    ...titled('Subido el'),
    cell: ({ row }) => {
      const createdAt = row.original.created_at;
      return createdAt ? (
        <span>{formatArgentinaDay(createdAt)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  };
}

/** Enlace "Ver documento"; `resource` es el tipo de recurso del detalle (`Persona` o `Equipos`). */
export function viewDocumentColumn<T extends ExpiringDocRow>(resource: 'Persona' | 'Equipos'): ColumnDef<T> {
  return {
    id: 'actions',
    meta: { excludeFromExport: true },
    enableSorting: false,
    enableHiding: false,
    header: () => null,
    cell: ({ row }) => (
      <Link
        href={`/dashboard/document/${row.original.id}?resource=${resource}`}
        className="text-xs text-primary hover:underline whitespace-nowrap"
      >
        Ver documento
      </Link>
    ),
  };
}

/** Filtros comunes (estado, tipo de documento, vencimiento y fecha de carga), en el orden de las tablas. */
export function expiringDocFilters(facets: ReturnType<typeof createFacetFilters>): DataTableFacetedFilterConfig[] {
  return [
    facets.fixed('state', 'Estado', enumFilterOptions(Object.keys(stateLabels), stateLabels, stateIcons), {
      label: 'Sin estado',
    }),
    facets.lookup('document_type', 'Tipo de Documento', undefined, { label: 'Sin tipo' }),
    dateRangeFilter('validity', 'Vencimiento'),
    dateRangeFilter('created_at', 'Subido el'),
  ];
}
