/** Altas y bajas explícitas de una relación M:M. La ausencia de un id nunca implica baja. */
export interface IdDelta {
  add: string[];
  remove: string[];
}

/**
 * Calcula el delta de una relación M:M entre lo que cargó la ficha (baseline) y lo que hay en el
 * formulario. Si el usuario no tocó nada, ambas listas quedan vacías.
 */
export function diffIds(
  baseline: readonly (string | undefined)[] | undefined,
  current: readonly (string | undefined)[] | undefined
): IdDelta {
  const before = new Set((baseline ?? []).filter((id): id is string => Boolean(id)));
  const after = new Set((current ?? []).filter((id): id is string => Boolean(id)));
  return {
    add: [...after].filter((id) => !before.has(id)),
    remove: [...before].filter((id) => !after.has(id)),
  };
}
