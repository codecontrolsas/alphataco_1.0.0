import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/features/Permissions';
import { useCallback, useState } from 'react';
import type { AreaRow } from '../../actions/areas.server';
import type { MeasureUnitRow } from '../../actions/measure-units.server';
import type { SectorRow } from '../../actions/sectors.server';
import type { CustomerServiceRow } from '../../actions/services.server';
import type { CustomerRef } from '../../lib/serializers';
import ServiceItemsTable from './ServiceItemsTable';
import { ServicesDataTable } from './ServicesDataTable';
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
  /** Muestra la columna Cliente: la lista de toda la empresa la necesita, la ficha de un cliente no. */
  showCustomerColumn?: boolean;
}

/** Listado de contratos con alta en diálogo y detalle en pestañas (detalle / documentos / items). */
export default function ServiceTable({
  services,
  customers,
  areas,
  sectors,
  measureUnits,
  showCreateButton = false,
  showCustomerColumn = false,
}: ServiceTableProps) {
  const [createOpen, setCreateOpen] = useState(false);
  // Se guarda el id y no la fila: al editar el contrato la lista se vuelve a pedir y el detalle ve lo nuevo.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedService = services.find((service) => service.id === selectedId) ?? null;
  const openService = useCallback((service: CustomerServiceRow) => setSelectedId(service.id), []);

  return (
    <div>
      <PermissionGuard module="comercial" tab="service" action="create">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          {showCreateButton && (
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="brand" className="mb-4">
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
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            <Button type="button" onClick={() => setSelectedId(null)}>
              Cerrar
            </Button>
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
              <ServiceItemsTable customerServiceId={selectedService.id} measureUnits={measureUnits} />
            </TabsContent>
          </PermissionGuard>
        </Tabs>
      ) : (
        <div className="mt-4 w-full">
          <ServicesDataTable services={services} showCustomerColumn={showCustomerColumn} onOpen={openService} />
        </div>
      )}
    </div>
  );
}
