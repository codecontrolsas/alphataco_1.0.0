import { describe, expect, it } from 'vitest';
import { arCurrentPeriod, arToday } from './dates';
import { evaluateResource } from './evaluation';
import { makeDoc, makeResource, makeType } from './fixtures.test-helpers';
import { aggregateStatus, toStatusType } from './status';

const opts = { today: '2026-10-14', period: '2026-10' };
const evalOne = (
  type: Parameters<typeof makeType>[0],
  docs: Parameters<typeof makeDoc>[0][],
  resource = makeResource()
) => {
  const t = makeType(type);
  const result = evaluateResource(
    resource,
    [t],
    docs.map((d) => makeDoc({ typeId: t.id, ...d })),
    opts
  );
  return { result, req: result.requirements[0] };
};

describe('evaluateResource: documento relevante y estado derivado', () => {
  it('sin documento → faltante', () => {
    const { req, result } = evalOne({}, []);
    expect(req.state).toBe('faltante');
    expect(req.doc).toBeNull();
    expect(result.status).toBe('INCOMPLETO');
  });

  it('fila legacy vacía (sin path) se ignora', () => {
    expect(evalOne({}, [{ path: null, storedState: 'pendiente' }]).req.state).toBe('faltante');
    expect(evalOne({}, [{ path: '  ', storedState: 'pendiente' }]).req.state).toBe('faltante');
  });

  it("fila legacy 'pendiente' con archivo = presentado", () => {
    expect(evalOne({}, [{ storedState: 'pendiente' }]).req.state).toBe('presentado');
  });

  it('presentado y aprobado completan', () => {
    expect(evalOne({}, [{ storedState: 'presentado' }]).result.status).toBe('COMPLETO');
    const { req, result } = evalOne({}, [{ storedState: 'aprobado' }]);
    expect(req.state).toBe('aprobado');
    expect(result.status).toBe('COMPLETO');
  });

  it('rechazado → rechazado e INCOMPLETO', () => {
    const { req, result } = evalOne({}, [{ storedState: 'rechazado' }]);
    expect(req.state).toBe('rechazado');
    expect(result.status).toBe('INCOMPLETO');
  });

  it('presentado más viejo gana sobre un rechazado más nuevo', () => {
    const { req } = evalOne({}, [
      { id: 'viejo', storedState: 'presentado', createdAt: new Date('2026-01-01T00:00:00Z') },
      { id: 'nuevo', storedState: 'rechazado', createdAt: new Date('2026-06-01T00:00:00Z') },
    ]);
    expect(req.doc?.id).toBe('viejo');
    expect(req.state).toBe('presentado');
  });

  it('entre presentados gana el más nuevo; si todos son rechazados, el rechazado más nuevo', () => {
    const presentados = evalOne({}, [
      { id: 'a', createdAt: new Date('2026-01-01T00:00:00Z') },
      { id: 'b', createdAt: new Date('2026-03-01T00:00:00Z') },
    ]);
    expect(presentados.req.doc?.id).toBe('b');
    const rechazados = evalOne({}, [
      { id: 'a', storedState: 'rechazado', createdAt: new Date('2026-01-01T00:00:00Z') },
      { id: 'b', storedState: 'rechazado', createdAt: new Date('2026-03-01T00:00:00Z') },
    ]);
    expect(rechazados.req.doc?.id).toBe('b');
    expect(rechazados.req.state).toBe('rechazado');
  });

  it('vencido: el día del vencimiento todavía vale, al siguiente vence', () => {
    const hoy = evalOne({ hasExpiry: true }, [{ validityDay: '2026-10-14' }]);
    expect(hoy.req.state).toBe('presentado');
    expect(hoy.req.expiringSoon).toBe(true);
    const ayer = evalOne({ hasExpiry: true }, [{ validityDay: '2026-10-13' }]);
    expect(ayer.req.state).toBe('vencido');
    expect(ayer.result.status).toBe('VENCIDO');
    expect(ayer.req.expiringSoon).toBe(false);
  });

  it('sin hasExpiry la fecha se ignora; stored vencido siempre vence', () => {
    expect(evalOne({ hasExpiry: false }, [{ validityDay: '2020-01-01' }]).req.state).toBe('presentado');
    expect(evalOne({ hasExpiry: false }, [{ storedState: 'vencido' }]).req.state).toBe('vencido');
  });

  it('por vencer: 30 días sí, 31 no (es una marca, no un estado)', () => {
    const d30 = evalOne({ hasExpiry: true }, [{ validityDay: '2026-11-13' }]);
    expect(d30.req.expiringSoon).toBe(true);
    expect(d30.req.state).toBe('presentado');
    expect(d30.req.daysToExpiry).toBe(30);
    const d31 = evalOne({ hasExpiry: true }, [{ validityDay: '2026-11-14' }]);
    expect(d31.req.expiringSoon).toBe(false);
    expect(d31.req.daysToExpiry).toBe(31);
  });

  it('validez como texto DD/MM/YYYY (documentos de empresa) vía parseValidity', async () => {
    const { parseValidity } = await import('./dates');
    const { req } = evalOne({ hasExpiry: true }, [{ validityDay: parseValidity('13/10/2026') }]);
    expect(req.state).toBe('vencido');
  });
});

