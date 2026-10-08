'use client';

import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import SimpleDocument from '@/features/Documentacion/shared/components/SimpleDocument';
import { PermissionGuard } from '@/features/Permissions';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { contractTypeVehiclesLabels } from '@/shared/utils/mappers';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, Archive, CheckCircle2, Clock, FileText, XCircle } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { useState } from 'react';
import type { EquipmentPermanentDocumentListItem } from './queries.server';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Columnas ocultas por defecto (visibles al hacer toggle) */
export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [
  'deny_reason',
  'multiresource',
  'serie',
  // Nuevas columnas de datos del equipo (ocultas por defecto)
  'vehicle_type',
  'vehicle_subtype',
  'vehicle_brand',
  'vehicle_year',
  'vehicle_owner',
  'vehicle_sector',
  'vehicle_chassis',
  'vehicle_engine',
  'vehicle_contract_type',
  'vehicle_contract_expiration',
];

// ============================================================================
// ICONS — Estado
// ============================================================================

export const stateIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  presentado: FileText,
  aprobado: CheckCircle2,
  rechazado: XCircle,
  vencido: AlertCircle,
  pendiente: Clock,
};

// ============================================================================
// BADGE VARIANTS — Estado
// ============================================================================

type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>['variant']>;

const stateBadgeVariants: Record<string, BadgeVariant> = {
  presentado: 'default',
  aprobado: 'success',
  rechazado: 'destructive',
  vencido: 'yellow',
  pendiente: 'destructive',
};

// ============================================================================
// STATE LABELS
// ============================================================================

