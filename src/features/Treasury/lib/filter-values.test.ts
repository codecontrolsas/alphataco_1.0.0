import { describe, expect, it } from 'vitest';
import {
  INT4_MAX,
  buildTreasuryDateRangeWhere,
  facetWhere,
  isUuid,
  ownEntry,
  parseAmountText,
  parseBoundedInt,
  parseDay,
  safePaging,
  textValue,
} from './filter-values';

describe('textValue', () => {
  it('recorta y devuelve null si queda vacío', () => {
    expect(textValue('  hola ')).toBe('hola');
    expect(textValue('   ')).toBeNull();
    expect(textValue(undefined)).toBeNull();
  });
  it('quita el carácter NUL, que Postgres rechaza', () => {
    expect(textValue('ab\u0000cd')).toBe('abcd');
    expect(textValue('\u0000')).toBeNull();
  });
  it('acota el largo', () => {
    expect(textValue('x'.repeat(1000))?.length).toBe(200);
  });
});

describe('parseAmountText', () => {
  it('acepta coma o punto decimal y separador de miles', () => {
    expect(parseAmountText('1234,56')).toBe('1234.56');
    expect(parseAmountText('1234.56')).toBe('1234.56');
    expect(parseAmountText('1.234,56')).toBe('1234.56');
  });
  it('rechaza lo que no es número', () => {
    expect(parseAmountText('abc')).toBeNull();
    expect(parseAmountText('-5')).toBeNull();
    expect(parseAmountText('1e5')).toBeNull();
  });
  it('rechaza lo que no entra en numeric(15,2)', () => {
    expect(parseAmountText('9999999999999.99')).toBe('9999999999999.99');
    expect(parseAmountText('10000000000000')).toBeNull();
    expect(parseAmountText('9'.repeat(400))).toBeNull();
  });
});

describe('parseDay', () => {
  it('acepta fechas reales', () => {
    expect(parseDay('2026-02-28')).toBe('2026-02-28');
    expect(parseDay('2028-02-29')).toBe('2028-02-29');
  });
  it('rechaza fechas imposibles', () => {
    expect(parseDay('2026-02-31')).toBeNull();
    expect(parseDay('2026-13-01')).toBeNull();
    expect(parseDay('2026-02-29')).toBeNull();
    expect(parseDay('2026-2-1')).toBeNull();
    expect(parseDay('hola')).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });
  it('rechaza años fuera del rango que Postgres y Argentina manejan', () => {
    expect(parseDay('0000-01-01')).toBeNull();
    expect(parseDay('9999-12-31')).toBeNull();
  });
});

describe('parseBoundedInt', () => {
  it('acepta enteros dentro del rango de int', () => {
    expect(parseBoundedInt('0')).toBe(0);
    expect(parseBoundedInt(' 12 ')).toBe(12);
    expect(parseBoundedInt(String(INT4_MAX))).toBe(INT4_MAX);
  });
  it('rechaza lo que desborda o no es entero', () => {
    expect(parseBoundedInt(String(INT4_MAX + 1))).toBeNull();
    expect(parseBoundedInt('99999999999')).toBeNull();
    expect(parseBoundedInt('9'.repeat(400))).toBeNull();
    expect(parseBoundedInt('-1')).toBeNull();
    expect(parseBoundedInt('1.5')).toBeNull();
    expect(parseBoundedInt('')).toBeNull();
  });
});

