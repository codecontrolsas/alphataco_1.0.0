/**
 * Resultado discriminado de las server actions de export.
 *
 * Next enmascara el mensaje de un error lanzado desde una server action en producción: el usuario vería
 * un genérico en vez de "acote la exportación con filtros". Por eso la action DEVUELVE `{ ok: false, message }`
 * y el cliente lo convierte en un `Error` con `unwrapExportResult`, para que el handler del DataTable muestre el mensaje.
 */
export type ExportResult<T> = { ok: true; data: T } | { ok: false; message: string };

/** Para usar en el CLIENTE (`exportConfig.fetchAllData`): devuelve los datos o lanza con el mensaje de la action. */
export function unwrapExportResult<T>(result: ExportResult<T>): T {
  if (!result.ok) throw new Error(result.message);
  return result.data;
}