describe('evaluateResource: mensuales', () => {
  it('cuenta el período corriente; con normalización MM/YYYY', () => {
    expect(evalOne({ monthly: true }, [{ period: '2026-10' }]).req.state).toBe('presentado');
    expect(evalOne({ monthly: true }, [{ period: '10/2026' }]).req.state).toBe('presentado');
  });

  it('un período anterior no cubre el corriente', () => {
    const { req, result } = evalOne({ monthly: true }, [{ period: '2026-09' }]);
    expect(req.state).toBe('faltante');
    expect(result.status).toBe('INCOMPLETO');
  });

  it('período NULL no cubre; el rechazado del mes corriente se considera, no el de otro mes', () => {
    expect(evalOne({ monthly: true }, [{ period: null }]).req.state).toBe('faltante');
    const { req } = evalOne({ monthly: true }, [
      { id: 'oct', period: '2026-10', storedState: 'rechazado' },
      { id: 'sep', period: '2026-09', storedState: 'presentado' },
    ]);
    expect(req.doc?.id).toBe('oct');
    expect(req.state).toBe('rechazado');
  });

  it('mensual no obligatorio sin documento del mes no genera fila ni afecta el status', () => {
    const { result } = evalOne({ monthly: true, mandatory: false }, [{ period: '2026-09' }]);
    expect(result.requirements).toHaveLength(0);
    expect(result.status).toBe('SIN_REQUISITOS');
  });
});

