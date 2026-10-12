'use client';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/features/Permissions';
import type { VisibilityState } from '@tanstack/react-table';
import Link from 'next/link';
import type { AreaRow } from '../../actions/areas.server';
import type { MeasureUnitRow } from '../../actions/measure-units.server';
import type { SectorRow } from '../../actions/sectors.server';
import type { CustomerServiceRow } from '../../actions/services.server';
import type { CustomerRow } from '../../lib/serializers';
import type { ProvinceOption } from '../area_clientes/AreaFormDialog';
import { CustomerAreasTab } from './CustomerAreasTab';
import { CustomerContractsTab } from './CustomerContractsTab';
import { CustomerSectorsTab } from './CustomerSectorsTab';
import { CustomerDetailTab } from './CustomerDetailTab';
import { CustomerEmployeesTab } from './CustomerEmployeesTab';
import { CustomerEquipmentTab } from './CustomerEquipmentTab';
import { CustomerOwnEquipmentTab } from './CustomerOwnEquipmentTab';

export interface CustomerDetailPreferences {
  employeesVisibility: VisibilityState;
  equipmentVisibility: VisibilityState;
  equipmentFilters: string[];
  servicesFilters: string[];
  servicesVisibility: VisibilityState;
  serviceItemsFilters: string[];
  serviceItemsVisibility: VisibilityState;
  areasFilters: string[];
}

interface CustomerDetailProps {
  customer: CustomerRow;
  services: CustomerServiceRow[];
  areas: AreaRow[];
  sectors: SectorRow[];
  measureUnits: MeasureUnitRow[];
  provinces: ProvinceOption[];
  preferences: CustomerDetailPreferences;
  onClose: () => void;
}

/**
 * Ficha del cliente: Detalle / Empleados / Equipos afectados / Equipos del cliente / Áreas /
 * Sectores / Contratos.
 *
 * Áreas y sectores llegaron acá desde pantallas sueltas del módulo (tsk-745): son datos de un
 * cliente, y administrarlos afuera obligaba a elegir el cliente en cada alta.
 */
export function CustomerDetail({
  customer,
  services,
  areas,
  sectors,
  measureUnits,
  provinces,
  preferences,
  onClose,
}: CustomerDetailProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Detalles del Cliente {customer.name}</h2>
        <div className="flex items-center gap-2">
          <PermissionGuard module="tesoreria" tab="cobranzas" action="view">
            <Button asChild variant="outline">
              <Link href={`/dashboard/treasury/customers/${customer.id}`}>Cuenta corriente</Link>
            </Button>
          </PermissionGuard>
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="detalle">
        <TabsList>
          <TabsTrigger value="detalle">Detalle</TabsTrigger>
          <TabsTrigger value="empleados">Empleados</TabsTrigger>
          <TabsTrigger value="equipos">Equipos afectados</TabsTrigger>
          <PermissionGuard module="comercial" tab="equipos-cliente" action="view">
            <TabsTrigger value="equipos-cliente">Equipos del cliente</TabsTrigger>
          </PermissionGuard>
          <PermissionGuard module="comercial" tab="areas-cliente" action="view">
            <TabsTrigger value="areas">Áreas</TabsTrigger>
          </PermissionGuard>
          <PermissionGuard module="comercial" tab="sectores-cliente" action="view">
            <TabsTrigger value="sectores">Sectores</TabsTrigger>
          </PermissionGuard>
          {/* Hereda permisos de comercial/service */}
          <PermissionGuard module="comercial" tab="service" action="view">
            <TabsTrigger value="contratos">Contratos</TabsTrigger>
          </PermissionGuard>
        </TabsList>

        <TabsContent value="detalle">
          <CustomerDetailTab customer={customer} />
        </TabsContent>

        <TabsContent value="empleados">
          <CustomerEmployeesTab customer={customer} savedVisibility={preferences.employeesVisibility} />
        </TabsContent>

        <TabsContent value="equipos">
          <CustomerEquipmentTab
            customer={customer}
            savedVisibility={preferences.equipmentVisibility}
            savedFilters={preferences.equipmentFilters}
          />
        </TabsContent>

        <PermissionGuard module="comercial" tab="equipos-cliente" action="view">
          <TabsContent value="equipos-cliente">
            <CustomerOwnEquipmentTab customer={customer} />
          </TabsContent>
        </PermissionGuard>

        <PermissionGuard module="comercial" tab="areas-cliente" action="view">
          <TabsContent value="areas">
            <CustomerAreasTab
              customer={customer}
              areas={areas}
              provinces={provinces}
              savedFilters={preferences.areasFilters}
            />
          </TabsContent>
        </PermissionGuard>

        <PermissionGuard module="comercial" tab="sectores-cliente" action="view">
          <TabsContent value="sectores">
            <CustomerSectorsTab customer={customer} sectors={sectors} />
          </TabsContent>
        </PermissionGuard>

        {/* Hereda permisos de comercial/service */}
        <PermissionGuard module="comercial" tab="service" action="view">
          <TabsContent value="contratos">
            <CustomerContractsTab
              customer={customer}
              services={services}
              areas={areas}
              sectors={sectors}
              measureUnits={measureUnits}
              savedFilters={preferences.servicesFilters}
              savedVisibility={preferences.servicesVisibility}
              savedItemsFilters={preferences.serviceItemsFilters}
              savedItemsVisibility={preferences.serviceItemsVisibility}
            />
          </TabsContent>
        </PermissionGuard>
      </Tabs>
    </div>
  );
}
