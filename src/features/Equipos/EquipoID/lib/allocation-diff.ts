/**
 * Altas y bajas de afectaciones a clientes contra el baseline que vino del servidor con la ficha.
 * El formulario manda sólo este delta explícito: un cliente que no figura en `add` ni en `remove`
 * no se toca nunca (ver `updateVehicle`).
 */
export function diffAllocations(baseline: readonly string[], current: readonly string[]) {
  const before = new Set(baseline);
  const after = new Set(current);
  return {
    add: [...after].filter((id) => !before.has(id)),
    remove: [...before].filter((id) => !after.has(id)),
  };
}