describe('evaluateResource: obligatoriedad y agregado', () => {
  it('no obligatorio sin documento no genera fila; con documento sí (required:false)', () => {
    expect(evalOne({ mandatory: false }, []).result.requirements).toHaveLength(0);
    const { req, result } = evalOne({ mandatory: false }, [{}]);
    expect(req.required).toBe(false);
    expect(result.mandatoryTotal).toBe(0);
    expect(result.status).toBe('SIN_REQUISITOS');
  });

  it('no obligatorio rechazado no afecta el status', () => {
    const t1 = makeType({ id: 'a' });
    const t2 = makeType({ id: 'b', mandatory: false });
    const result = evaluateResource(
      makeResource(),
      [t1, t2],
      [makeDoc({ typeId: 'a' }), makeDoc({ typeId: 'b', storedState: 'rechazado' })],
      opts
    );
    expect(result.requirements.find((r) => r.typeId === 'b')?.state).toBe('rechazado');
    expect(result.status).toBe('COMPLETO');
  });

  it('prioridad: faltante gana sobre vencido; vencido gana sobre completo', () => {
    const types = [makeType({ id: 'a', hasExpiry: true }), makeType({ id: 'b' }), makeType({ id: 'c' })];
    const vencido = makeDoc({ typeId: 'a', validityDay: '2026-01-01' });
    const ok = makeDoc({ typeId: 'b', storedState: 'aprobado' });
    const conFaltante = evaluateResource(makeResource(), types, [vencido, ok], opts);
    expect(conFaltante.status).toBe('INCOMPLETO');
    expect(conFaltante.mandatoryTotal).toBe(3);
    expect(conFaltante.mandatoryOk).toBe(1);
    const completo = evaluateResource(makeResource(), types, [vencido, ok, makeDoc({ typeId: 'c' })], opts);
    expect(completo.status).toBe('VENCIDO');
    expect(completo.mandatoryOk).toBe(2);
  });

  it('sin tipos aplicables → SIN_REQUISITOS', () => {
    const r = evaluateResource(makeResource(), [], [], opts);
    expect(r.status).toBe('SIN_REQUISITOS');
    expect(r.mandatoryTotal).toBe(0);
  });

  it('tipo que no aplica (down_document a un activo, o inactivo) no se exige', () => {
    const types = [makeType({ id: 'a', downDocument: true }), makeType({ id: 'b', isActive: false })];
    expect(evaluateResource(makeResource(), types, [], opts).requirements).toHaveLength(0);
  });

  it('documentos de tipos que ya no aplican van a notApplicable, no al status', () => {
    const types = [
      makeType({ id: 'a', scope: { special: true, conditions: [{ ids: ['G'], filter_column: 'guild' }] } }),
    ];
    const docs = [makeDoc({ typeId: 'a' }), makeDoc({ typeId: 'huerfano' }), makeDoc({ typeId: 'a', path: null })];
    const r = evaluateResource(makeResource({ direct: { guild: 'otro' } }), types, docs, opts);
    expect(r.requirements).toHaveLength(0);
    expect(r.notApplicable.map((d) => d.typeId).sort()).toEqual(['a', 'huerfano']);
    expect(r.status).toBe('SIN_REQUISITOS');
  });

  it('recurso de baja: sólo se exigen los down_document', () => {
    const types = [makeType({ id: 'a' }), makeType({ id: 'b', downDocument: true })];
    const r = evaluateResource(makeResource({ isActive: false }), types, [], opts);
    expect(r.requirements.map((x) => x.typeId)).toEqual(['b']);
  });
});

describe('status', () => {
  it('aggregateStatus y toStatusType', () => {
    expect(aggregateStatus({ mandatoryTotal: 0, missingOrRejected: 0, expired: 0 })).toBe('SIN_REQUISITOS');
    expect(aggregateStatus({ mandatoryTotal: 2, missingOrRejected: 1, expired: 1 })).toBe('INCOMPLETO');
    expect(aggregateStatus({ mandatoryTotal: 2, missingOrRejected: 0, expired: 1 })).toBe('VENCIDO');
    expect(aggregateStatus({ mandatoryTotal: 2, missingOrRejected: 0, expired: 0 })).toBe('COMPLETO');
    expect(toStatusType('COMPLETO')).toBe('Completo');
    expect(toStatusType('SIN_REQUISITOS')).toBe('Completo');
    expect(toStatusType('VENCIDO')).toBe('Completo con doc vencida');
    expect(toStatusType('INCOMPLETO')).toBe('Incompleto');
  });
});

describe('hora argentina en la evaluación', () => {
  it('a las 22:30 AR un documento que vence "hoy" sigue vigente aunque UTC ya sea mañana', () => {
    const now = new Date('2026-10-15T01:30:00Z');
    const today = arToday(now);
    const period = arCurrentPeriod(now);
    const t = makeType({ hasExpiry: true });
    const r = evaluateResource(makeResource(), [t], [makeDoc({ typeId: t.id, validityDay: '2026-10-14' })], {
      today,
      period,
    });
    expect(r.requirements[0].state).toBe('presentado');
  });
});
