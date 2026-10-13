'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { createFilterOptions } from '@/features/Employees/Empleados/components/utils/utils';
import { PermissionGuard } from '@/features/Permissions';
import { BaseDataTable } from '@/shared/components/data-table/base/data-table';
import { DataTableColumnHeader } from '@/shared/components/data-table/base/data-table-column-header';
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import moment from 'moment';
import { useMemo, useState } from 'react';
import type { AreaRow } from '../../actions/areas.server';
import type { MeasureUnitRow } from '../../actions/measure-units.server';
import type { SectorRow } from '../../actions/sectors.server';
import type { CustomerServiceRow } from '../../actions/services.server';
import type { CustomerRef } from '../../lib/serializers';
import { dbDateToLocal } from '../../lib/service-dates';
import ServiceItemsTable from './ServiceItemsTable';
import ServicesForm from './ServicesForm';
import ContractDocuments from './contractDocuments';

interface ServiceTableProps {
  services: CustomerServiceRow[];
  customers: CustomerRef[];
  areas: AreaRow[];
  sectors: SectorRow[];
  measureUnits: MeasureUnitRow[];
  /** Muestra el botón "Crear Contrato" (la pestaña Contratos de Comercial). */
  showCreateButton?: boolean;
  savedFilters: string[];
  savedVisibility: VisibilityState;
  savedItemsFilters: string[];
  savedItemsVisibility: VisibilityState;
}

function includesValue(value: unknown, filter: unknown): boolean {
  return Array.isArray(filter) && filter.includes(value);
}

function formatDate(value: Date | null): string {
  return value ? moment(dbDateToLocal(value)).format('DD/MM/YYYY') : '-';
}

