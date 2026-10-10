import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TREASURY_QUERY_KEYS } from '@/features/Treasury/lib/query-keys';
import { invalidatePurchases } from './invalidate';

describe('invalidatePurchases', () => {
  it('invalida también las tablas, el extracto y los saldos de Tesorería (un pago mueve el saldo)', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    invalidatePurchases(client);
    const keys = spy.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    for (const key of Object.values(TREASURY_QUERY_KEYS)) expect(keys).toContain(JSON.stringify(key));
  });
});
