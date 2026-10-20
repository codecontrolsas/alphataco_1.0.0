'use server';

import { SECTION_COUNT_LOADERS, loadSectionCount } from '../lib/section-count-loaders';
import type { SectionCountsByTab } from '../types/section-counts';

/**
 * Contadores de los sub-items de UN módulo del sidebar (bajo demanda: solo el módulo desplegado).
 * Una sección sin permiso de `view` o que no se pudo calcular vuelve `null`: la UI no dibuja badge,
 * nunca un 0 inventado.
 */
export async function getModuleSectionCounts(moduleSlug: string): Promise<SectionCountsByTab> {
  const loaders = Object.hasOwn(SECTION_COUNT_LOADERS, moduleSlug) ? SECTION_COUNT_LOADERS[moduleSlug] : undefined;
  if (!loaders) return {};

  const entries = await Promise.all(
    Object.keys(loaders).map(
      async (tabSlug): Promise<[string, number | null]> => [tabSlug, await loadSectionCount(moduleSlug, tabSlug)]
    )
  );

  return Object.fromEntries(entries);
}