function getServiceColumns(): ColumnDef<CustomerServiceRow>[] {
  return [
    {
      accessorKey: 'service_name',
      id: 'Nombre',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre del Servicio" />,
      filterFn: (row, id, value) => includesValue(row.getValue(id), value),
    },
    {
      id: 'Cliente',
      accessorFn: (row) => row.customers?.name ?? '-',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
      filterFn: (row, id, value) => includesValue(row.getValue(id), value),
    },
    {
      accessorKey: 'contract_number',
      id: 'Contrato',
      header: ({ column }) => <DataTableColumnHeader column={column} title="N° Contrato" />,
      filterFn: (row, id, value) => includesValue(row.getValue(id), value),
    },
    {
      id: 'Areas',
      accessorFn: (row) => row.service_areas.map((a) => a.areas_cliente.nombre),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Areas" />,
      cell: ({ row }) => {
        const names = row.original.service_areas.map((a) => a.areas_cliente.nombre);
        if (names.length === 0) return '-';
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="truncate cursor-pointer">
                  <Badge>
                    {names[0]}
                    {names.length > 1 && ` +${names.length - 1}`}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex flex-col">
                  {names.map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      filterFn: (row, id, value) => {
        const names = row.getValue<string[]>(id);
        return Array.isArray(value) && value.some((v) => names.includes(v));
      },
    },
    {
      id: 'Sectores',
      accessorFn: (row) => row.service_sectors.map((s) => s.sectors.name),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sectores" />,
      cell: ({ row }) => {
        const names = row.original.service_sectors.map((s) => s.sectors.name);
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="truncate cursor-pointer">
                  <Badge>
                    {names.length > 0 ? (
                      <>
                        {names[0]}
                        {names.length > 1 && ` +${names.length - 1}`}
                      </>
                    ) : (
                      '-'
                    )}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex flex-col">
                  {names.map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      filterFn: (row, id, value) => {
        const names = row.getValue<string[]>(id);
        return Array.isArray(value) && value.some((v) => names.includes(v));
      },
    },
    {
      id: 'Estado',
      accessorFn: (row) => (row.is_active ? 'true' : 'false'),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
      cell: ({ row }) => {
        const isActive = row.original.is_active;
        return <Badge variant={isActive ? 'success' : 'destructive'}>{isActive ? 'Activo' : 'Inactivo'}</Badge>;
      },
      filterFn: (row, id, value) => includesValue(row.getValue(id), value),
    },
    {
      accessorKey: 'service_start',
      id: 'Inicio',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha Inicio" />,
      cell: ({ row }) => formatDate(row.original.service_start),
    },
    {
      accessorKey: 'service_validity',
      id: 'Vencimiento',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha Vencimiento" />,
      cell: ({ row }) => formatDate(row.original.service_validity),
    },
  ];
}

const STATUS_FILTER = [
  { value: 'true', label: 'Activo' },
  { value: 'false', label: 'Inactivo' },
];

/** Listado de contratos con alta en diálogo y detalle en pestañas (detalle / documentos / items). */
export default function ServiceTable({
  services,
  customers,
  areas,
  sectors,
  measureUnits,
  showCreateButton = false,
  savedFilters,
  savedVisibility,
  savedItemsFilters,
  savedItemsVisibility,
}: ServiceTableProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<CustomerServiceRow | null>(null);

  const columns = useMemo(() => getServiceColumns(), []);

  const filterOptions = useMemo(
    () => ({
      names: createFilterOptions(services, (service) => service.service_name),
      customers: createFilterOptions(services, (service) => service.customers?.name),
      contractNumbers: createFilterOptions(services, (service) => service.contract_number),
      sectors: createFilterOptions(
        services.flatMap((service) => service.service_sectors.map((s) => s.sectors.name)),
        (name) => name
      ),
      areas: createFilterOptions(
        services.flatMap((service) => service.service_areas.map((a) => a.areas_cliente.nombre)),
        (name) => name
      ),
    }),
    [services]
  );

  return (
    <div>
      <PermissionGuard module="comercial" tab="service" action="create">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          {showCreateButton && (
            <DialogTrigger asChild>
              <Button size="sm" variant="brand" className="mb-4">
                Crear Contrato
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-4xl">
            <DialogTitle>Crear Contrato</DialogTitle>
            <ServicesForm customers={customers} areas={areas} sectors={sectors} setOpen={setCreateOpen} />
          </DialogContent>
        </Dialog>
      </PermissionGuard>

      {selectedService ? (
        <Tabs defaultValue="detail" key={selectedService.id}>
          <div className="flex justify-between items-center mr-3">
            <TabsList className="flex gap-1 bg-surface-muted/50">
              {/* Hereda permisos de comercial/service/detalle-contrato */}
              <PermissionGuard module="comercial" tab="detalle-contrato" action="view">
                <TabsTrigger value="detail" className="text-brand-ink font-semibold">
                  Detalle
                </TabsTrigger>
              </PermissionGuard>
              {/* Hereda permisos de comercial/service/documentos-contrato */}
              <PermissionGuard module="comercial" tab="documentos-contrato" action="view">
                <TabsTrigger value="documents" className="text-brand-ink font-semibold">
                  Documentos
                </TabsTrigger>
              </PermissionGuard>
              {/* Hereda permisos de comercial/service/items-contrato */}
              <PermissionGuard module="comercial" tab="items-contrato" action="view">
                <TabsTrigger value="items" className="text-brand-ink font-semibold">
                  Items del Servicio
                </TabsTrigger>
              </PermissionGuard>
            </TabsList>
            <Button onClick={() => setSelectedService(null)}>Cerrar</Button>
          </div>
          <PermissionGuard module="comercial" tab="detalle-contrato" action="view">
            <TabsContent value="detail">
              <ServicesForm
                editingService={selectedService}
                startReadOnly
                customers={customers}
                areas={areas}
                sectors={sectors}
              />
            </TabsContent>
          </PermissionGuard>
          <PermissionGuard module="comercial" tab="documentos-contrato" action="view">
            <TabsContent value="documents">
              <ContractDocuments id={selectedService.id} />
            </TabsContent>
          </PermissionGuard>
          <PermissionGuard module="comercial" tab="items-contrato" action="view">
            <TabsContent value="items">
              <ServiceItemsTable
                customerServiceId={selectedService.id}
                measureUnits={measureUnits}
                savedFilters={savedItemsFilters}
                savedVisibility={savedItemsVisibility}
              />
            </TabsContent>
          </PermissionGuard>
        </Tabs>
      ) : (
        <div className="w-full overflow-x-auto mt-4">
          <BaseDataTable
            columns={columns}
            data={services}
            tableId="services-table"
            savedVisibility={savedVisibility}
            onRowClick={setSelectedService}
            toolbarOptions={{
              initialVisibleFilters: savedFilters,
              filterableColumns: [
                { columnId: 'Nombre', title: 'Nombre del Servicio', options: filterOptions.names },
                { columnId: 'Cliente', title: 'Cliente', options: filterOptions.customers },
                { columnId: 'Contrato', title: 'Número de Contrato', options: filterOptions.contractNumbers },
                { columnId: 'Estado', title: 'Estado', options: STATUS_FILTER },
                { columnId: 'Sectores', title: 'Sectores', options: filterOptions.sectors },
                { columnId: 'Areas', title: 'Areas', options: filterOptions.areas },
              ],
            }}
          />
        </div>
      )}
    </div>
  );
}
