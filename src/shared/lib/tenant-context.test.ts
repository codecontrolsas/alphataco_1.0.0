import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';

import {
  createContextualClient,
  createTenantClient,
  runWithTenantContext,
  setTenantContext,
  type TenantContext,
} from './tenant-context';

const CTX: TenantContext = {
  companyId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  userId: '11111111-1111-1111-1111-111111111111',
  kind: 'user',
};

/** `$executeRaw` falso que registra los valores bindeados del `set_config`. */
function fakeTx() {
  const calls: unknown[][] = [];
  const $executeRaw = vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values);
    return 1;
  });
  return { tx: { $executeRaw } as never, calls };
}

describe('setTenantContext', () => {
  it('bindea empresa, usuario y tipo de actor como parámetros', async () => {
    const { tx, calls } = fakeTx();
    await setTenantContext(tx, CTX);
    expect(calls).toEqual([[CTX.companyId, CTX.userId, 'user']]);
  });

  it('sin usuario manda cadena vacía (la función SQL la lee como NULL)', async () => {
    const { tx, calls } = fakeTx();
    await setTenantContext(tx, { ...CTX, userId: null, kind: 'job' });
    expect(calls[0]).toEqual([CTX.companyId, '', 'job']);
  });

  it('rechaza ids que no son uuid antes de tocar la base', () => {
    const { tx } = fakeTx();
    expect(() => setTenantContext(tx, { ...CTX, companyId: "x'; drop table company; --" })).toThrow('companyId');
    expect(() => setTenantContext(tx, { ...CTX, userId: 'no-es-uuid' })).toThrow('userId');
  });
});

describe('runWithTenantContext', () => {
  it('fija el contexto antes de ejecutar el callback, dentro de la misma transacción', async () => {
    const order: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async () => {
        order.push('set_config');
        return 1;
      }),
    };
    const base = { $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) } as unknown as PrismaClient;

    const result = await runWithTenantContext(base, CTX, async () => {
      order.push('callback');
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(order).toEqual(['set_config', 'callback']);
  });

  it('pasa las opciones de la transacción y valida el contexto antes de abrirla', async () => {
    const $transaction = vi.fn(async () => 'x');
    const base = { $transaction } as unknown as PrismaClient;
    await runWithTenantContext(base, CTX, async () => 'x', { timeout: 20_000 });
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 20_000 });

    $transaction.mockClear();
    expect(() => runWithTenantContext(base, { ...CTX, companyId: 'mal' }, async () => 'x')).toThrow('companyId');
    expect($transaction).not.toHaveBeenCalled();
  });
});

describe('createTenantClient', () => {
  it('valida el contexto al crearse', () => {
    const base = { $extends: vi.fn() } as unknown as PrismaClient;
    expect(() => createTenantClient(base, { ...CTX, companyId: 'mal' })).toThrow('companyId');
  });

  it('bloquea $transaction y envuelve cada operación en [set_config, consulta]', async () => {
    let extension: { client: { $transaction: () => never }; query: { $allOperations: (a: unknown) => Promise<unknown> } } | undefined;
    const batch = vi.fn(async (ops: unknown[]) => Promise.all(ops));
    const base = {
      $extends: vi.fn((ext) => {
        extension = ext;
        return ext;
      }),
      $transaction: batch,
      $executeRaw: vi.fn(async () => 1),
    } as unknown as PrismaClient;

    createTenantClient(base, CTX);
    expect(() => extension!.client.$transaction()).toThrow('withTenantTx');

    const query = vi.fn(async () => ['fila']);
    const result = await extension!.query.$allOperations({ args: { where: {} }, query });
    expect(result).toEqual(['fila']);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith({ where: {} });
  });
});

describe('createContextualClient', () => {
  /** `$extends` falso que devuelve la extensión para poder invocar sus hooks. */
  function build(resolve: () => Promise<TenantContext | null>) {
    let extension: {
      client: { $transaction: (arg: unknown, opts?: unknown) => Promise<unknown> };
      query: { $allOperations: (a: unknown) => Promise<unknown> };
    };
    const $transaction = vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (t: unknown) => Promise<unknown>)({ $executeRaw: vi.fn(async () => 1) }) : Promise.all(arg as unknown[])
    );
    const base = {
      $extends: vi.fn((ext) => {
        extension = ext;
        return ext;
      }),
      $transaction,
      $executeRaw: vi.fn(async () => 1),
    } as unknown as PrismaClient;
    createContextualClient(base, resolve);
    return { ext: extension!, $transaction };
  }

  it('sin contexto la operación corre directa, sin lote', async () => {
    const { ext, $transaction } = build(async () => null);
    const query = vi.fn(async () => 'directo');
    expect(await ext.query.$allOperations({ args: {}, query })).toBe('directo');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('si el resolver falla se comporta como sin contexto', async () => {
    const { ext } = build(async () => {
      throw new Error('sin request');
    });
    expect(await ext.query.$allOperations({ args: {}, query: async () => 'ok' })).toBe('ok');
  });

  it('con contexto, $transaction en arreglo antepone el set_config y lo saca del resultado', async () => {
    const { ext, $transaction } = build(async () => CTX);
    const result = await ext.client.$transaction([Promise.resolve('a'), Promise.resolve('b')]);
    expect(result).toEqual(['a', 'b']);
    expect(($transaction.mock.calls[0][0] as unknown[]).length).toBe(3);
  });

  it('una operación suelta dentro de un arreglo no abre su propio lote', async () => {
    const { ext, $transaction } = build(async () => CTX);
    const query = vi.fn(async () => 'x');
    $transaction.mockImplementationOnce(async (ops: unknown) => {
      // simula que Prisma ejecuta la operación (lazy) mientras corre el lote
      const r = await ext.query.$allOperations({ args: {}, query });
      return [1, r];
    });
    await ext.client.$transaction([Promise.resolve('a')]);
    expect(query).toHaveBeenCalledTimes(1);
    expect($transaction).toHaveBeenCalledTimes(1);
  });
});
