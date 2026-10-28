import { SWITCHABLE_MODULE_KEYS } from '@/features/Modules/catalog';
import { describe, expect, it } from 'vitest';
import {
  companyEnabledSet,
  computeModulePlan,
  computeStateVersion,
  type ModuleState,
  type PlanRequest,
} from './modules-plan';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

function stateWith(
  instance: Record<string, boolean> | 'all',
  companies: Record<string, Record<string, boolean>> = { [A]: {}, [B]: {} }
): ModuleState {
  const instanceRows =
    instance === 'all' ? new Map(SWITCHABLE_MODULE_KEYS.map((key) => [key, true])) : new Map(Object.entries(instance));
  return {
    instance: instanceRows,
    companies: new Map(Object.entries(companies).map(([id, rows]) => [id, new Map(Object.entries(rows))])),
  };
}

function request(partial: Partial<PlanRequest> & Pick<PlanRequest, 'changes'>): PlanRequest {
  return { scope: 'instance', companyId: null, cascade: false, withDependencies: false, ...partial };
}

const keysOf = (effects: { key: string }[]) => effects.map((effect) => effect.key);

describe('plan de módulos: apagado', () => {
  it('apagar una clave con dependientes encendidos queda bloqueado y muestra la cascada', () => {
    const plan = computeModulePlan(stateWith('all'), request({ changes: [{ key: 'almacenes', enabled: false }] }));
    expect(plan.applicable).toBe(false);
    expect(plan.effective.map((e) => e.key)).toEqual(['almacenes']);
    const block = plan.blocked.find((b) => b.key === 'almacenes');
    expect(block?.code).toBe('HAS_DEPENDENTS');
    expect(block?.dependents).toEqual(expect.arrayContaining(['gomeria', 'indumentaria', 'compras']));
    // La cascada completa incluye a Pagos (depende de Compras), aunque no dependa directo de Almacenes.
    expect(keysOf(plan.cascadePreview)).toEqual(
      expect.arrayContaining(['gomeria', 'indumentaria', 'compras', 'pagos'])
    );
  });

  it('con cascade: true apaga la clave y sus dependientes, dependientes primero', () => {
    const plan = computeModulePlan(
      stateWith('all'),
      request({ changes: [{ key: 'almacenes', enabled: false }], cascade: true })
    );
    expect(plan.applicable).toBe(true);
    const keys = keysOf(plan.effective);
    expect(keys).toEqual(expect.arrayContaining(['almacenes', 'gomeria', 'indumentaria', 'compras', 'pagos']));
    expect(keys.indexOf('pagos')).toBeLessThan(keys.indexOf('compras'));
    expect(keys.indexOf('compras')).toBeLessThan(keys.indexOf('almacenes'));
    expect(plan.effective.find((e) => e.key === 'almacenes')?.cause).toBe('requested');
    expect(plan.effective.find((e) => e.key === 'pagos')?.cause).toBe('cascade');
    expect(plan.cascadePreview).toEqual([]);
    expect(plan.softImpacts.map((s) => s.key)).toContain('mantenimiento');
    expect(plan.affectedCompanies).toBe(2);
  });

  it('una hoja (Gomería) se apaga sin bloqueo', () => {
    const plan = computeModulePlan(stateWith('all'), request({ changes: [{ key: 'gomeria', enabled: false }] }));
    expect(plan.applicable).toBe(true);
    expect(plan.effective).toEqual([
      { scope: 'instance', companyId: null, key: 'gomeria', from: true, to: false, cause: 'requested' },
    ]);
  });

  it('Documentación (requiresAny) sigue con Equipos si se apaga Empleados... salvo lo que requiere Empleados', () => {
    const plan = computeModulePlan(
      stateWith('all'),
      request({ changes: [{ key: 'empleados', enabled: false }], cascade: true })
    );
    const keys = keysOf(plan.effective);
    expect(keys).not.toContain('documentacion');
    expect(keys).toEqual(expect.arrayContaining(['empleados', 'seleccion', 'hse', 'portal', 'operaciones']));
  });

  it('sin Empleados ni Equipos, Documentación es dependiente', () => {
    const state = stateWith({
      ...Object.fromEntries(SWITCHABLE_MODULE_KEYS.map((k) => [k, false])),
      equipos: true,
      documentacion: true,
    });
    const plan = computeModulePlan(state, request({ changes: [{ key: 'equipos', enabled: false }] }));
    expect(plan.blocked).toEqual([{ key: 'equipos', code: 'HAS_DEPENDENTS', dependents: ['documentacion'] }]);
  });

  it('apagar algo ya apagado no cambia nada', () => {
    const plan = computeModulePlan(stateWith({ hse: false }), request({ changes: [{ key: 'hse', enabled: false }] }));
    expect(plan).toMatchObject({ applicable: true, effective: [], blocked: [] });
  });
});

