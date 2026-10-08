'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDateOnly } from '@/features/Mantenimiento/utils/dateFormat';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { DataTableColumnHeader } from '@/shared/components/data-table/base/data-table-column-header';
import { ColumnDef } from '@tanstack/react-table';
import { Settings2 } from 'lucide-react';

// Tipo para cada fila de desvío aplanado
export interface DesvioRowData {
  id: string;
  orderId: string;
  // Info del equipo
  vehicleId: string;
  vehicleDomain: string | null;
  vehicleSerie: string | null;
  vehicleInternNumber: string | null;
  vehicleType: string | null;
  vehicleCondition: string | null;
  // Info del desvío
  deviationId: string | null;
  itemLabel: string;
  itemCode: string | null;
  sectionCode: string | null;
  description: string | null;
  driverComment: string | null;
  // Tipo de reparación (legacy, campo único)
  repairTypeId: string | null;
  repairTypeName: string | null;
  // Múltiples tipos de reparación (tabla pivot)
  repairTypeIds: string[];
  repairTypeNames: string[];
  // Info de la orden
  workshopEntryDate: string | null;
  kilometer: number | string | null;
  // Asignaciones
  workshopId: string | null;
  sectorId: string | null;
  startDate: string | null;
  endDate: string | null;
  // Orden de trabajo asociada
  workOrderId: string | null;
  workOrderNumber: string | null;
  workOrderStatus: string | null;
  workOrderPriority: string | null;
  workOrderWorkshopId: string | null;
  workOrderWorkshopName: string | null;
  workOrderSectorId: string | null;
  workOrderSectorName: string | null;
}

interface ColumnsProps {
  onAssign: (desvio: DesvioRowData) => void;
}

// Función para formatear el código de sección
const formatSectionCode = (code: string | null | undefined): string => {
  if (!code) return '-';
  return code
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export function getColumns({ onAssign }: ColumnsProps): ColumnDef<DesvioRowData>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Seleccionar todos"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar fila"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'vehicleDomain',
      id: 'Equipo',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Equipo" />,
      cell: ({ row }) => {
        const domain = row.original.vehicleDomain;
        const serie = row.original.vehicleSerie;
        const internNumber = row.original.vehicleInternNumber;
        return (
          <div className="flex flex-col">
            <span className="font-medium">{domain || serie || 'Sin identificar'}</span>
            {internNumber && <span className="text-xs text-muted-foreground">#{internNumber}</span>}
          </div>
        );
      },
      filterFn: (row, id, value) => {
        const vehicleLabel = row.original.vehicleDomain || row.original.vehicleSerie || 'Sin identificar';
        return value.includes(vehicleLabel);
      },
      enableSorting: true,
    },
    {
      accessorKey: 'itemLabel',
      id: 'Desvio',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Desvío" />,
      cell: ({ row }) => {
        return (
          <div className="flex flex-col max-w-[250px]">
            <span className="font-medium truncate" title={row.original.itemLabel}>
              {row.original.itemLabel}
            </span>
            {row.original.itemCode && (
              <span className="text-xs text-muted-foreground">Código: {row.original.itemCode}</span>
            )}
          </div>
        );
      },
      enableSorting: true,
    },
    {
      accessorKey: 'sectionCode',
      id: 'Seccion',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sección" />,
      cell: ({ row }) => {
        return <span>{formatSectionCode(row.original.sectionCode)}</span>;
      },
      filterFn: (row, id, value) => {
        return value.includes(row.original.sectionCode);
      },
      enableSorting: true,
    },
    {
      accessorKey: 'repairTypeName',
      id: 'TipoReparacion',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo Reparación" />,
      cell: ({ row }) => {
        // Usar repairTypeNames (pivot) primero, si está vacío usar repairTypeName (legacy)
        const repairTypes =
          row.original.repairTypeNames?.length > 0
            ? row.original.repairTypeNames
            : row.original.repairTypeName
              ? [row.original.repairTypeName]
              : [];

        if (repairTypes.length === 0) {
          return <span className="text-muted-foreground italic">Sin asignar</span>;
        }

        if (repairTypes.length === 1) {
          return <Badge variant="outline">{repairTypes[0]}</Badge>;
        }

        // Múltiples tipos: mostrar el primero con tooltip
        return (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Badge variant="outline">{repairTypes[0]}</Badge>
                  <Badge variant="secondary" className="text-xs">
                    +{repairTypes.length - 1}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent className="bg-black text-white p-2 rounded-lg">
                <div className="flex flex-col gap-1">
                  {repairTypes.map((name, index) => (
                    <span key={index}>{name}</span>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      filterFn: (row, id, value) => {
        // Filtrar por cualquiera de los tipos de reparación
        const repairTypes =
          row.original.repairTypeNames?.length > 0
            ? row.original.repairTypeNames
            : row.original.repairTypeName
              ? [row.original.repairTypeName]
              : [];
        return repairTypes.some((type) => value.includes(type));
      },
      enableSorting: true,
    },
    {
      accessorKey: 'workshopEntryDate',
      id: 'FechaEntrada',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Entrada Taller" />,
      cell: ({ row }) => {
        const date = row.original.workshopEntryDate;
        if (!date) return <span className="text-muted-foreground">-</span>;
        return formatDateOnly(date);
      },
      enableSorting: true,
    },
    {
      accessorKey: 'workshopId',
      id: 'Estado',
      header: 'Estado',
      cell: ({ row }) => {
        const hasWorkOrder = row.original.workOrderId;
        const workOrderNumber = row.original.workOrderNumber;
        const hasWorkshop = row.original.workshopId;
        const hasSector = row.original.sectorId;
        const hasDateRange = row.original.startDate && row.original.endDate;

        // Si tiene OT asignada, mostrar badge especial
        if (hasWorkOrder) {
          return (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="info">
                    Con OT
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="bg-black text-white p-2 rounded-lg">
                  <span>Orden: {workOrderNumber || 'Pendiente'}</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }

        if (hasWorkshop && hasSector && hasDateRange) {
          return <Badge variant="success">Asignado</Badge>;
        } else if (hasWorkshop || hasSector) {
          return <Badge variant="warning">Parcial</Badge>;
        }
        return <Badge variant="secondary">Pendiente</Badge>;
      },
      filterFn: (row, id, value) => {
        const hasWorkOrder = row.original.workOrderId;
        if (hasWorkOrder && value.includes('Con OT')) return true;
        if (!hasWorkOrder && value.includes('Pendiente') && !row.original.workshopId) return true;
        if (!hasWorkOrder && value.includes('Asignado') && row.original.workshopId) return true;
        return false;
      },
      enableSorting: false,
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => {
        const desvio = row.original;

        return (
          <div className="flex items-center gap-2">
            <PermissionGuard module="mantenimiento" tab="planificacion" action="update">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onAssign(desvio)}
                title="Asignar taller, sector y período"
                className="text-blue-600 hover:text-blue-700"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </PermissionGuard>
          </div>
        );
      },
      enableSorting: false,
    },
  ];
}
