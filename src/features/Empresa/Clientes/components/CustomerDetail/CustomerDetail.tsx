'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetricCard } from '@/shared/components/common/MetricCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { getCustomerDetail, getCustomerSummary } from '../../actions/customer-detail.server';
import { customerTabKey } from '../../lib/query-keys';
import type { CustomerRow } from '../../lib/serializers';
import { CustomerAreasTab } from './CustomerAreasTab';
import { CustomerContractsTab, type ContractsTabPreferences } from './CustomerContractsTab';
import { CustomerDetailTab } from './CustomerDetailTab';
import { CustomerEmployeesTab } from './CustomerEmployeesTab';
import { CustomerEquipmentTab } from './CustomerEquipmentTab';
import { CustomerOwnEquipmentTab } from './CustomerOwnEquipmentTab';
import { CustomerSectorsTab } from './CustomerSectorsTab';
import { QueryErrorState } from './QueryErrorState';

export type CustomerDetailPreferences = ContractsTabPreferences;

type CustomerTabValue = 'detalle' | 'empleados' | 'equipos' | 'equipos-cliente' | 'areas' | 'sectores' | 'contratos';

interface CustomerDetailProps {
  customerId: string;
  /** Cliente ya leído por el servidor (la página de la ficha); sin él la ficha lo pide al abrirse. */
  initialCustomer?: CustomerRow;
  /** Permisos del usuario cargados en el servidor (`modulo:tab:accion`). */
  permissionsMap: Record<string, boolean>;
  contractsPreferences: CustomerDetailPreferences;
  /** `documentacion` encendido (calculado en el servidor): si no, empleados y equipos no muestran el estado documental. */
  showDocumentStatus: boolean;
  onClose: () => void;
}

/**
 * Ficha del cliente: Detalle / Empleados / Equipos afectados / Equipos del cliente / Áreas /
 * Sectores / Contratos.
 *
 * Cada pestaña pide SUS datos al abrirse (React Query, `['comercial', 'customer', id, <pestaña>]`): la
 * pantalla ya no carga de entrada todas las áreas, sectores y contratos de la empresa. El encabezado muestra
 * un resumen de conteos (`getCustomerSummary`).
 *
 * Áreas y sectores llegaron acá desde pantallas sueltas del módulo (tsk-745): son datos de un
 * cliente, y administrarlos afuera obligaba a elegir el cliente en cada alta.
 */
