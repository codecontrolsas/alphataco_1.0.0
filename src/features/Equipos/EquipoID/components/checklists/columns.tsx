'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader, type DataTableFilterOption } from '@/shared/components/common/DataTable';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { formatArgentinaDateTime } from '@/shared/lib/argentina-time';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Link as LinkIcon,
  ShieldCheck,
  User,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { EquipmentChecklistAnswer } from '../../actions/checklist-queries';
import { parseCriticalItemLabels, summarizeCriticalItems } from '../../lib/critical-items';

// ============================================================================
// LABELS & ICONS
// ============================================================================

/** Resultado del checklist: `B` (bueno) o `M` (malo); cualquier otro valor se trata como "Sin resultado". */
export const CHECKLIST_RESULT_LABELS: Record<string, string> = { B: 'Bueno', M: 'Malo' };

export const CHECKLIST_RESULT_ICONS: Record<string, LucideIcon> = { B: CheckCircle, M: XCircle };

export const CHECKLIST_RESULT_OPTIONS: DataTableFilterOption[] = Object.keys(CHECKLIST_RESULT_LABELS).map((value) => ({
  value,
  label: CHECKLIST_RESULT_LABELS[value],
  icon: CHECKLIST_RESULT_ICONS[value],
}));

export const CRITICAL_ITEMS_OPTIONS: DataTableFilterOption[] = [
  { value: 'true', label: 'Con ítems críticos fallidos', icon: AlertTriangle },
  { value: 'false', label: 'Sin ítems críticos fallidos', icon: ShieldCheck },
];

function getTractorLabel(answer: EquipmentChecklistAnswer): string {
  const tractor = answer.checklist_answers?.vehicles;
  if (!tractor) return '';
  const identifier = tractor.domain || tractor.serie || '';
  return `${identifier} - ${tractor.intern_number || ''}`;
}

// ============================================================================
// COLUMNAS
// ============================================================================

export function getChecklistColumns(): ColumnDef<EquipmentChecklistAnswer>[] {
  return [
    {
      accessorKey: 'created_at',
      id: 'created_at',
      meta: { title: 'Fecha' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
      cell: ({ row }) => {
        const date = row.original.created_at;
        return (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{date ? formatArgentinaDateTime(date) : '-'}</span>
          </div>
        );
      },
    },
    {
      id: 'template',
      accessorFn: (row) => row.checklist_templates?.name ?? '',
      meta: { title: 'Checklist' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Checklist" />,
      cell: ({ row }) => {
        const template = row.original.checklist_templates;
        return (
          <div>
            <div className="font-medium">{template?.name || 'Checklist sin nombre'}</div>
            {template?.description && <div className="text-xs text-muted-foreground mt-1">{template.description}</div>}
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => value.includes(row.original.checklist_templates?.id ?? ''),
    },
    {
      accessorKey: 'result',
      id: 'result',
      meta: { title: 'Resultado' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Resultado" />,
      cell: ({ row }) => {
        const result = row.original.result;
        const Icon = result ? CHECKLIST_RESULT_ICONS[result] : undefined;
        if (!result || !Icon) return <Badge variant="outline">Sin resultado</Badge>;
        return (
          <Badge variant={result === 'B' ? 'success' : 'destructive'} className="gap-1">
            <Icon className="h-3 w-3" />
            {CHECKLIST_RESULT_LABELS[result]}
          </Badge>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const result = row.original.result;
        if (result == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(result);
      },
    },
    {
      // La lista de ítems críticos no tiene un campo ordenable; se filtra por "con / sin ítems fallidos".
      id: 'criticalItems',
      accessorFn: (row) => parseCriticalItemLabels(row.critical_items_failed).join(', '),
      meta: { title: 'Items Críticos Fallidos' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items Críticos Fallidos" />,
      cell: ({ row }) => {
        const labels = parseCriticalItemLabels(row.original.critical_items_failed);
        if (labels.length === 0) return <span className="text-sm text-muted-foreground">Ninguno</span>;
        return (
          <div className="space-y-1">
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" />
              {labels.length} item(s)
            </Badge>
            <div className="text-xs text-muted-foreground max-w-md break-words">{summarizeCriticalItems(labels)}</div>
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) =>
        value.includes(String(parseCriticalItemLabels(row.original.critical_items_failed).length > 0)),
    },
    {
      // La unidad tractora es otra respuesta de checklist enlazada: se filtra por texto (dominio, serie o interno).
      id: 'tractorUnit',
      accessorFn: (row) => getTractorLabel(row),
      meta: { title: 'Unidad Tractor' },
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Unidad Tractor" />,
      cell: ({ row }) => {
        const tractorAnswer = row.original.checklist_answers;
        if (!tractorAnswer?.vehicles) return <span className="text-sm text-muted-foreground">-</span>;
        return (
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href={`/dashboard/equipment/action?id=${tractorAnswer.equipment_id}&action=view`}>
              <LinkIcon className="h-3 w-3" />
              {getTractorLabel(row.original)}
            </Link>
          </Button>
        );
      },
    },
    {
      id: 'performedBy',
      accessorFn: (row) => row.profile?.fullname ?? '',
      meta: { title: 'Realizado por' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Realizado por" />,
      cell: ({ row }) => {
        const name = row.original.profile?.fullname;
        if (!name) return <span className="text-sm text-muted-foreground">Usuario desconocido</span>;
        return (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{name}</span>
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => {
        const profileId = row.original.profile?.id;
        if (profileId == null) return value.includes(NULL_FILTER_VALUE);
        return value.includes(profileId);
      },
    },
    {
      accessorKey: 'observations',
      id: 'observations',
      meta: { title: 'Observaciones' },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Observaciones" />,
      cell: ({ row }) => {
        const observations = row.original.observations;
        if (!observations) return <span className="text-sm text-muted-foreground">-</span>;
        return (
          <p className="max-w-xs truncate text-sm" title={observations}>
            {observations}
          </p>
        );
      },
    },
    {
      id: 'actions',
      meta: { excludeFromExport: true, title: '' },
      enableSorting: false,
      enableHiding: false,
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href={`/dashboard/forms/${row.original.id}/view`} target="_blank" rel="noopener noreferrer">
            <LinkIcon className="h-4 w-4" />
            Ver
          </Link>
        </Button>
      ),
    },
  ];
}
