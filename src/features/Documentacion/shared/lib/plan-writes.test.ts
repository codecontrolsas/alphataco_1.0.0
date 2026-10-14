import { describe, expect, it } from 'vitest';
import { normalizePeriod, planDocumentWrites, type ExistingDocumentRow, type PlanWritesOptions } from './plan-writes';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let counter = 0;
function row(partial: Partial<ExistingDocumentRow> & { applies: string }): ExistingDocumentRow {
  counter += 1;
  return {
    id: `row-${counter}`,
    state: 'presentado',
    document_path: 'x/y.pdf',
    period: null,
    validity: null,
    ...partial,
  };
}

const permanent: PlanWritesOptions = { period: undefined, hasExpiry: true, today: '2026-03-15' };
const monthly: PlanWritesOptions = { period: '2026-03', hasExpiry: false, today: '2026-03-15' };

describe('normalizePeriod', () => {
  it('permanentes (sin período) → null; mensuales → YYYY-MM, también desde MM/YYYY', () => {
    expect(normalizePeriod(undefined)).toBeNull();
    expect(normalizePeriod('')).toBeNull();
    expect(normalizePeriod('2026-03')).toBe('2026-03');
    expect(normalizePeriod('03/2026')).toBe('2026-03');
  });
});

describe('planDocumentWrites', () => {
  it('ausente → create', () => {
    expect(planDocumentWrites([], [A], permanent)).toEqual({ toRenew: [], toFill: [], toCreate: [A], skipped: [] });
  });

  it('vigente (con archivo, vence en el futuro) → skipped', () => {
    const existing = [row({ applies: A, validity: new Date('2026-06-01T12:00:00Z') })];
    expect(planDocumentWrites(existing, [A], permanent)).toEqual({
      toRenew: [],
      toFill: [],
      toCreate: [],
      skipped: [A],
    });
  });

  it('aprobado sin vencimiento → skipped', () => {
    const existing = [row({ applies: A, state: 'aprobado' })];
    expect(planDocumentWrites(existing, [A], { ...permanent, hasExpiry: false }).skipped).toEqual([A]);
  });

  it('vencido derivado por fecha → toRenew de ESA fila (aunque el estado guardado sea presentado)', () => {
    const expired = row({ applies: A, validity: new Date('2026-03-01T12:00:00Z') });
    expect(planDocumentWrites([expired], [A], permanent)).toEqual({
      toRenew: [{ applies: A, id: expired.id }],
      toFill: [],
      toCreate: [],
      skipped: [],
    });
  });

  it('vencido por estado guardado ("vencido") → toRenew', () => {
    const expired = row({ applies: A, state: 'vencido' });
    expect(planDocumentWrites([expired], [A], { ...permanent, hasExpiry: false }).toRenew).toEqual([
      { applies: A, id: expired.id },
    ]);
  });

  it('rechazado con archivo → toRenew', () => {
    const rejected = row({ applies: A, state: 'rechazado' });
    expect(planDocumentWrites([rejected], [A], permanent).toRenew).toEqual([{ applies: A, id: rejected.id }]);
  });

  it('borde del día de vencimiento: el día del vencimiento vale; al siguiente vence (hora argentina)', () => {
    // 23:30 AR del 15/03 = 02:30 UTC del 16/03: en Argentina sigue siendo el día 15.
    const lastDay = row({ applies: A, validity: new Date('2026-03-16T02:30:00Z') });
    expect(planDocumentWrites([lastDay], [A], { ...permanent, today: '2026-03-15' }).skipped).toEqual([A]);
    expect(planDocumentWrites([lastDay], [A], { ...permanent, today: '2026-03-16' }).toRenew).toHaveLength(1);
  });

  it('sin vencimiento en el tipo, una validez pasada no vence el documento', () => {
    const existing = [row({ applies: A, validity: new Date('2020-01-01T12:00:00Z') })];
    expect(planDocumentWrites(existing, [A], { ...permanent, hasExpiry: false }).skipped).toEqual([A]);
  });

  it('fila legacy pendiente sin archivo → toFill (se reutiliza, no se inserta otra)', () => {
    const empty = row({ applies: A, state: 'pendiente', document_path: null });
    expect(planDocumentWrites([empty], [A], permanent)).toEqual({
      toRenew: [],
      toFill: [{ applies: A, id: empty.id }],
      toCreate: [],
      skipped: [],
    });
  });

  it('archivo vacío ("") cuenta como fila sin archivo', () => {
    const empty = row({ applies: A, state: 'pendiente', document_path: '  ' });
    expect(planDocumentWrites([empty], [A], permanent).toFill).toEqual([{ applies: A, id: empty.id }]);
  });

  it('vencido + fila vacía legacy → se renueva el vencido', () => {
    const expired = row({ applies: A, state: 'vencido' });
    const empty = row({ applies: A, state: 'pendiente', document_path: null });
    const plan = planDocumentWrites([empty, expired], [A], { ...permanent, hasExpiry: false });
    expect(plan.toRenew).toEqual([{ applies: A, id: expired.id }]);
    expect(plan.toFill).toEqual([]);
  });

  it('mensual del período corriente ya presentado → skipped', () => {
    const existing = [row({ applies: A, period: '2026-03' })];
    expect(planDocumentWrites(existing, [A], monthly).skipped).toEqual([A]);
  });

  it('mensual: sólo hay el del período anterior → create (una fila por período)', () => {
    const existing = [row({ applies: A, period: '2026-02' })];
    expect(planDocumentWrites(existing, [A], monthly)).toEqual({ toRenew: [], toFill: [], toCreate: [A], skipped: [] });
  });

  it('mensual: el período se compara normalizado (MM/YYYY ≡ YYYY-MM)', () => {
    const existing = [row({ applies: A, period: '03/2026' })];
    expect(planDocumentWrites(existing, [A], monthly).skipped).toEqual([A]);
    expect(planDocumentWrites(existing, [A], { ...monthly, period: '03/2026' }).skipped).toEqual([A]);
  });

  it('mensual con fila vacía legacy del mismo período → toFill; de otro período → create', () => {
    const sameMonth = row({ applies: A, state: 'pendiente', document_path: null, period: '2026-03' });
    const otherMonth = row({ applies: B, state: 'pendiente', document_path: null, period: '2026-02' });
    const plan = planDocumentWrites([sameMonth, otherMonth], [A, B], monthly);
    expect(plan.toFill).toEqual([{ applies: A, id: sameMonth.id }]);
    expect(plan.toCreate).toEqual([B]);
  });

  it('multi: mezcla de recursos → cada uno según su situación; ignora filas sin applies', () => {
    const current = row({ applies: A, period: '2026-03' });
    const old = row({ applies: B, period: '2026-03', state: 'vencido' });
    const orphan = row({ applies: null as unknown as string, period: '2026-03' });
    const plan = planDocumentWrites([current, old, orphan], [A, B, C], monthly);
    expect(plan).toEqual({
      toRenew: [{ applies: B, id: old.id }],
      toFill: [],
      toCreate: [C],
      skipped: [A],
    });
  });
});
