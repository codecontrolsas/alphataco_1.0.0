import { Card } from '@/components/ui/card';
import { getAreasWithProvinces } from '@/features/Empresa/Clientes/actions/areas.server';
import { getCustomers } from '@/features/Empresa/Clientes/actions/customers.server';
import { getMeasureUnits } from '@/features/Empresa/Clientes/actions/measure-units.server';
import { getSectors } from '@/features/Empresa/Clientes/actions/sectors.server';
import { getCustomerServices } from '@/features/Empresa/Clientes/actions/services.server';
import ServiceComponent from '@/features/Empresa/Clientes/components/Services/ServiceComponent';

export default async function ServiceComponentWrapper() {
  const [customers, areas, sectors, services, measureUnits] = await Promise.all([
    getCustomers(),
    getAreasWithProvinces(),
    getSectors(),
    getCustomerServices(),
    getMeasureUnits(),
  ]);

  return (
    <Card className="p-6">
      <ServiceComponent
        customers={customers}
        areas={areas}
        sectors={sectors}
        measureUnits={measureUnits}
        services={services}
      />
    </Card>
  );
}
