'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import HistoryModal from '@/features/Operaciones/PartesDiarios/components/HistoryModal';
import { ServiceDetailModal } from '@/features/Operaciones/PartesDiarios/components/ServiceDetailModal';
import { RemitosManagerModal } from '@/features/Operaciones/PartesDiarios/remitManager';
import { PermissionGuard } from '@/features/Permissions/components/PermissionGuard';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { BaseDataTable } from '@/shared/components/data-table/base/data-table';
import { DataTableColumnHeader } from '@/shared/components/data-table/base/data-table-column-header';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Edit, FileText } from 'lucide-react';
import moment from 'moment';
import { useCallback, useMemo, useState } from 'react';
import { BulkCertificacionModal } from './BulkCertificacionModal';
import {
  formatCustomerEquipmentForExport,
  formatEmployeesForExport,
  formatEquipmentForExport,
} from './export-formatters';

import { Logger } from '@/lib/logger';
import { transformDailyReports, type transformDailyReportsType } from '../lib/transform';

/**
 * Columna filtrable del toolbar legacy. `type: 'select'` es sólo descriptivo: el toolbar
 * únicamente distingue `'date-range'`; el resto se resuelve por la presencia de `options`.
 */
const logger = new Logger('Certificacion/EnhancedComercialReportTable');

export interface ReportFilterableColumn {
  columnId: string;
  title: string;
  type?: 'date-range' | 'select';
  options?: { label: string; value: string }[];
  showFrom?: boolean;
  showTo?: boolean;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  defaultValues?: { from: Date | null; to: Date | null };
}

// Tipo extendido para columnas con propiedades adicionales de exportación
type ExtendedColumnDef<TData> = ColumnDef<TData> & {
  exportFormatter?: (value: unknown, row: TData) => string;
  excludeFromExport?: boolean;
  exportHeader?: string; // Nombre personalizado para la columna en el Excel
};

// Se ha modificado la interfaz para que customer_equipment acepte un array de objetos
type TableRow = ReturnType<typeof transformDailyReports>[number];

interface EnhancedComercialReportTableProps {
  dailyReports: transformDailyReportsType;
  onEdit?: (row: TableRow) => void;
  onView?: (row: TableRow) => void;
  onViewHistory?: (row: TableRow) => void;
  showActions: boolean;
  filterableColumns?: ReportFilterableColumn[];
  refetchDailyReports?: () => void;
}

// Mapeo de estados a variantes de badge
const statusVariantMap = {
  pendiente: 'secondary',
  ejecutado: 'success',
  reprogramado: 'warning',
  cancelado: 'destructive',
  en_certificacion: 'warning',
  sin_recursos_asignados: 'warning',
} as const;

type StatusKey = keyof typeof statusVariantMap;

