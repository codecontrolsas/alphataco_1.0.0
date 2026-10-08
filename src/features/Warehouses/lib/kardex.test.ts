import { describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { replayKardex, type KardexLineInput } from './kardex';

const D = (v: string | number) => new Prisma.Decimal(v);

function line(
  type: KardexLineInput['movement']['type'],
  quantity: number,
  direction: 1 | -1,
  unitCost: number,
  reversal = false
): KardexLineInput {
  return {
    quantity: D(quantity),
    direction,
    unit_cost: D(unitCost),
    movement: { type, reverses_movement_id: reversal ? 'x' : null },
  };
}

const last = (lines: KardexLineInput[]) => {
  const step = replayKardex(lines).at(-1)!;
  return { balance: step.balance.toString(), average: step.average.toFixed(4) };
};

describe('replayKardex', () => {
  it('entradas ponderan y salidas no mueven el promedio', () => {
    expect(last([line('ENTRY', 10, 1, 100), line('ENTRY', 30, 1, 200), line('EXIT', 5, -1, 175)])).toEqual({
      balance: '35',
      average: '175.0000',
    });
  });

  it('una transferencia no cambia el saldo de la empresa', () => {
    expect(last([line('ENTRY', 10, 1, 50), line('TRANSFER', 4, -1, 50)])).toEqual({ balance: '10', average: '50.0000' });
  });

  it('una devolucion reingresa al costo de la salida y pondera', () => {
    // 1 a 100, sale a 100; entra otra a 300 (promedio 300); vuelve la primera a 100 → (300 + 100) / 2
    expect(
      last([line('ENTRY', 1, 1, 100), line('EXIT', 1, -1, 100), line('ENTRY', 1, 1, 300), line('RETURN', 1, 1, 100)])
    ).toEqual({ balance: '2', average: '200.0000' });
  });

  it('anular una devolucion deshace su efecto en el promedio', () => {
    expect(
      last([
        line('ENTRY', 1, 1, 100),
        line('EXIT', 1, -1, 100),
        line('ENTRY', 1, 1, 300),
        line('RETURN', 1, 1, 100),
        line('RETURN', 1, -1, 100, true),
      ])
    ).toEqual({ balance: '1', average: '300.0000' });
  });

  it('anular una salida reingresa como una entrada', () => {
    expect(last([line('ENTRY', 10, 1, 100), line('EXIT', 4, -1, 100), line('EXIT', 4, 1, 100, true)])).toEqual({
      balance: '10',
      average: '100.0000',
    });
  });
});
