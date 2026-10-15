/** Altas y bajas explícitas de una relación M:M. */
export interface IdDelta {
  add: string[];
  remove: string[];
}

/**
 * Delta entre la base leída al abrir el formulario (`baseline`) y la selección final (`next`).
 * Es lo que viaja al servidor: nunca el conjunto final para que él borre "lo que no vino".
 */
export function computeIdDelta(baseline: readonly string[], next: readonly string[]): IdDelta {
  const before = new Set(baseline);
  const after = new Set(next);
  return {
    add: Array.from(after).filter((id) => !before.has(id)),
    remove: Array.from(before).filter((id) => !after.has(id)),
  };
}
