/** Servicios activos y vigentes (sin vencer) de un cliente: los que se pueden elegir en una línea. */
export function activeValidServices<S extends { is_active: boolean | null; service_validity: Date | string | null }>(
  services: S[] | undefined
): S[] {
  if (!services?.length) return [];
  return services.filter(
    (service) => service.is_active && (!service.service_validity || new Date(service.service_validity) >= new Date())
  );
}

/** Ítems activos del servicio elegido entre los servicios de un cliente. */
export function activeServiceItems<I extends { is_active: boolean | null }>(
  services: Array<{ id: string; service_items?: I[] }> | undefined,
  serviceId: string | null | undefined
): I[] {
  if (!serviceId || !services?.length) return [];
  const service = services.find((candidate) => candidate.id === serviceId);
  return service?.service_items?.filter((item) => item.is_active) ?? [];
}
