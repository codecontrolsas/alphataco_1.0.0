/**
 * Traduce el id que trae el formulario al id de la PIVOTE que espera la base.
 *
 * El parte diario y el preparte no apuntan al sector ni al área del cliente: apuntan a
 * `service_sectors.id` y `service_areas.id`, las pivotes contrato↔sector y contrato↔área. Pero
 * el valor que llega del formulario puede ser cualquiera de los dos, por datos heredados y por
 * selectores que en algún momento ofrecieron el id equivocado.
 *
 * Esta traducción estaba escrita tres veces. Acá se unifican las DOS de cliente
 * (`LocationSection` y `PreparteManager`), que resuelven en memoria sobre el cliente ya
 * cargado.
 *
 * La tercera, `buildSectorMap`/`buildAreaMap` en `lib/preparte-references.ts`, NO se unifica
 * a propósito: arma un mapa bulk con una sola consulta para muchos prepartes a la vez, y
 * forzarla a este molde la volvería N consultas. Implementa la MISMA regla y la misma
 * precedencia (primero el contrato elegido, después cualquiera). Si una cambia, la otra
 * también tiene que cambiar.
 *
 * (Antes existía un tercer caso: que el valor fuera un `sector_customer.id`. Esa pivote se
 * eliminó cuando los sectores pasaron a colgar del cliente, así que ese camino ya no existe.)
 */

type PivotLike = { id: string };

type ServiceLike<P extends PivotLike> = {
  id: string;
  pivots: P[] | null | undefined;
};

/**
 * @param value id que trae el formulario (de la pivote o de la entidad de origen)
 * @param services contratos del cliente, cada uno con sus pivotes
 * @param sourceId cómo leer el id de la entidad de origen desde la pivote
 * @param preferredServiceId contrato elegido; se busca ahí primero y después en todos
 * @returns el id de la pivote, o `null` si no se pudo resolver
 */
function resolvePivotId<P extends PivotLike>(
  value: string | null | undefined,
  services: ServiceLike<P>[] | null | undefined,
  sourceId: (pivot: P) => string | null | undefined,
  preferredServiceId?: string | null
): string | null {
  if (!value || !services?.length) return null;

  // El contrato elegido primero: si el mismo sector está en dos contratos del cliente, la
  // pivote correcta es la de ESTE contrato, no la primera que aparezca.
  const ordered = preferredServiceId
    ? [...services].sort((a, b) => Number(b.id === preferredServiceId) - Number(a.id === preferredServiceId))
    : services;

  const pivots = ordered.flatMap((service) => service.pivots ?? []);

  // Ya es el id de la pivote: no hay nada que traducir.
  if (pivots.some((pivot) => pivot.id === value)) return value;

  // Es el id de la entidad de origen (sector o área): se traduce.
  return pivots.find((pivot) => sourceId(pivot) === value)?.id ?? null;
}

type ServiceSectorLike = { id: string; sectors?: { id: string } | null };
type ServiceAreaLike = { id: string; areas_cliente?: { id: string } | null };

export function resolveServiceSectorId(
  value: string | null | undefined,
  services: { id: string; service_sectors?: ServiceSectorLike[] | null }[] | null | undefined,
  preferredServiceId?: string | null
): string | null {
  return resolvePivotId(
    value,
    services?.map((s) => ({ id: s.id, pivots: s.service_sectors })),
    (pivot) => pivot.sectors?.id,
    preferredServiceId
  );
}

export function resolveServiceAreaId(
  value: string | null | undefined,
  services: { id: string; service_areas?: ServiceAreaLike[] | null }[] | null | undefined,
  preferredServiceId?: string | null
): string | null {
  return resolvePivotId(
    value,
    services?.map((s) => ({ id: s.id, pivots: s.service_areas })),
    (pivot) => pivot.areas_cliente?.id,
    preferredServiceId
  );
}