export function CustomerDetail({
  customerId,
  initialCustomer,
  permissionsMap,
  contractsPreferences,
  showDocumentStatus,
  onClose,
}: CustomerDetailProps) {
  const can = (tab: string, action: 'view' | 'create' | 'update') =>
    permissionsMap[`comercial:${tab}:${action}`] === true;

  const detailQuery = useQuery({
    queryKey: customerTabKey(customerId, 'detail'),
    queryFn: () => getCustomerDetail(customerId),
    initialData: initialCustomer,
    staleTime: 60 * 1000,
  });
  const summaryQuery = useQuery({
    queryKey: customerTabKey(customerId, 'summary'),
    queryFn: () => getCustomerSummary(customerId),
    staleTime: 60 * 1000,
  });

  // Primera pestaña visible: si no ve "Detalle", abre en la primera a la que sí accede.
  const firstTab: CustomerTabValue = can('detalle-cliente', 'view')
    ? 'detalle'
    : can('empleados-cliente', 'view')
      ? 'empleados'
      : can('equipos-cliente', 'view')
        ? 'equipos'
        : can('areas-cliente', 'view')
          ? 'areas'
          : can('sectores-cliente', 'view')
            ? 'sectores'
            : can('service', 'view')
              ? 'contratos'
              : 'detalle';
  const [tab, setTab] = useState<CustomerTabValue>(firstTab);

  if (detailQuery.isError) {
    return (
      <div className="space-y-4">
        <QueryErrorState
          title="No se pudo cargar el cliente"
          isRetrying={detailQuery.isFetching}
          onRetry={() => detailQuery.refetch()}
        />
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    );
  }

  if (detailQuery.isPending) {
    return (
      <div className="space-y-6" role="status" aria-label="Cargando cliente">
        <Skeleton className="h-9 w-72" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const customer = detailQuery.data;
  if (!customer) {
    return (
      <StateBlock
        variant="empty"
        title="No se encontró el cliente"
        description="Pudo haberse eliminado o no pertenecer a tu empresa."
        action={
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        }
      />
    );
  }

  const summary = summaryQuery.data;
  const summaryValue = (value: number | undefined) =>
    summaryQuery.isError ? (
      '—'
    ) : value === undefined ? (
      <span role="status" aria-label="Cargando" className="bg-muted inline-block h-7 w-12 animate-pulse rounded" />
    ) : (
      value
    );
  const summaryHint = summaryQuery.isError ? 'No se pudo cargar' : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold">Detalles del Cliente {customer.name}</h2>
        <div className="flex items-center gap-2">
          {permissionsMap['tesoreria:cobranzas:view'] === true ? (
            <Button asChild variant="outline">
              <Link href={`/dashboard/treasury/customers/${customer.id}`}>Cuenta corriente</Link>
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>

      <section aria-label="Resumen del cliente" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Empleados afectados"
          value={summaryValue(summary?.employees)}
          hint={summaryHint}
          onSelect={can('empleados-cliente', 'view') ? () => setTab('empleados') : undefined}
          pressed={tab === 'empleados'}
        />
        <MetricCard
          label="Equipos afectados"
          value={summaryValue(summary?.equipment)}
          hint={summaryHint}
          onSelect={can('equipos-cliente', 'view') ? () => setTab('equipos') : undefined}
          pressed={tab === 'equipos'}
        />
        <MetricCard
          label="Contratos activos"
          value={summaryValue(summary?.activeContracts)}
          hint={summaryHint}
          onSelect={can('service', 'view') ? () => setTab('contratos') : undefined}
          pressed={tab === 'contratos'}
        />
        <MetricCard
          label="Certificaciones sin facturar"
          value={summaryValue(summary?.unbilledCertifications)}
          hint={summaryHint ?? 'Confirmadas, listas para facturar'}
          tone={summary && summary.unbilledCertifications > 0 ? 'warn' : 'default'}
        />
      </section>

      <Tabs value={tab} onValueChange={(value) => setTab(value as CustomerTabValue)}>
        {/* En móvil las pestañas se desplazan en horizontal dentro de su contenedor (sin desbordar la página). */}
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList>
            {can('detalle-cliente', 'view') ? <TabsTrigger value="detalle">Detalle</TabsTrigger> : null}
            {can('empleados-cliente', 'view') ? <TabsTrigger value="empleados">Empleados</TabsTrigger> : null}
            {can('equipos-cliente', 'view') ? <TabsTrigger value="equipos">Equipos afectados</TabsTrigger> : null}
            {can('equipos-cliente', 'view') ? (
              <TabsTrigger value="equipos-cliente">Equipos del cliente</TabsTrigger>
            ) : null}
            {can('areas-cliente', 'view') ? <TabsTrigger value="areas">Áreas</TabsTrigger> : null}
            {can('sectores-cliente', 'view') ? <TabsTrigger value="sectores">Sectores</TabsTrigger> : null}
            {/* Hereda permisos de comercial/service */}
            {can('service', 'view') ? <TabsTrigger value="contratos">Contratos</TabsTrigger> : null}
          </TabsList>
        </div>

        {can('detalle-cliente', 'view') ? (
          <TabsContent value="detalle">
            <CustomerDetailTab customer={customer} canUpdate={can('detalle-cliente', 'update')} />
          </TabsContent>
        ) : null}

        {can('empleados-cliente', 'view') ? (
          <TabsContent value="empleados">
            <CustomerEmployeesTab
              customer={customer}
              canUpdate={can('empleados-cliente', 'update')}
              showDocumentStatus={showDocumentStatus}
            />
          </TabsContent>
        ) : null}

        {can('equipos-cliente', 'view') ? (
          <TabsContent value="equipos">
            <CustomerEquipmentTab
              customer={customer}
              canUpdate={can('equipos-cliente', 'update')}
              showDocumentStatus={showDocumentStatus}
            />
          </TabsContent>
        ) : null}

        {can('equipos-cliente', 'view') ? (
          <TabsContent value="equipos-cliente">
            <CustomerOwnEquipmentTab
              customer={customer}
              canCreate={can('equipos-cliente', 'create')}
              canUpdate={can('equipos-cliente', 'update')}
            />
          </TabsContent>
        ) : null}

        {can('areas-cliente', 'view') ? (
          <TabsContent value="areas">
            <CustomerAreasTab
              customer={customer}
              canCreate={can('areas-cliente', 'create')}
              canUpdate={can('areas-cliente', 'update')}
            />
          </TabsContent>
        ) : null}

        {can('sectores-cliente', 'view') ? (
          <TabsContent value="sectores">
            <CustomerSectorsTab
              customer={customer}
              canCreate={can('sectores-cliente', 'create')}
              canUpdate={can('sectores-cliente', 'update')}
            />
          </TabsContent>
        ) : null}

        {/* Hereda permisos de comercial/service */}
        {can('service', 'view') ? (
          <TabsContent value="contratos">
            <CustomerContractsTab customer={customer} preferences={contractsPreferences} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
