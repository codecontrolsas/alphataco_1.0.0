import { useMemo } from 'react';
import { activeServiceItems, activeValidServices } from '../../../../../lib/customer-services';
import type { CustomerForForm } from '../../../form-data.server';

export interface NamedOption {
  id: string;
  name: string;
  description: string;
}

/** Quita repetidos por id conservando el orden. */
function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** Opciones en cascada del formulario: cliente → servicio → ítem, más sectores, áreas y equipos del cliente. */
export function useCustomerServiceOptions(
  customers: CustomerForForm[],
  selectedCustomerId: string | undefined,
  selectedServiceId: string | undefined
) {
  const activeCustomers = useMemo(() => customers.filter((c) => c.is_active), [customers]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  // Servicios activos y vigentes del cliente elegido
  const customerServices = useMemo(() => activeValidServices(selectedCustomer?.customer_services), [selectedCustomer]);

  // Ítems activos del servicio elegido
  const serviceItems = useMemo(
    () => activeServiceItems(selectedCustomer?.customer_services, selectedServiceId),
    [selectedCustomer, selectedServiceId]
  );

  const customerSectors = useMemo<NamedOption[]>(() => {
    if (!selectedServiceId || !selectedCustomer?.customer_services?.length) return [];
    const serviceSectors = selectedCustomer.customer_services
      .flatMap((svc) => svc.service_sectors ?? [])
      .filter((s) => s.sectors && s.service_id === selectedServiceId);

    return uniqueById(serviceSectors).map((s) => ({
      id: s.id,
      name: s.sectors?.name ?? '',
      description: s.sectors?.descripcion_corta ?? '',
    }));
  }, [selectedCustomer, selectedServiceId]);

  const customerAreas = useMemo<NamedOption[]>(() => {
    if (!selectedServiceId || !selectedCustomer?.customer_services?.length) return [];
    const serviceAreas = selectedCustomer.customer_services
      .flatMap((svc) => svc.service_areas ?? [])
      .filter((a) => a.areas_cliente && a.service_id === selectedServiceId);

    return uniqueById(serviceAreas).map((a) => ({
      id: a.id,
      name: a.areas_cliente?.nombre ?? '',
      description: a.areas_cliente?.descripcion_corta ?? '',
    }));
  }, [selectedCustomer, selectedServiceId]);

  const customerEquipment = useMemo(() => selectedCustomer?.equipos_clientes ?? [], [selectedCustomer]);

  return {
    activeCustomers,
    selectedCustomer,
    customerServices,
    serviceItems,
    customerSectors,
    customerAreas,
    customerEquipment,
  };
}
