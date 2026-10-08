import type { clothing_delivery_type } from '@/generated/prisma/enums';

/**
 * Normalización y validación del contenido de una entrega de ropa.
 *
 * El asistente arma las filas en el navegador y manda el array tal cual: acá se decide
 * qué entra a la base. Lógica pura, sin Prisma ni sesión, con test propio.
 */

/** Fila de artículo tal como la manda el asistente. */
export interface RawDeliveryItem {
  clothingItemId: string;
  clothingBrandId?: string | null;
  clothingSizeId?: string | null;
  quantity: number;
  hasCertificate?: boolean;
}

/** Fila lista para el `createMany` de `clothing_delivery_items`. */
export interface NormalizedDeliveryItem {
  clothingItemId: string;
  clothingBrandId: string | null;
  clothingSizeId: string | null;
  quantity: number;
  hasCertificate: boolean;
}

const DELIVERY_TYPES: readonly clothing_delivery_type[] = ['PLANNED_CCT', 'PLANNED_EPP', 'REPLACEMENT'];

/** `true` si el string es uno de los tipos de entrega del enum de la base. */
export function isDeliveryType(value: string): value is clothing_delivery_type {
  return (DELIVERY_TYPES as readonly string[]).includes(value);
}

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Deja sólo las filas utilizables de una entrega:
 * - descarta las que no tienen artículo (el asistente arranca con una fila vacía);
 * - descarta las de cantidad no positiva o no entera;
 * - normaliza marca/talle vacíos a `null` y `hasCertificate` ausente a `false`.
 *
 * **NO deduplica.** `clothing_delivery_items` no tiene ninguna restricción de unicidad
 * sobre artículo + marca + talle, así que dos filas iguales entran como dos filas, igual
 * que antes de esta migración. Fusionarlas obligaría además a decidir qué pasa con
 * `has_certificate`, y cualquier criterio (OR, AND) falsearía el dato: la constancia RG
 * 12-4 es un registro de entrega de elementos de seguridad, y ahí "2 unidades
 * certificadas" tiene que ser exactamente lo que el operario cargó. Si alguna vez se
 * quiere deduplicar, es una decisión de producto y la clave tiene que incluir
 * `hasCertificate`.
 */
export function normalizeDeliveryItems(items: readonly RawDeliveryItem[]): NormalizedDeliveryItem[] {
  const normalized: NormalizedDeliveryItem[] = [];

  for (const item of items) {
    const clothingItemId = normalizeId(item.clothingItemId);
    if (!clothingItemId) continue;
    if (!Number.isInteger(item.quantity) || item.quantity < 1) continue;

    normalized.push({
      clothingItemId,
      clothingBrandId: normalizeId(item.clothingBrandId),
      clothingSizeId: normalizeId(item.clothingSizeId),
      quantity: item.quantity,
      hasCertificate: item.hasCertificate === true,
    });
  }

  return normalized;
}

/** Filas sin marca o sin talle: con stock por combinacion no se pueden entregar (Almacenes etapa 5). */
export function linesWithoutBrandOrSize(items: readonly NormalizedDeliveryItem[]): number[] {
  return items.flatMap((item, index) => (item.clothingBrandId && item.clothingSizeId ? [] : [index]));
}

/**
 * Suma las cantidades por material para la salida de stock: dos filas de la misma combinacion
 * (por ejemplo, una con certificado y otra sin) son una sola linea de stock. Las filas de la
 * entrega NO se fusionan (ver `normalizeDeliveryItems`); solo la salida.
 */
export function groupQuantitiesByMaterial(
  lines: readonly { materialId: string; quantity: number }[]
): { materialId: string; quantity: number }[] {
  const totals = new Map<string, number>();
  for (const line of lines) totals.set(line.materialId, (totals.get(line.materialId) ?? 0) + line.quantity);
  return [...totals].map(([materialId, quantity]) => ({ materialId, quantity }));
}
