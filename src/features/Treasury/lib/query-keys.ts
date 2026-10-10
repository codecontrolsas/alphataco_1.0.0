/**
 * Claves de React Query de Tesorería. Las tablas corren en client-side mode: después de mutar hay
 * que invalidarlas (un `router.refresh()` solo no las actualiza).
 */
export const TREASURY_QUERY_KEYS = {
  movements: ['treasury-movements'],
  transfers: ['treasury-transfers'],
  statement: ['treasury-statement'],
  balanceOn: ['treasury-balance-on'],
} as const;
