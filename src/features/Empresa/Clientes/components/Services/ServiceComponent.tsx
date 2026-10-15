'use client';

import type { AreaRow } from '../../actions/areas.server';
import type { MeasureUnitRow } from '../../actions/measure-units.server';
import type { SectorRow } from '../../actions/sectors.server';
import type { CustomerServiceRow } from '../../actions/services.server';
import type { CustomerRef } from '../../lib/serializers';
import ServiceTable from './ServiceTable';

interface ServiceComponentProps {
  customers: CustomerRef[];
  areas: AreaRow[];
  sectors: SectorRow[];
  measureUnits: MeasureUnitRow[];
  services: CustomerServiceRow[];
}

/** Pestaña "Contratos" de Comercial: todos los contratos de la empresa con alta. */
export default function ServiceComponent({ customers, areas, sectors, measureUnits, services }: ServiceComponentProps) {
  return (
    <ServiceTable
      services={services}
      customers={customers}
      areas={areas}
      sectors={sectors}
      measureUnits={measureUnits}
      showCreateButton
      showCustomerColumn
    />
  );
}
