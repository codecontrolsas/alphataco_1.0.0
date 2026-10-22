import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';

/**
 * Para el `mutationFn` de `useMutation`: devuelve el dato o LANZA en el cliente con el mensaje
 * de la action. Asi `onError` muestra el toast y `onSuccess` solo corre ante un exito real.
 *
 * Lanzar del lado del cliente conserva el mensaje (el que se pierde en produccion es el lanzado
 * desde el servidor). Es el puente que evita el toast de exito sobre una operacion fallida.
 */
export function unwrapAction<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