describe('plan de módulos: encendido', () => {
  it('encender sin las dependencias duras queda bloqueado', () => {
    const plan = computeModulePlan(stateWith({}), request({ changes: [{ key: 'gomeria', enabled: true }] }));
    expect(plan.applicable).toBe(false);
    expect(plan.blocked[0]).toMatchObject({ key: 'gomeria', code: 'MISSING_DEPENDENCIES' });
    expect(plan.blocked[0].missing).toEqual(expect.arrayContaining(['mantenimiento', 'equipos', 'almacenes']));
    expect(plan.effective).toEqual([]);
  });

  it('withDependencies enciende también el cierre de dependencias (marcadas como dependency)', () => {
    const plan = computeModulePlan(
      stateWith({}),
      request({ changes: [{ key: 'gomeria', enabled: true }], withDependencies: true })
    );
    expect(plan.applicable).toBe(true);
    expect(keysOf(plan.effective).sort()).toEqual(['almacenes', 'empleados', 'equipos', 'gomeria', 'mantenimiento']);
    expect(plan.effective.find((e) => e.key === 'gomeria')?.cause).toBe('requested');
    expect(plan.effective.find((e) => e.key === 'empleados')?.cause).toBe('dependency');
    expect(plan.effective.every((e) => e.from === null && e.to)).toBe(true);
  });

  it('withDependencies con requiresAny elige el primer miembro posible', () => {
    const plan = computeModulePlan(
      stateWith({}),
      request({ changes: [{ key: 'documentacion', enabled: true }], withDependencies: true })
    );
    expect(keysOf(plan.effective).sort()).toEqual(['documentacion', 'empleados']);
  });

  it('no se enciende una dependencia que el mismo pedido apaga', () => {
    const plan = computeModulePlan(
      stateWith('all'),
      request({
        changes: [
          { key: 'portal', enabled: true },
          { key: 'hse', enabled: false },
        ],
        withDependencies: true,
        cascade: true,
      })
    );
    expect(plan.applicable).toBe(false);
  });
});

