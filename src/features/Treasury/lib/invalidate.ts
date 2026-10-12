import type { QueryClient } from '@tanstack/react-query';
import { TREASURY_QUERY_KEYS } from './query-keys';

/** Invalida tablas, extracto y saldos de Tesorería después de una mutación. */
export function invalidateTreasury(queryClient: QueryClient) {
  for (const key of Object.values(TREASURY_QUERY_KEYS)) void queryClient.invalidateQueries({ queryKey: key });
}
