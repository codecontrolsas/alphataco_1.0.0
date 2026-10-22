'use server';

import { updateTag } from 'next/cache';

/**
 * Invalida multiples cache tags de una vez.
 * Llama `updateTag` (invalidacion inmediata) para cada tag.
 *
 * Usar en mutaciones exitosas para garantizar que cualquier usuario
 * vea datos frescos al recargar la pagina.
 */
export async function invalidateCacheTags(tags: readonly string[]) {
  for (const tag of tags) {
    updateTag(tag);
  }
}
