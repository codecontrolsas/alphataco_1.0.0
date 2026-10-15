import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';

export type ResolvedSearchParams = { [key: string]: string | string[] | undefined };

interface ActiveEntryCandidate {
  value: string;
  moduleSlug?: string;
  tabSlug?: string;
  aliases?: string[];
  visibleWhenAny?: ReadonlyArray<{ moduleSlug: string; tabSlug: string }>;
}

/**
 * Decide qué entradas (secciones o vistas) ve el usuario y cuál está activa.
 *
 * Manda la URL; si el valor no existe o el usuario no puede verlo, cae a la primera visible.
 * Una entrada sin `moduleSlug`/`tabSlug` ni `visibleWhenAny` no tiene permiso que verificar: se muestra siempre.
 * `visibleWhenAny`: visible si alguna de esas claves lo es. `requested` matchea `value` o cualquier `alias`.
 * Misma regla de visibilidad que usa el sidebar (`createTabVisibilityChecker`).
 */
export function resolveActiveEntry<T extends ActiveEntryCandidate>(
  entries: readonly T[],
  permissions: Readonly<Record<string, boolean>>,
  searchParams: ResolvedSearchParams,
  paramName: string,
  defaultValue: string
): { visible: T[]; active: T | undefined } {
  const isTabVisible = createTabVisibilityChecker(permissions);

  const visible = entries.filter((entry) => {
    if (entry.moduleSlug && entry.tabSlug && !isTabVisible(String(entry.moduleSlug), String(entry.tabSlug))) {
      return false;
    }
    if (entry.visibleWhenAny && entry.visibleWhenAny.length > 0) {
      return entry.visibleWhenAny.some((key) => isTabVisible(String(key.moduleSlug), String(key.tabSlug)));
    }
    return true;
  });

  const paramValue = searchParams[paramName];
  const requested = typeof paramValue === 'string' ? paramValue : defaultValue;
  const active = visible.find((entry) => entry.value === requested || entry.aliases?.includes(requested)) ?? visible[0];

  return { visible, active };
}
