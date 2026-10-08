import { describe, expect, it } from 'vitest';
import { nextStockMovementNumber } from './movement-numbering';

/** Mismo enfoque que `order-numbering.test.ts`: se observa el SQL, no solo el resultado. */
function fakeTx(rows: { next: bigint }[]) {
  const calls: { kind: 'exec' | 'query'; sql: string; params: unknown[] }[] = [];
  const record =
    (kind: 'exec' | 'query') =>
    (strings: TemplateStringsArray, ...params: unknown[]) => {
      calls.push({ kind, sql: strings.join('?'), params });
      return Promise.resolve(kind === 'exec' ? 1 : rows);
    };
  return { calls, tx: { $executeRaw: record('exec'), $queryRaw: record('query') } as never };
}

describe('nextStockMovementNumber', () => {
  it('toma el advisory lock por empresa antes de leer el maximo', async () => {
    const { tx, calls } = fakeTx([{ next: BigInt(1) }]);
    await nextStockMovementNumber(tx, 'empresa-1');

    expect(calls.map((c) => c.kind)).toEqual(['exec', 'query']);
    expect(calls[0]!.sql).toContain('pg_advisory_xact_lock');
    expect(calls[0]!.params).toEqual(['stock_movement_number:empresa-1']);
    expect(calls[1]!.sql).toContain('FROM stock_movements');
    expect(calls[1]!.params).toEqual(['empresa-1']);
  });

  it('formatea con prefijo y 6 digitos', async () => {
    const { tx } = fakeTx([{ next: BigInt(42) }]);
    expect(await nextStockMovementNumber(tx, 'e')).toBe('MOV-000042');
  });
});
