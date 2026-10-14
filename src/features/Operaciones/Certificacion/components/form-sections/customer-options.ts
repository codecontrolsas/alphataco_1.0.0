import type { CustomerForRowForm } from '@/features/Operaciones/PartesDiarios/actions/comercial-rows.server';

export type CustomerNamedOption = { id: string; name: string };

/** Sectores del cliente para el servicio elegido (el id es el del vínculo servicio-sector). */
export function getCustomerSectors(
  customer: CustomerForRowForm | null,
  serviceId: string | null
): CustomerNamedOption[] {
  return (customer?.customer_services ?? [])
    .flatMap((service) => service.service_sectors ?? [])
    .filter((sector) => sector.sectors && sector.service_id === serviceId)
    .map((sector) => ({ id: sector.id, name: sector.sectors?.name || '' }));
}

/** Áreas del cliente para el servicio elegido (el id es el del vínculo servicio-área). */
export function getCustomerAreas(customer: CustomerForRowForm | null, serviceId: string | null): CustomerNamedOption[] {
  return (customer?.customer_services ?? [])
    .flatMap((service) => service.service_areas ?? [])
    .filter((area) => area.areas_cliente && area.service_id === serviceId)
    .map((area) => ({ id: area.id, name: area.areas_cliente?.nombre || '' }));
}