describe('plan de módulos: empresa contra instancia', () => {
  it('una empresa nunca enciende lo que la instancia tiene apagado', () => {
    const state = stateWith({
      ...Object.fromEntries(SWITCHABLE_MODULE_KEYS.map((k) => [k, true])),
      hse: false,
      portal: false,
    });
    const plan = computeModulePlan(
      state,
      request({ scope: 'company', companyId: A, changes: [{ key: 'hse', enabled: true }], withDependencies: true })
    );
    expect(plan.applicable).toBe(false);
    expect(plan.blocked).toEqual([{ key: 'hse', code: 'INSTANCE_DISABLED', companyId: A }]);
  });

  it('withDependencies en empresa no puede encender una dependencia apagada en la instancia', () => {
    const state2 = stateWith({ empleados: true, hse: false, portal: true }, { [A]: { portal: false } });
    const plan2 = computeModulePlan(
      state2,
      request({ scope: 'company', companyId: A, changes: [{ key: 'portal', enabled: true }], withDependencies: true })
    );
    expect(plan2.blocked).toEqual([{ key: 'portal', code: 'INSTANCE_DISABLED', companyId: A, missing: ['hse'] }]);
  });

  it('apagar en una empresa escribe solo esa empresa y deja la otra intacta', () => {
    const plan = computeModulePlan(
      stateWith('all'),
      request({ scope: 'company', companyId: A, changes: [{ key: 'gomeria', enabled: false }] })
    );
    expect(plan.applicable).toBe(true);
    expect(plan.effective).toEqual([
      { scope: 'company', companyId: A, key: 'gomeria', from: null, to: false, cause: 'requested' },
    ]);
    expect(plan.affectedCompanies).toBe(1);
  });

  it('apagar en una empresa también bloquea por dependientes, en ese ámbito', () => {
    const plan = computeModulePlan(
      stateWith('all'),
      request({ scope: 'company', companyId: A, changes: [{ key: 'mantenimiento', enabled: false }] })
    );
    expect(plan.blocked).toEqual([
      { key: 'mantenimiento', code: 'HAS_DEPENDENTS', companyId: A, dependents: ['gomeria'] },
    ]);
    expect(plan.cascadePreview).toEqual([
      { scope: 'company', companyId: A, key: 'gomeria', from: null, to: false, cause: 'cascade' },
    ]);
  });

  it('reencender en la empresa vuelve a heredar la instancia', () => {
    const state = stateWith('all', { [A]: { gomeria: false }, [B]: {} });
    expect(companyEnabledSet(state, A).has('gomeria')).toBe(false);
    const plan = computeModulePlan(
      state,
      request({ scope: 'company', companyId: A, changes: [{ key: 'gomeria', enabled: true }] })
    );
    expect(plan.effective).toEqual([
      { scope: 'company', companyId: A, key: 'gomeria', from: false, to: true, cause: 'requested' },
    ]);
  });

  it('un cambio en la instancia que dejaría a una empresa sin dependencias exige cascade', () => {
    // A apagó Empleados; si la instancia apaga Equipos, A se queda sin ninguno de los dos y pierde Documentación.
    const state = stateWith('all', {
      [A]: {
        empleados: false,
        seleccion: false,
        hse: false,
        portal: false,
        operaciones: false,
        certificacion: false,
        mantenimiento: false,
        gomeria: false,
        indumentaria: false,
        movil: false,
      },
      [B]: {},
    });
    const plan = computeModulePlan(state, request({ changes: [{ key: 'equipos', enabled: false }], cascade: false }));
    expect(plan.applicable).toBe(false);
    expect(plan.blocked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'HAS_DEPENDENTS', companyId: A, dependents: ['documentacion'] }),
      ])
    );
    const withCascade = computeModulePlan(
      state,
      request({ changes: [{ key: 'equipos', enabled: false }], cascade: true })
    );
    expect(withCascade.effective).toEqual(
      expect.arrayContaining([
        { scope: 'company', companyId: A, key: 'documentacion', from: null, to: false, cause: 'cascade' },
      ])
    );
  });

  it('encender en la instancia mantiene apagado en la empresa lo que no tiene sus dependencias', () => {
    const state = stateWith(
      { ...Object.fromEntries(SWITCHABLE_MODULE_KEYS.map((k) => [k, true])), indumentaria: false },
      { [A]: { almacenes: false, gomeria: false, compras: false, pagos: false }, [B]: {} }
    );
    const plan = computeModulePlan(state, request({ changes: [{ key: 'indumentaria', enabled: true }] }));
    expect(plan.applicable).toBe(true);
    expect(plan.effective).toEqual([
      { scope: 'instance', companyId: null, key: 'indumentaria', from: false, to: true, cause: 'requested' },
      { scope: 'company', companyId: A, key: 'indumentaria', from: null, to: false, cause: 'dependency' },
    ]);
  });
});

describe('plan de módulos: validación y versión', () => {
  it('rechaza el núcleo, claves desconocidas y empresas inexistentes', () => {
    const plan = computeModulePlan(
      stateWith('all'),
      request({
        changes: [
          { key: 'nucleo', enabled: false },
          { key: 'contabilidad', enabled: true },
        ],
      })
    );
    expect(plan.blocked).toEqual([
      { key: 'nucleo', code: 'CORE' },
      { key: 'contabilidad', code: 'UNKNOWN_KEY' },
    ]);
    expect(plan.applicable).toBe(false);
    const missing = computeModulePlan(
      stateWith('all'),
      request({ scope: 'company', companyId: '00000000-0000-4000-8000-0000000000ff', changes: [] })
    );
    expect(missing.blocked).toEqual([{ key: '*', code: 'COMPANY_NOT_FOUND' }]);
  });

  it('la versión del estado cambia con cualquier fila y no depende del orden', () => {
    const a = computeStateVersion(stateWith({ hse: true, gomeria: false }));
    const b = computeStateVersion(stateWith({ gomeria: false, hse: true }));
    expect(a).toBe(b);
    expect(computeStateVersion(stateWith({ hse: true, gomeria: true }))).not.toBe(a);
    expect(computeStateVersion(stateWith({ hse: true, gomeria: false }, { [A]: { hse: false } }))).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
