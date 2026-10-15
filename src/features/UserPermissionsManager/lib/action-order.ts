import { ACTIONS } from '@/features/Permissions/permissions-map';

const ACTION_ORDER = new Map(Object.keys(ACTIONS).map((slug, position) => [slug, position]));

/** Acciones en el orden del catálogo (Ver, Crear, Editar, Eliminar…), no alfabético. */
export function sortActions<T extends { slug: string }>(actions: readonly T[]): T[] {
  return [...actions].sort(
    (a, b) =>
      (ACTION_ORDER.get(a.slug) ?? Number.MAX_SAFE_INTEGER) - (ACTION_ORDER.get(b.slug) ?? Number.MAX_SAFE_INTEGER)
  );
}
