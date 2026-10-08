import { describe, expect, it } from 'vitest';
import { nextMaterialRequestNumber } from './request-numbering';

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

describe('nextMaterialRequestNumber', () => {
  it('toma su propio advisory lock por empresa antes de leer el maximo', async () => {
    const { tx, calls } = fakeTx([{ next: BigInt(1) }]);
    await nextMaterialRequestNumber(tx, 'empresa-1');

    expect(calls.map((c) => c.kind)).toEqual(['exec', 'query']);
    expect(calls[0]!.params).toEqual(['material_request_number:empresa-1']);
    expect(calls[1]!.sql).toContain('FROM material_requests');
  });

  it('formatea con prefijo PED y 6 digitos', async () => {
    const { tx } = fakeTx([{ next: BigInt(7) }]);
    expect(await nextMaterialRequestNumber(tx, 'e')).toBe('PED-000007');
  });
});
