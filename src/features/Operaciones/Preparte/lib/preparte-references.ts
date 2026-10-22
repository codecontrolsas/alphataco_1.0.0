import { prisma } from '@/shared/lib/prisma';
import { preparteCompanyScope } from './preparte-scope';

/** `''` en una FK uuid es un 400 de Postgres: se normaliza a `null`. */
export function toUuidOrNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

// ============================================================================
// VALIDACIÓN DE PERÍMETRO
// ============================================================================

/**
 * Verifica que cliente, contrato, item y equipo del cliente pertenezcan a la empresa
 * activa antes de escribirlos en un pedido. Sin RLS es la única defensa: cualquier
 * uuid que llegue del cliente sería aceptado por la FK.
 */
export async function assertPreparteReferences(
  companyId: string,
  refs: {
    customerIds: string[];
    serviceIds: string[];
    /** Pares cliente/contrato: el contrato tiene que ser del cliente indicado. */
    servicePairs?: { serviceId: string; customerId: string }[];
    itemIds: string[];
    customerEquipmentIds: string[];
  }
): Promise<void> {
  const customerIds = [...new Set(refs.customerIds.filter(Boolean))];
  const serviceIds = [
    ...new Set([...refs.serviceIds, ...(refs.servicePairs ?? []).map((p) => p.serviceId)].filter(Boolean)),
  ];
  const itemIds = [...new Set(refs.itemIds.filter(Boolean))];
  const customerEquipmentIds = [...new Set(refs.customerEquipmentIds.filter(Boolean))];

  const [customers, services, items, equipment] = await Promise.all([
    customerIds.length
      ? prisma.customers.findMany({ where: { id: { in: customerIds }, company_id: companyId }, select: { id: true } })
      : Promise.resolve([]),
    serviceIds.length
      ? prisma.customer_services.findMany({
          where: { id: { in: serviceIds }, customers: { company_id: companyId } },
          select: { id: true, customer_id: true },
        })
      : Promise.resolve([]),
    itemIds.length
      ? prisma.service_items.findMany({
          where: { id: { in: itemIds }, customer_services: { customers: { company_id: companyId } } },
          select: { id: true },
        })
      : Promise.resolve([]),
    customerEquipmentIds.length
      ? prisma.equipos_clientes.findMany({
          where: { id: { in: customerEquipmentIds }, customers: { company_id: companyId } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  if (
    customers.length !== customerIds.length ||
    services.length !== serviceIds.length ||
    items.length !== itemIds.length ||
    equipment.length !== customerEquipmentIds.length
  ) {
    throw new Error('Alguno de los datos del pedido no pertenece a la empresa activa.');
  }

  // El contrato tiene que ser del cliente del pedido (si no, se mezclan cliente A con contrato de B).
  const customerByService = new Map(services.map((service) => [service.id, service.customer_id]));
  for (const pair of refs.servicePairs ?? []) {
    if (pair.serviceId && pair.customerId && customerByService.get(pair.serviceId) !== pair.customerId) {
      throw new Error('El contrato seleccionado no pertenece al cliente del pedido.');
    }
  }
}

/** Lanza si el pedido no es de la empresa activa. Devuelve la fila leída. */
export async function requirePreparteInCompany(id: string, companyId: string) {
  const row = await prisma.preparte.findFirst({
    where: { id, ...preparteCompanyScope(companyId) },
  });
  if (!row) {
    throw new Error('El pedido no existe o no pertenece a la empresa activa.');
  }
  return row;
}

// ============================================================================
// NORMALIZACIÓN DE SECTOR / ÁREA
// ============================================================================

/**
 * El formulario puede mandar el `service_sectors.id` o el `sectors.id`; en la tabla se
 * guarda SIEMPRE el `service_sectors.id` del contrato. Devuelve el mapa de traducción.
 *
 * Misma regla que `lib/service-relation-id` (el equivalente de cliente), con la misma
 * precedencia: primero la clave `service:sector` del contrato elegido, después la global.
 * Acá no se reusa ese helper porque esto resuelve en bulk con UNA consulta para muchos
 * prepartes; pasarlo por el helper sería una consulta por preparte. **Si cambia una de las
 * dos, la otra también.**
 */
export async function buildSectorMap(serviceIds: string[], sectorValues: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!serviceIds.length || !sectorValues.length) return map;

  const rows = await prisma.service_sectors.findMany({
    where: { service_id: { in: serviceIds } },
    select: { id: true, sector_id: true, service_id: true },
  });

  for (const row of rows) {
    // Claves siempre acotadas al contrato: un sector de otro contrato no se resuelve.
    map.set(`${row.service_id}:${row.sector_id}`, row.id);
    map.set(`${row.service_id}:${row.id}`, row.id);
  }
  return map;
}

/** Equivalente de `buildSectorMap` para áreas (`service_areas.id` ← `areas_cliente.id`). */
export async function buildAreaMap(serviceIds: string[], areaValues: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!serviceIds.length || !areaValues.length) return map;

  const rows = await prisma.service_areas.findMany({
    where: { service_id: { in: serviceIds } },
    select: { id: true, area_id: true, service_id: true },
  });

  for (const row of rows) {
    map.set(`${row.service_id}:${row.area_id}`, row.id);
    map.set(`${row.service_id}:${row.id}`, row.id);
  }
  return map;
}

/** Traduce un único sector/área del formulario al id de la pivote del contrato (`null` si viene vacío). */
export async function resolveSingleRelationId(
  value: string | null | undefined,
  serviceId: string,
  buildMap: (serviceIds: string[], values: string[]) => Promise<Map<string, string>>,
  label: 'sector' | 'área'
): Promise<string | null> {
  const raw = toUuidOrNull(value);
  if (!raw) return null;
  const map = await buildMap([serviceId], [raw]);
  return requireRelationId(map, serviceId, raw, label);
}

/** Id de la pivote del contrato para `raw`; si no pertenece al contrato, lanza (nunca guarda el uuid crudo). */
export function requireRelationId(
  map: Map<string, string>,
  serviceId: string,
  raw: string,
  label: 'sector' | 'área'
): string {
  const resolved = map.get(`${serviceId}:${raw}`);
  if (!resolved) {
    throw new Error(`El ${label} seleccionado no pertenece al contrato del pedido.`);
  }
  return resolved;
}