export const EnhancedComercialReportTable: React.FC<EnhancedComercialReportTableProps> = ({
  dailyReports,
  onEdit,
  onView,
  onViewHistory,
  showActions,
  filterableColumns,
  refetchDailyReports,
}) => {
  // Estado para el modal de remitos
  const [remitModalOpen, setRemitModalOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string>('');

  // Estado para la selección masiva
  const [selectedRows, setSelectedRows] = useState<TableRow[]>([]);
  const [isBulkCertificacionModalOpen, setIsBulkCertificacionModalOpen] = useState(false);

  // Verificar permisos de edición
  const { canUpdate } = usePermissions();
  const canEdit = canUpdate('comercial', 'daily_reports');

  const columns = useMemo<ExtendedColumnDef<TableRow>[]>(() => {
    const baseColumns: ExtendedColumnDef<TableRow>[] = [
      // Columna de selección - Solo visible si tiene permisos de edición
      ...(canEdit
        ? [
            {
              id: 'select',
              header: ({ table }) => (
                <div className="w-[20px]">
                  <Checkbox
                    disabled={table.getRowModel().rows.every((row) => !row.getCanSelect())}
                    checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label="Select all"
                    className="translate-y-[2px]"
                  />
                </div>
              ),
              cell: ({ row }) => (
                <Checkbox
                  disabled={!row.getCanSelect()}
                  checked={row.getIsSelected()}
                  onCheckedChange={(value) => row.toggleSelected(!!value)}
                  aria-label="Select row"
                  className="translate-y-[2px]"
                />
              ),
              enableSorting: false,
              enableHiding: false,
              excludeFromExport: true,
            } as ExtendedColumnDef<TableRow>,
          ]
        : []),
      {
        id: 'date',
        accessorKey: 'date',
        exportHeader: 'Fecha',
        header: ({ column, table }) => (
          <DataTableColumnHeader className="min-w-[100px]" column={column} table={table} title="Fecha" />
        ),
        cell: ({ row }) => {
          return <span className="font-medium">{row.original.date}</span>;
        },
        filterFn: (row, id, value) => {
          if (!value?.from && !value?.to) return true;
          try {
            const rowDate = new Date(row.original.date);
            const fromDate = value.from ? new Date(value.from) : new Date(0);
            const toDate = value.to ? new Date(value.to) : new Date();
            toDate.setHours(23, 59, 59, 999);
            return rowDate >= fromDate && rowDate <= toDate;
          } catch (error) {
            logger.error('Error al filtrar por fecha', { data: { error } });
            return true;
          }
        },
        // exportFormatter: (value, row) => row.date,
      },
      {
        id: 'customer',
        accessorKey: 'customer',
        header: ({ column, table }) => <DataTableColumnHeader column={column} table={table} title="Cliente" />,
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const customer = row.original.customer;
          return value.includes(customer);
        },
      },
      {
        id: 'services',
        accessorKey: 'services',
        header: ({ column, table }) => (
          <DataTableColumnHeader className="min-w-[130px]" column={column} table={table} title="Servicio" />
        ),
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const services = row.original.services;
          return value.includes(services);
        },
      },
      {
        id: 'item',
        accessorKey: 'item',
        header: ({ column, table }) => (
          <DataTableColumnHeader className="min-w-[130px]" column={column} table={table} title="Ítem" />
        ),
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const item = row.original.item;
          return value.includes(item);
        },
      },
      {
        id: 'item_description',
        accessorKey: 'item_description',
        header: ({ column, table }) => (
          <DataTableColumnHeader className="min-w-[130px]" column={column} table={table} title="Descripción Ítem" />
        ),
        exportHeader: 'Descripción Ítem',
        size: 150,
        cell: ({ row }) => {
          return (
            <div className="max-w-[150px] whitespace-pre-wrap break-words">
              <span className="text-sm text-muted-foreground">{row.original.item_description || '-'}</span>
            </div>
          );
        },
      },
      {
        id: 'customer_equipment',
        accessorKey: 'customer_equipment',
        header: ({ column, table }) => <DataTableColumnHeader column={column} table={table} title="Equipo Cliente" />,
        exportHeader: 'Equipo Cliente',
        // Se ha modificado el cell para mostrar la propiedad 'name' del objeto
        cell: ({ row }) => {
          const equipment = row.original.customer_equipment || [];
          return (
            <div className="flex flex-wrap gap-1">
              {equipment.map((eq, index) => (
                <Badge key={index} variant="secondary" className="rounded-sm">
                  {eq.name}
                </Badge>
              ))}
            </div>
          );
        },
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const equipment = row.original.customer_equipment || [];
          const equipmentNames = equipment.map((eq) => eq.name);
          return equipmentNames.some((eqName) => value.includes(eqName));
        },
        exportFormatter: (value, row) => formatCustomerEquipmentForExport(row.customer_equipment),
      },
      {
        id: 'area',
        accessorKey: 'area',
        header: ({ column, table }) => <DataTableColumnHeader column={column} table={table} title="Área" />,
        cell: ({ row }) => {
          return row.original.area;
        },
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const area = row.original.area;
          return value.includes(area);
        },
      },
      {
        id: 'sector',
        accessorKey: 'sector',
        header: ({ column, table }) => <DataTableColumnHeader column={column} table={table} title="Sector" />,
        cell: ({ row }) => {
          return row.original.sector;
        },
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const sector = row.original.sector;
          return value.includes(sector);
        },
      },
      {
        id: 'type_service',
        accessorKey: 'type_service',
        header: ({ column, table }) => <DataTableColumnHeader column={column} table={table} title="Tipo de Servicio" />,
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const type = row.original.type_service;
          return value.includes(type);
        },
      },
      {
        // Remitos de la línea: vienen siempre como lista desde la tabla `remitos` (fuente única)
        id: 'remit_number',
        accessorFn: (row) => (row.remit_numbers ?? []).join(','),
        header: ({ column, table }) => <DataTableColumnHeader column={column} table={table} title="N° de Remito" />,
        cell: ({ row }) => {
          const remitNumbers = row.original.remit_numbers ?? [];
          if (remitNumbers.length === 0) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {remitNumbers.map((remitNum: string) => (
                <Badge key={remitNum} variant="outline" className="font-mono tabular-nums">
                  {remitNum}
                </Badge>
              ))}
            </div>
          );
        },
        filterFn: (row, _id, value) => {
          if (!value || (Array.isArray(value) && value.length === 0)) return true;
          const remitNumbers: string[] = row.original.remit_numbers ?? [];

          // Filtro de opciones: alguno de los remitos de la línea está entre los elegidos
          if (Array.isArray(value)) return remitNumbers.some((remitNum) => value.includes(remitNum));

          // Búsqueda de texto
          const searchTerm = String(value).toLowerCase().trim();
          return remitNumbers.some((remitNum) => remitNum.toLowerCase().includes(searchTerm));
        },
        exportHeader: 'N° de Remito',
        exportFormatter: (_value, row) => (row.remit_numbers ?? []).join(', '),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column, table }) => <DataTableColumnHeader column={column} table={table} title="Estado" />,
        cell: ({ row }) => {
          const status = row.original.status as StatusKey;
          const statusText =
            {
              pendiente: 'Pendiente',
              sin_recursos_asignados: 'Sin recursos asignados',
              ejecutado: 'Ejecutado',
              reprogramado: 'Reprogramado',
              cancelado: 'Cancelado',
              en_certificacion: 'En certificación',
            }[status] || status;

          const statusColors: Record<
            string,
            'default' | 'outline' | 'secondary' | 'destructive' | 'success' | 'warning' | null | undefined
          > = {
            pendiente: 'secondary',
            sin_recursos_asignados: 'warning',
            ejecutado: 'success',
            reprogramado: 'outline',
            cancelado: 'destructive',
            en_certificacion: 'default',
          };

          return <Badge variant={statusColors[status] || 'default'}>{statusText}</Badge>;
        },
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const status = row.original.status;
          return value.includes(status);
        },
      },
      {
        id: 'employees',
        accessorKey: 'employees',
        header: ({ column, table }) => (
          <DataTableColumnHeader className="min-w-[200px]" column={column} table={table} title="Empleados" />
        ),
        exportHeader: 'Empleados',
        cell: ({ row }) => {
          const employees = row.original.employees || [];
          return (
            <div className="flex flex-wrap gap-1">
              {employees.map((employee, index) => (
                <Badge key={index} variant="secondary" className="rounded-sm">
                  {employee}
                </Badge>
              ))}
            </div>
          );
        },
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const employees = row.original.employees || [];
          return employees.some((employee) => value.includes(employee));
        },
        exportFormatter: (value, row) => formatEmployeesForExport(row.employees),
      },
      {
        id: 'equipment',
        accessorKey: 'equipment',
        header: ({ column, table }) => <DataTableColumnHeader column={column} table={table} title="Equipo Empresa" />,
        exportHeader: 'Equipo Empresa',
        cell: ({ row }) => {
          const equipment = row.original.equipment || [];
          return (
            <div className="flex flex-wrap gap-1">
              {equipment.map((eq, index) => (
                <Badge key={index} variant="secondary" className="rounded-sm">
                  {eq}
                </Badge>
              ))}
            </div>
          );
        },
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const equipment = row.original.equipment || [];
          return equipment.some((eq) => value.includes(eq));
        },
        exportFormatter: (value, row) => formatEquipmentForExport(row.equipment),
      },
      {
        id: 'working_day',
        accessorKey: 'working_day',
        header: ({ column, table }) => (
          <DataTableColumnHeader className="min-w-[100px]" column={column} table={table} title="Jornada" />
        ),
        filterFn: (row, id, value) => {
          if (!value || value.length === 0) return true;
          const workingDay = row.original.working_day;
          return value.includes(workingDay);
        },
      },
      {
        id: 'description',
        accessorKey: 'description',
        header: ({ column, table }) => (
          <DataTableColumnHeader className="min-w-[300px]" column={column} table={table} title="Descripción" />
        ),
        exportHeader: 'Descripción',
      },
      // {
      //   id: 'document_path',
      //   accessorKey: 'document_path',
      //   header: 'Documento',
      //   cell: ({ row }) => {
      //     const url = row.original.document_path;
      //     return url ? (
      //       <div className="flex justify-center">
      //         <Button
      //           variant="ghost"
      //           size="icon"
      //           onClick={() => {
      //             window.open(url, '_blank');
      //           }}
      //           className="h-8 w-8 p-0"
      //         >
      //           <Eye className="h-4 w-4" />
      //           <span className="sr-only">Ver documento</span>
      //         </Button>
      //       </div>
      //     ) : (
      //       <span>-</span>
      //     );
      //   },
      // },
    ];

    if (showActions) {
      baseColumns.push({
        id: 'actions',
        header: 'Acciones',
        cell: ({ row }) => {
          const isEnCertificacion = row.original.status.toLocaleLowerCase() === 'en_certificacion';
          const isDailyReportOpen = row.original.dailyReportStatus === 'abierto';
          return (
            <div className="flex space-x-2">
              {onEdit && !isEnCertificacion && (
                <PermissionGuard module="comercial" tab="daily_reports" action="update">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Button
                          disabled={isDailyReportOpen}
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(row.original as TableRow)}
                        >
                          <Edit size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isDailyReportOpen ? (
                          <p>El parte esta abierto, debe editarse desde Operaciones</p>
                        ) : (
                          <p>Editar</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </PermissionGuard>
              )}
              {onView && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ServiceDetailModal reportDate={row.original.date} serviceData={row.original} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Ver detalles</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {onViewHistory && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HistoryModal onlyIcon dailyReportRowId={row.original.id} />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Ver historial</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {isEnCertificacion && (
                <PermissionGuard module="comercial" tab="daily_reports" action="update">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedRowId(row.original.id);
                            setSelectedCustomerName(row.original.customer!);
                            setRemitModalOpen(true);
                          }}
                        >
                          <FileText size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Gestionar Remitos</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </PermissionGuard>
              )}
            </div>
          );
        },
      });
    }

    return baseColumns;
  }, [onEdit, onView, onViewHistory, showActions, filterableColumns, canEdit]);

  // Función para determinar si una fila fue creada post-cierre
  const isCreatedPostClose = useCallback((row: TableRow) => {
    if (!row.created_at || !row.date) return false;

    // Parsear la fecha del parte (formato DD-MM-YYYY) con moment
    const reportDate = moment(row.date, 'DD-MM-YYYY').endOf('day');

    // Parsear created_at con moment
    const createdAt = moment(row.created_at);

    // Si created_at es posterior a la fecha del parte, fue creado post-cierre
    return createdAt.isAfter(reportDate);
  }, []);
  return (
    <>
      <div className="space-y-4">
        {dailyReports && dailyReports.length > 0 ? (
          <BaseDataTable
            columns={columns}
            data={dailyReports}
            savedVisibility={{}}
            tableId="enhanced-comercial-report-table"
            className="w-full"
            row_classname={(row) => {
              if (isCreatedPostClose(row)) return 'bg-yellow-100 dark:bg-yellow-900/30';
              if (row.last_comercial_edit_at) return 'bg-blue-100 dark:bg-blue-900/30';
              return '';
            }}
            enableRowSelection={
              canEdit
                ? (row) => {
                    // Solo permitir seleccionar filas con estado "ejecutado"
                    return row.original.status?.toLowerCase() === 'ejecutado';
                  }
                : false
            }
            onRowSelectionChange={(rows) => {
              setSelectedRows(rows);
            }}
            toolbarOptions={{
              filterableColumns: filterableColumns?.map((column) => ({
                ...column,
                type: column.type === 'date-range' ? ('date-range' as const) : undefined,
              })),
              searchableColumns: [{ columnId: 'description', placeholder: 'Buscar en descripción...' }],
              initialVisibleFilters: ['customer', 'services', 'item'],
              showFilterOptions: true,
              showViewOptions: true,
              bulkAction:
                canEdit && selectedRows.length > 0
                  ? {
                      enabled: true,
                      label: 'Enviar a certificación',
                      icon: <CheckCircle2 className="h-4 w-4" />,
                      onClick: (rows) => {
                        setSelectedRows(rows);
                        setIsBulkCertificacionModalOpen(true);
                      },
                    }
                  : undefined,
            }}
          />
        ) : (
          <p>No hay registros</p>
        )}
      </div>

      {/* Modal de gestión de remitos */}
      {selectedRowId && (
        <RemitosManagerModal
          dailyReportRowId={selectedRowId}
          customerName={selectedCustomerName}
          isOpen={remitModalOpen}
          onClose={() => {
            setRemitModalOpen(false);
            setSelectedRowId(null);
            setSelectedCustomerName('');
          }}
        />
      )}

      {/* Modal de actualización masiva a certificación */}
      <BulkCertificacionModal
        isOpen={isBulkCertificacionModalOpen}
        onClose={() => {
          setIsBulkCertificacionModalOpen(false);
          setSelectedRows([]);
        }}
        selectedRows={selectedRows}
        onSuccess={() => {
          // Refrescar los datos de la tabla
          if (refetchDailyReports) {
            refetchDailyReports();
          }
          // Limpiar selección
          setSelectedRows([]);
        }}
      />
    </>
  );
};

export default EnhancedComercialReportTable;
