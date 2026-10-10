'use client';

import { AMOUNT_SCALE, amountOf, formatScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';
import { useQuery } from '@tanstack/react-query';
import { getAccountBalanceOn } from '../actions/statement.server';
import { TREASURY_QUERY_KEYS } from '../lib/query-keys';
import { UUID_RE } from '../schemas/shared';

export type BalanceAfter = { before: string | null; after: string | null; loading: boolean };

/**
 * Saldo de la cuenta al final de `date` sin el movimiento que se edita (`before`) y cómo queda
 * sumándole `deltaCents` (`after`). Lo usan los formularios para el aviso de saldo negativo.
 */
export function useBalanceAfter(accountId: string, date: string, deltaCents: bigint | null, excludeMovementId?: string): BalanceAfter {
  const enabled = UUID_RE.test(accountId) && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const { data, isFetching } = useQuery({
    queryKey: [...TREASURY_QUERY_KEYS.balanceOn, accountId, date, excludeMovementId ?? ''],
    queryFn: () => getAccountBalanceOn(accountId, date, excludeMovementId),
    enabled,
    staleTime: 30 * 1000,
  });
  const before = enabled ? (data ?? null) : null;
  const after = before !== null && deltaCents !== null ? formatScaled(amountOf(before) + deltaCents, AMOUNT_SCALE) : null;
  return { before, after, loading: enabled && isFetching };
}