export const stateLabels: Record<string, string> = {
  presentado: 'Presentado',
  rechazado: 'Rechazado',
  aprobado: 'Aprobado',
  vencido: 'Vencido',
  pendiente: 'Pendiente',
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Retorna el propietario a mostrar. Las unidades de contrato "Propio" no tienen titular
 * externo cargado (owner_id null): en ese caso el propietario es la empresa, no un dato faltante.
 * Retorna string vacío cuando no hay dato, para que la celda renderice el guión habitual.
 */
function getOwnerDisplayName(vehicle: EquipmentPermanentDocumentListItem['vehicles']): string {
  if (!vehicle) return '';
  if (vehicle.equipment_owners?.name) return vehicle.equipment_owners.name;
  return vehicle.type_of_contract === 'Propio' ? 'Propio' : '';
}

// ============================================================================
// ACTIONS CELL — separate component (uses hooks)
// ============================================================================

function ActionsCell({ row }: { row: EquipmentPermanentDocumentListItem }) {
  const [open, setOpen] = useState(false);
  const isPending = row.state === 'pendiente';
  const isPrivateDocType = row.document_types?.private === true;

  if (isPending) {
    // Para tipos privados, verificar permiso upload_private en la tab padre
    const guardTab = isPrivateDocType ? 'documentos-de-equipos' : 'docs-equipos-permanentes';
    const guardAction = isPrivateDocType ? 'upload_private' : 'update';

    return (
      <PermissionGuard module="documentacion" tab={guardTab} action={guardAction}>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              Subir documento
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="max-h-[90vh] overflow-y-auto">
                <SimpleDocument
                  resource="equipo"
                  handleOpen={() => setOpen(false)}
                  defaultDocumentId={row.id_document_types ?? undefined}
                  numberDocument={row.vehicles?.id ?? undefined}
                />
              </div>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard module="documentacion" tab="docs-equipos-permanentes" action="view">
      <Link href={`/dashboard/document/${row.id}?resource=Equipos`}>
        <Button size="sm">Ver documento</Button>
      </Link>
    </PermissionGuard>
  );
}

// ============================================================================
// COLUMNS DEFINITION
// ============================================================================

export const columns: ColumnDef<EquipmentPermanentDocumentListItem>[] = [
  // ─── Equipo (Dominio) ─────────────────────────────────────────────────────
  {
    id: 'vehicle',
    accessorFn: (row) => row.vehicles?.domain ?? row.vehicles?.serie ?? '',
    meta: { title: 'Equipo', mobile: { role: 'title', priority: 1 } },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
    cell: ({ row }) => {
      const v = row.original.vehicles;
      if (!v) return <span className="text-muted-foreground">-</span>;
      const label = v.domain ?? v.serie ?? v.intern_number ?? '-';
      return (
        <Link
          href={`/dashboard/equipment/action?action=view&id=${v.id}`}
          className="hover:underline font-medium"
          target="_blank"
        >
          {label}
        </Link>
      );
    },
    enableSorting: true,
  },

  // ─── Serie (vehicles.serie) ──────────────────────────────────────────────
  {
    id: 'serie',
    accessorFn: (row) => row.vehicles?.serie ?? '',
    meta: { title: 'Serie' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Serie" />,
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.serie ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    enableSorting: false,
  },

  // ─── N° de Póliza (documents_equipment.policy_number) ────────────────────
  {
    id: 'policy_number',
    accessorKey: 'policy_number',
    meta: { title: 'N° de Póliza' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="N° de Póliza" />,
    cell: ({ row }) => (
      <span className="text-sm">{row.original.policy_number ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    enableSorting: true,
  },

  // ─── Tipo de documento ────────────────────────────────────────────────────
  {
    id: 'document_type',
    accessorFn: (row) => row.document_types?.name ?? '',
    meta: { title: 'Documento', mobile: { role: 'subtitle' } },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Documento" />,
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.document_types?.name ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.id_document_types;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
    enableSorting: true,
  },

  // ─── Afectado a ───────────────────────────────────────────────────────────
  {
    id: 'contractor',
    accessorFn: (row) => {
      const names = row.vehicles?.contractor_equipment?.map((ce) => ce.customers?.name ?? '').filter(Boolean) ?? [];
      return names.join(', ');
    },
    meta: { title: 'Afectado a', mobile: { role: 'field', priority: 2 } },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Afectado a" />,
    cell: ({ row }) => {
      const contractors =
        row.original.vehicles?.contractor_equipment?.map((ce) => ce.customers?.name ?? '').filter(Boolean) ?? [];

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
      const contractors = row.original.vehicles?.contractor_equipment ?? [];
      if (contractors.length === 0) return value.includes(NULL_FILTER_VALUE);
      return contractors.some((ce) => ce.customers?.id && value.includes(ce.customers.id));
    },
    enableSorting: false,
  },

  // ─── Estado ───────────────────────────────────────────────────────────────
  {
    id: 'state',
    accessorKey: 'state',
    meta: { title: 'Estado', mobile: { role: 'status' } },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => {
      // Documento archivado: historial / no vigente (solo visible en el detalle del equipo)
      if (row.original.archived_at != null) {
        return (
          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
            <Archive className="h-3 w-3" />
            Ya no aplica
          </Badge>
        );
      }

      const state = row.original.state as string | null;
      if (!state) return <Badge variant="outline">Sin estado</Badge>;

      const Icon = stateIcons[state];
      const variant = stateBadgeVariants[state] ?? 'default';
      const label = stateLabels[state] ?? state;

      return (
        <Badge variant={variant} className="capitalize flex items-center gap-1 w-fit">
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
    enableSorting: true,
  },

  // ─── Mandatorio ───────────────────────────────────────────────────────────
  {
    id: 'mandatory',
    accessorFn: (row) => (row.document_types?.mandatory != null ? String(row.document_types.mandatory) : null),
    meta: { title: 'Mandatorio' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Mandatorio" />,
    cell: ({ row }) => {
      const val = row.original.document_types?.mandatory;
      if (val == null) return <span className="text-muted-foreground">-</span>;
      return <span>{val ? 'Sí' : 'No'}</span>;
    },
    filterFn: (row, _id, value: string[]) => {
      const val = row.original.document_types?.mandatory;
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(val));
    },
    enableSorting: false,
  },

  // ─── Multirecurso ─────────────────────────────────────────────────────────
  {
    id: 'multiresource',
    accessorFn: (row) => (row.document_types?.multiresource != null ? String(row.document_types.multiresource) : null),
    meta: { title: 'Multirecurso' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Multirecurso" />,
    cell: ({ row }) => {
      const val = row.original.document_types?.multiresource;
      if (val == null) return <span className="text-muted-foreground">-</span>;
      return <span>{val ? 'Sí' : 'No'}</span>;
    },
    filterFn: (row, _id, value: string[]) => {
      const val = row.original.document_types?.multiresource;
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(val));
    },
    enableSorting: false,
  },

  // ─── Vencimiento ──────────────────────────────────────────────────────────
  {
    id: 'validity',
    accessorKey: 'validity',
    meta: { title: 'Vencimiento', mobile: { role: 'field', priority: 1 } },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Vencimiento" />,
    cell: ({ row }) => {
      // Documento archivado: no aplica estado de vigencia/vencimiento
      if (row.original.archived_at != null) {
        return <span className="text-muted-foreground">-</span>;
      }

      const hasExpiration = row.original.document_types?.explired;
      if (!hasExpiration) {
        return <Badge variant="outline">No vence</Badge>;
      }

      if (row.original.state === 'pendiente') {
        return <Badge variant="destructive">Pendiente</Badge>;
      }

      if (row.original.validity) {
        return <span>{moment(row.original.validity).format('DD/MM/YYYY')}</span>;
      }

      return <Badge variant="outline">No vence</Badge>;
    },
    enableSorting: true,
  },

  // ─── Subido el ────────────────────────────────────────────────────────────
  {
    id: 'created_at',
    accessorKey: 'created_at',
    meta: { title: 'Subido el', mobile: { role: 'field', priority: 3 } },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subido el" />,
    cell: ({ row }) => {
      if (row.original.state === 'pendiente') {
        return <span className="text-muted-foreground">No disponible</span>;
      }
      // Usar la fecha del log más reciente si existe, sino created_at
      const latestLog = row.original.documents_equipment_logs?.[0];
      const date = latestLog?.updated_at ?? row.original.created_at;
      return <span>{moment(date).format('DD/MM/YYYY')}</span>;
    },
    enableSorting: true,
  },

  // ─── Motivo de rechazo ────────────────────────────────────────────────────
  {
    id: 'deny_reason',
    accessorKey: 'deny_reason',
    meta: { title: 'Motivo de rechazo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Motivo de rechazo" />,
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.deny_reason ?? '-'}</span>,
    enableSorting: false,
  },

  // ─── Tipo (vehicles.type → type_vehicles_typeTotype) ─────────────────────
  {
    id: 'vehicle_type',
    accessorFn: (row) => row.vehicles?.type_vehicles_typeTotype?.name ?? '',
    meta: { title: 'Tipo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.type_vehicles_typeTotype?.name ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.vehicles?.type;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
    enableSorting: true,
  },

  // ─── Subtipo (vehicles.subType → sub_type) ────────────────────────────────
  {
    id: 'vehicle_subtype',
    accessorFn: (row) => row.vehicles?.sub_type?.name ?? '',
    meta: { title: 'Subtipo' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Subtipo" />,
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.sub_type?.name ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.vehicles?.subType;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
    enableSorting: true,
  },

  // ─── Marca (vehicles.brand → brand_vehicles, id es Int) ───────────────────
  {
    id: 'vehicle_brand',
    accessorFn: (row) => row.vehicles?.brand_vehicles?.name ?? '',
    meta: { title: 'Marca' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Marca" />,
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.brand_vehicles?.name ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const brandId = row.original.vehicles?.brand;
      if (brandId == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(String(brandId));
    },
    enableSorting: true,
  },

  // ─── Año (vehicles.year, string directo) ─────────────────────────────────
  {
    id: 'vehicle_year',
    accessorFn: (row) => row.vehicles?.year ?? '',
    meta: { title: 'Año' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Año" />,
    cell: ({ row }) => (
      <span className="text-sm">{row.original.vehicles?.year ?? <span className="text-muted-foreground">-</span>}</span>
    ),
    enableSorting: true,
  },

  // ─── Propietario (vehicles.owner_id → equipment_owners) ──────────────────
  {
    id: 'vehicle_owner',
    accessorFn: (row) => getOwnerDisplayName(row.vehicles),
    meta: { title: 'Propietario' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Propietario" />,
    cell: ({ row }) => {
      const owner = getOwnerDisplayName(row.original.vehicles);
      return <span className="text-sm">{owner || <span className="text-muted-foreground">-</span>}</span>;
    },
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.vehicles?.owner_id;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
    enableSorting: true,
  },

  // ─── Sector (vehicles.sector → hierarchy) ────────────────────────────────
  {
    id: 'vehicle_sector',
    accessorFn: (row) => row.vehicles?.hierarchy?.name ?? '',
    meta: { title: 'Sector' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Sector" />,
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.hierarchy?.name ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    filterFn: (row, _id, value: string[]) => {
      const id = row.original.vehicles?.sector;
      if (id == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(id);
    },
    enableSorting: true,
  },

  // ─── Chasis (vehicles.chassis, string opcional directo) ──────────────────
  {
    id: 'vehicle_chassis',
    accessorFn: (row) => row.vehicles?.chassis ?? '',
    meta: { title: 'Chasis' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Chasis" />,
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.chassis ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    enableSorting: true,
  },

  // ─── Motor (vehicles.engine, string directo) ─────────────────────────────
  {
    id: 'vehicle_engine',
    accessorFn: (row) => row.vehicles?.engine ?? '',
    meta: { title: 'Motor' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Motor" />,
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.vehicles?.engine ?? <span className="text-muted-foreground">-</span>}
      </span>
    ),
    enableSorting: true,
  },

  // ─── Tipo de contrato (vehicles.type_of_contract, enum) ──────────────────
  {
    id: 'vehicle_contract_type',
    accessorFn: (row) => {
      const val = row.vehicles?.type_of_contract;
      if (!val) return '';
      return contractTypeVehiclesLabels[val] ?? val;
    },
    meta: { title: 'Tipo de contrato' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo de contrato" />,
    cell: ({ row }) => {
      const val = row.original.vehicles?.type_of_contract;
      if (!val) return <span className="text-muted-foreground">-</span>;
      return <span className="text-sm">{contractTypeVehiclesLabels[val] ?? val}</span>;
    },
    filterFn: (row, _id, value: string[]) => {
      const val = row.original.vehicles?.type_of_contract;
      if (val == null) return value.includes(NULL_FILTER_VALUE);
      return value.includes(val);
    },
    enableSorting: true,
  },

  // ─── Vencimiento de contrato (vehicles.contract_expiration_date, fecha) ──
  {
    id: 'vehicle_contract_expiration',
    accessorFn: (row) => row.vehicles?.contract_expiration_date ?? null,
    meta: { title: 'Venc. de contrato' },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Venc. de contrato" />,
    cell: ({ row }) => {
      const date = row.original.vehicles?.contract_expiration_date;
      if (!date) return <span className="text-muted-foreground">-</span>;
      return <span className="text-sm">{moment(date).format('DD/MM/YYYY')}</span>;
    },
    enableSorting: true,
  },

  // ─── Acciones ─────────────────────────────────────────────────────────────
  {
    id: 'actions',
    meta: { excludeFromExport: true, title: '' },
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => <ActionsCell row={row.original} />,
  },
];
