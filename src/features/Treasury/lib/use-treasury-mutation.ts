'use client';

import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import type { Logger } from '@/lib/logger';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { invalidateTreasury } from './invalidate';

interface UseTreasuryMutationOptions<Values, Result> {
  action: (values: Values) => Promise<ActionResult<Result>>;
  /** Se llama tras invalidar las queries de Tesorería (y refrescar la ruta): avisa y cierra el diálogo. */
  onSuccess: (result: Result, values: Values) => void;
  logger: Logger;
  /** Mensaje del log de error. */
  logError: string;
  /** Aviso si la acción falla y no trae mensaje propio. */
  errorFallback: string;
  /** Si es `false`, no refresca la ruta (la pantalla se actualiza solo con las queries). */
  refreshRoute?: boolean;
  /** Se llama al fallar, antes del aviso (por ejemplo, para cerrar una confirmación). */
  onFailure?: () => void;
}

/**
 * Mutación de un diálogo de Tesorería: ejecuta la acción, invalida las queries del módulo y refresca la ruta
 * al terminar bien; si falla, registra el error y avisa con el mensaje de la acción.
 */
export function useTreasuryMutation<Values, Result>({
  action,
  onSuccess,
  logger,
  logError,
  errorFallback,
  refreshRoute = true,
  onFailure,
}: UseTreasuryMutationOptions<Values, Result>) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: Values) => unwrapAction(await action(values)),
    onSuccess: (result, values) => {
      invalidateTreasury(queryClient);
      if (refreshRoute) router.refresh();
      onSuccess(result, values);
    },
    onError: (error) => {
      onFailure?.();
      logger.error(logError, { data: { error } });
      toast.error(error instanceof Error ? error.message : errorFallback);
    },
  });
}