describe('safePaging', () => {
  it('deja pasar valores normales', () => {
    expect(safePaging({ page: 2, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });
  it('corrige NaN, negativos y tamaños absurdos', () => {
    expect(safePaging({ page: Number.NaN, pageSize: Number.NaN })).toEqual({ skip: 0, take: 10 });
    expect(safePaging({ page: 0, pageSize: -5 })).toEqual({ skip: 0, take: 10 });
    expect(safePaging({ page: 0, pageSize: 1e20 }).take).toBeLessThanOrEqual(500);
    expect(safePaging({ page: 1e20, pageSize: 10 }).skip).toBeLessThanOrEqual(INT4_MAX);
  });
});

describe('ownEntry', () => {
  const map = { a: 1 };
  it('solo devuelve claves propias', () => {
    expect(ownEntry(map, 'a')).toBe(1);
    expect(ownEntry(map, 'constructor')).toBeUndefined();
    expect(ownEntry(map, '__proto__')).toBeUndefined();
    expect(ownEntry(map, 'toString')).toBeUndefined();
  });
});

describe('facetWhere', () => {
  const uuid = '3f0e2b1c-1111-4222-8333-444455556666';
  it('uuid: ignora los inválidos y devuelve null si no queda ninguno', () => {
    expect(facetWhere('customer_id', ['x', "' OR 1=1"], { kind: 'uuid' })).toBeNull();
    expect(facetWhere('customer_id', ['x', uuid], { kind: 'uuid' })).toEqual({ customer_id: uuid });
  });
  it('uuid múltiples usa in', () => {
    const other = '3f0e2b1c-1111-4222-8333-444455556667';
    expect(facetWhere('customer_id', [uuid, other], { kind: 'uuid' })).toEqual({ customer_id: { in: [uuid, other] } });
  });
  it('enum: solo valores permitidos', () => {
    expect(facetWhere('status', ['NOPE'], { kind: 'enum', allowed: ['DRAFT', 'CONFIRMED'] })).toBeNull();
    expect(facetWhere('status', ['DRAFT', 'NOPE'], { kind: 'enum', allowed: ['DRAFT', 'CONFIRMED'] })).toEqual({ status: 'DRAFT' });
  });
  it('columna NOT NULL: el centinela de "sin asignar" se ignora', () => {
    expect(facetWhere('customer_id', ['__null__'], { kind: 'uuid' })).toBeNull();
  });
  it('columna nullable: centinela solo, o mezclado con valores', () => {
    expect(facetWhere('concept_id', ['__null__'], { kind: 'uuid', nullable: true })).toEqual({ concept_id: null });
    expect(facetWhere('concept_id', ['__null__', uuid], { kind: 'uuid', nullable: true })).toEqual({
      OR: [{ concept_id: uuid }, { concept_id: null }],
    });
  });
});

describe('buildTreasuryDateRangeWhere', () => {
  it('columna @db.Date: el día tal cual, en UTC', () => {
    const where = buildTreasuryDateRangeWhere({ date_from: ['2026-03-01'], date_to: ['2026-03-31'] }, { dateColumns: ['date'] });
    expect(where).toEqual({
      date: { gte: new Date('2026-03-01T00:00:00.000Z'), lte: new Date('2026-03-31T00:00:00.000Z') },
    });
  });
  it('timestamp: el día elegido es el día argentino (-03:00)', () => {
    const where = buildTreasuryDateRangeWhere(
      { created_at_from: ['2026-03-01'], created_at_to: ['2026-03-01'] },
      { timestampColumns: ['created_at'] }
    );
    expect(where).toEqual({
      created_at: { gte: new Date('2026-03-01T03:00:00.000Z'), lte: new Date('2026-03-02T02:59:59.999Z') },
    });
  });
  it('un registro de las 22:00 argentinas (01:00 UTC del día siguiente) cae en el día argentino', () => {
    const where = buildTreasuryDateRangeWhere({ created_at_to: ['2026-03-01'] }, { timestampColumns: ['created_at'] }) as {
      created_at: { lte: Date };
    };
    expect(new Date('2026-03-02T01:00:00.000Z').getTime()).toBeLessThanOrEqual(where.created_at.lte.getTime());
  });
  it('fechas imposibles o ausentes se ignoran', () => {
    expect(buildTreasuryDateRangeWhere({ date_from: ['2026-02-31'], date_to: ['2026-13-01'] }, { dateColumns: ['date'] })).toEqual({});
    expect(buildTreasuryDateRangeWhere({}, { dateColumns: ['date'], timestampColumns: ['created_at'] })).toEqual({});
    expect(buildTreasuryDateRangeWhere({ date_from: ['2026-02-31'], date_to: ['2026-03-05'] }, { dateColumns: ['date'] })).toEqual({
      date: { lte: new Date('2026-03-05T00:00:00.000Z') },
    });
  });
});

describe('isUuid', () => {
  it('valida el formato', () => {
    expect(isUuid('3f0e2b1c-1111-4222-8333-444455556666')).toBe(true);
    expect(isUuid('3f0e2b1c')).toBe(false);
  });
});
