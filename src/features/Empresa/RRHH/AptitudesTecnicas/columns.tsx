'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { activeStatusColumn, editActionColumn } from '@/features/Empresa/components/catalog-columns';
import { DataTableColumnHeader } from '@/shared/components/common/DataTable/DataTableColumnHeader';
import { titled } from '@/shared/components/common/DataTable/column-helpers';
import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import type { ColumnDef } from '@tanstack/react-table';
import type { AptitudTecnicaListItem } from './actions.server';

// ============================================================================
// HIDDEN COLUMNS BY DEFAULT
// ============================================================================

export const HIDDEN_COLUMNS_BY_DEFAULT: string[] = [];

// ============================================================================
// PERMISSIONS TYPE
// ============================================================================

type Permissions = {
  hasPermission: (module: string, tab: string, action: string) => boolean;
};

// ============================================================================
// COLUMNS
// ============================================================================

export function getColumns(
  permissions: Permissions,
  onEdit: (item: AptitudTecnicaListItem) => void
): ColumnDef<AptitudTecnicaListItem>[] {
  const canUpdate = permissions.hasPermission('configuracion', 'aptitudes', 'update');

  return [
    // ── Nombre ──────────────────────────────────────────────────────────────
    {
      accessorKey: 'nombre',
      ...titled('Nombre'),
      cell: ({ row }) => <span className="font-medium">{row.original.nombre}</span>,
      // filterFn no necesario para filtros type: 'text'
    },

    // ── Puestos (M:M) ───────────────────────────────────────────────────────
    {
      id: 'puestos',
      meta: { title: 'Puestos' },
      enableSorting: false, // M:M — no sortable en BD
      filterFn: (row, _id, value: string[]) => {
        const puestos = row.original.aptitudes_tecnicas_puestos ?? [];
        if (puestos.length === 0) return value.includes(NULL_FILTER_VALUE);
        return puestos.some((p) => value.includes(p.puesto_id));
      },
      accessorFn: (row) => {
        // Para export: concatenar nombres de puestos
        const puestos = row.aptitudes_tecnicas_puestos ?? [];
        return puestos
          .map((p) => p.company_positions?.name ?? '')
          .filter(Boolean)
          .join(', ');
      },
      header: ({ column }) => <DataTableColumnHeader column={column} title="Puestos" />,
      cell: ({ row }) => {
        const puestos = row.original.aptitudes_tecnicas_puestos ?? [];
        if (puestos.length === 0) {
          return <span className="text-muted-foreground text-sm">Sin puestos asignados</span>;
        }

        const nombres = puestos.map((p) => p.company_positions?.name ?? '').filter(Boolean);
        const [first, ...rest] = nombres;

        if (rest.length === 0) {
          return <Badge variant="secondary">{first}</Badge>;
        }

        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex">
                  <Badge variant="secondary" className="cursor-pointer select-none">
                    {first} +{rest.length}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent className="bg-black text-white rounded-lg p-2">
                <div className="flex flex-col gap-1">
                  {rest.map((nombre, index) => (
                    <span key={`${nombre}-${index}`}>{nombre}</span>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },

    // ── Estado (is_active — booleano nullable) ────────────────────────────
    activeStatusColumn<AptitudTecnicaListItem>(),

    // ── Acciones ─────────────────────────────────────────────────────────
    ...editActionColumn<AptitudTecnicaListItem>({ canEdit: canUpdate, onEdit, getName: (item) => item.nombre }),
  ];
}
