import { DEFAULT_INSTANCE_CONTROLS, type InstanceEditableState } from '@/shared/lib/instance-controls-core';
import { describe, expect, it } from 'vitest';
import { instanceUpdateRequestSchema } from '../schemas/instance';
import { computeInstancePlan, isBelowExistingCompanies } from './instance-plan';

/** `PUT /api/admin/v1/instance`: validación del pedido y mezcla con el estado vigente. */
const VERSION = 'a'.repeat(64);
const NOW = new Date('2026-10-29T15:00:00.000Z');
const BASE: InstanceEditableState = { maxCompanies: 2, ...DEFAULT_INSTANCE_CONTROLS };

function request(body: Record<string, unknown>) {
  return instanceUpdateRequestSchema.parse({ expectedVersion: VERSION, reason: 'Ventana de mantenimiento', ...body });
}

describe('instanceUpdateRequestSchema', () => {
  it('exige versión, motivo y al menos un cambio; rechaza campos desconocidos', () => {
    const parse = (body: unknown) => instanceUpdateRequestSchema.safeParse(body).success;
    expect(parse({ expectedVersion: VERSION, reason: 'ok ok', max_companies: 3 })).toBe(true);
    expect(parse({ expectedVersion: VERSION, max_companies: 3 })).toBe(false);
    expect(parse({ expectedVersion: VERSION, reason: '  ', max_companies: 3 })).toBe(false);
    expect(parse({ reason: 'motivo', max_companies: 3 })).toBe(false);
    expect(parse({ expectedVersion: VERSION, reason: 'motivo' })).toBe(false);
    expect(parse({ expectedVersion: VERSION, reason: 'motivo', pause: {} })).toBe(false);
    expect(parse({ expectedVersion: VERSION, reason: 'motivo', max_companies: 0 })).toBe(false);
    expect(parse({ expectedVersion: VERSION, reason: 'motivo', max_companies: 2.5 })).toBe(false);
    expect(parse({ expectedVersion: VERSION, reason: 'motivo', maxCompanies: 2 })).toBe(false);
    expect(parse({ expectedVersion: VERSION, reason: 'motivo', banners: { footer: { enabled: true } } })).toBe(false);
    expect(parse({ expectedVersion: VERSION, reason: 'motivo', banners: { login: { severity: 'urgente' } } })).toBe(
      false
    );
  });

  it('banners: texto plano de hasta 280 caracteres (se limpian los de control)', () => {
    const ok = request({ banners: { login: { enabled: true, message: ` ${'x'.repeat(280)}\u0000 ` } } });
    expect(ok.banners?.login?.message).toHaveLength(280);
    expect(
      instanceUpdateRequestSchema.safeParse({
        expectedVersion: VERSION,
        reason: 'motivo',
        banners: { dashboard: { message: 'x'.repeat(281) } },
      }).success
    ).toBe(false);
  });
});

describe('computeInstancePlan', () => {
  it('activa la pausa con fecha, la conserva al editar el mensaje y la borra al reanudar', () => {
    const activated = computeInstancePlan(BASE, request({ pause: { active: true, message: 'Volvemos 16 h' } }), NOW);
    expect(activated).toMatchObject({
      ok: true,
      next: { pause: { active: true, message: 'Volvemos 16 h', since: NOW.toISOString() } },
      changes: [
        { field: 'pause.active', from: false, to: true },
        { field: 'pause.message', from: '', to: 'Volvemos 16 h' },
      ],
    });
    if (!activated.ok) throw new Error('plan inválido');

    const later = new Date('2026-10-29T16:00:00.000Z');
    const edited = computeInstancePlan(activated.next, request({ pause: { message: 'Volvemos 17 h' } }), later);
    expect(edited.ok && edited.next.pause.since).toBe(NOW.toISOString());

    const resumed = computeInstancePlan(activated.next, request({ pause: { active: false } }), later);
    expect(resumed.ok && resumed.next.pause).toEqual({ active: false, message: 'Volvemos 16 h', since: null });
  });

  it('mezcla cambios parciales de banners y lista solo lo que cambia', () => {
    const plan = computeInstancePlan(
      BASE,
      request({
        banners: { dashboard: { enabled: true, message: 'Corte 22 h', severity: 'critical' } },
        max_companies: 2,
      }),
      NOW
    );
    expect(plan.ok && plan.changes).toEqual([
      { field: 'banners.dashboard.enabled', from: false, to: true },
      { field: 'banners.dashboard.message', from: '', to: 'Corte 22 h' },
      { field: 'banners.dashboard.severity', from: 'info', to: 'critical' },
    ]);
    expect(plan.ok && plan.next.banners.login).toEqual(BASE.banners.login);
  });

  it('no deja encender un banner sin mensaje (estado resultante, no solo el pedido)', () => {
    const plan = computeInstancePlan(BASE, request({ banners: { login: { enabled: true } } }), NOW);
    expect(plan).toMatchObject({ ok: false, code: 'INVALID_STATE' });
  });

  it('el límite no puede quedar por debajo de las empresas existentes', () => {
    expect(isBelowExistingCompanies(1, 2)).toBe(true);
    expect(isBelowExistingCompanies(2, 2)).toBe(false);
    expect(isBelowExistingCompanies(3, 2)).toBe(false);
  });
});
