import { describe, expect, it } from 'vitest';
import { parseDocumentConditions, resolveTypeScope, resourceMatchesConditions, typeAppliesTo } from './applicability';
import { COMPANY, OTHER_COMPANY, makeResource, makeType } from './fixtures.test-helpers';
import type { DocumentCondition } from './types';

const direct = (filterColumn: string, ids: string[], propertyKey = filterColumn): DocumentCondition => ({
  kind: 'direct',
  propertyKey,
  filterColumn,
  ids,
});
const m2m = (relationTable: string, filterColumn: string, ids: string[]): DocumentCondition => ({
  kind: 'many_to_many',
  propertyKey: relationTable,
  relationTable,
  filterColumn,
  ids,
});

describe('resolveTypeScope', () => {
  it('no especial → all', () => {
    expect(resolveTypeScope({ scope: { special: false, conditions: [{ ids: ['x'], filter_column: 'a' }] } })).toEqual({
      kind: 'all',
    });
  });

  it('especial sin condiciones (vacío / null / undefined / "[]") → all', () => {
    for (const conditions of [[], null, undefined, '[]', '']) {
      expect(resolveTypeScope({ scope: { special: true, conditions } })).toEqual({ kind: 'all' });
    }
  });

  it('especial con condiciones cargadas pero todas inválidas → none', () => {
    const conditions = [
      { ids: [], filter_column: 'company_position' },
      { ids: [null, ''], filter_column: 'guild' },
      'x',
      {},
    ];
    expect(resolveTypeScope({ scope: { special: true, conditions } })).toEqual({ kind: 'none' });
    expect(resolveTypeScope({ scope: { special: true, conditions: 'no es json' } })).toEqual({ kind: 'none' });
  });

  it('especial con al menos una condición válida → conditions', () => {
    const scope = resolveTypeScope({
      scope: {
        special: true,
        conditions: [
          { ids: [], filter_column: 'a' },
          { ids: ['p1'], filter_column: 'company_position' },
        ],
      },
    });
    expect(scope).toEqual({ kind: 'conditions', conditions: [direct('company_position', ['p1'])] });
  });

  it('acepta el JSON como string', () => {
    const scope = resolveTypeScope({
      scope: { special: true, conditions: JSON.stringify([{ ids: ['p1'], filter_column: 'guild' }]) },
    });
    expect(scope.kind).toBe('conditions');
  });
});

describe('parseDocumentConditions', () => {
  it('distingue M:M de directas y usa filter_column como property_key por defecto', () => {
    const parsed = parseDocumentConditions([
      {
        ids: ['a'],
        filter_column: 'aptitud_id',
        property_key: 'empleado_aptitudes',
        relation_type: 'many_to_many',
        relation_table: 'empleado_aptitudes',
      },
      { ids: [7], filter_column: 'province' },
    ]);
    expect(parsed).toEqual([m2m('empleado_aptitudes', 'aptitud_id', ['a']), direct('province', ['7'])]);
  });
});

describe('resourceMatchesConditions', () => {
  it('sin condiciones → true', () => {
    expect(resourceMatchesConditions(makeResource(), [])).toBe(true);
  });

  it('OR dentro de los ids', () => {
    const c = [direct('company_position', ['A', 'B'])];
    expect(resourceMatchesConditions(makeResource({ direct: { company_position: 'B' } }), c)).toBe(true);
    expect(resourceMatchesConditions(makeResource({ direct: { company_position: 'C' } }), c)).toBe(false);
    expect(resourceMatchesConditions(makeResource({ direct: { company_position: null } }), c)).toBe(false);
    expect(resourceMatchesConditions(makeResource(), c)).toBe(false);
  });

  it('AND entre objetos de condición', () => {
    const c = [direct('company_position', ['A']), direct('guild', ['G'])];
    expect(resourceMatchesConditions(makeResource({ direct: { company_position: 'A', guild: 'G' } }), c)).toBe(true);
    expect(resourceMatchesConditions(makeResource({ direct: { company_position: 'A', guild: 'X' } }), c)).toBe(false);
    expect(resourceMatchesConditions(makeResource({ direct: { company_position: 'X', guild: 'G' } }), c)).toBe(false);
  });

  it('dos objetos con el mismo property_key se combinan con AND (no se agrupan)', () => {
    const c = [direct('company_position', ['A'], 'position'), direct('company_position', ['B'], 'position')];
    expect(resourceMatchesConditions(makeResource({ direct: { company_position: 'A' } }), c)).toBe(false);
    expect(resourceMatchesConditions(makeResource({ direct: { company_position: 'B' } }), c)).toBe(false);
  });

  it('M:M: clientes, aptitudes y sectores de taller (alguna fila coincide)', () => {
    const resource = makeResource({
      relations: {
        contractor_employee: ['cli-1', 'cli-2'],
        empleado_aptitudes: ['apt-1'],
        employee_workshop_sectors: ['sec-1'],
      },
    });
    expect(resourceMatchesConditions(resource, [m2m('contractor_employee', 'contractor_id', ['cli-2', 'cli-9'])])).toBe(
      true
    );
    expect(resourceMatchesConditions(resource, [m2m('contractor_employee', 'contractor_id', ['cli-9'])])).toBe(false);
    expect(resourceMatchesConditions(resource, [m2m('empleado_aptitudes', 'aptitud_id', ['apt-1'])])).toBe(true);
    expect(resourceMatchesConditions(resource, [m2m('employee_workshop_sectors', 'sector_id', ['sec-2'])])).toBe(false);
    expect(
      resourceMatchesConditions(resource, [
        m2m('contractor_employee', 'contractor_id', ['cli-1']),
        m2m('empleado_aptitudes', 'aptitud_id', ['apt-9']),
      ])
    ).toBe(false);
  });

  it('M:M con lista vacía no coincide', () => {
    const resource = makeResource({ relations: { contractor_employee: [] } });
    expect(resourceMatchesConditions(resource, [m2m('contractor_employee', 'contractor_id', ['x'])])).toBe(false);
  });

  it('relación desconocida falla cerrada y no explota', () => {
    const c = [m2m('tabla_que_no_existe', 'col', ['x'])];
    expect(() => resourceMatchesConditions(makeResource(), c)).not.toThrow();
    expect(resourceMatchesConditions(makeResource(), c)).toBe(false);
  });

  it('compara como texto (bigint llega como string)', () => {
    const c = [direct('province', ['5'])];
    expect(resourceMatchesConditions(makeResource({ direct: { province: '5' } }), c)).toBe(true);
    expect(resourceMatchesConditions(makeResource({ direct: { province: '6' } }), c)).toBe(false);
    // los ids numéricos del JSON también se leen como texto
    const [parsed] = parseDocumentConditions([{ ids: [5], filter_column: 'province' }]);
    expect(resourceMatchesConditions(makeResource({ direct: { province: '5' } }), [parsed])).toBe(true);
  });
});

describe('typeAppliesTo', () => {
  it('tipo normal activo, global, a recurso activo → true', () => {
    expect(typeAppliesTo(makeType(), makeResource())).toBe(true);
  });

  it('tipo inactivo → false', () => {
    expect(typeAppliesTo(makeType({ isActive: false }), makeResource())).toBe(false);
  });

  it('applies distinto → false', () => {
    expect(typeAppliesTo(makeType({ applies: 'Equipos' }), makeResource({ applies: 'Persona' }))).toBe(false);
    expect(typeAppliesTo(makeType({ applies: 'Equipos' }), makeResource({ applies: 'Equipos' }))).toBe(true);
  });

  it('global vs de la empresa vs de otra empresa', () => {
    expect(typeAppliesTo(makeType({ companyId: null }), makeResource())).toBe(true);
    expect(typeAppliesTo(makeType({ companyId: COMPANY }), makeResource())).toBe(true);
    expect(typeAppliesTo(makeType({ companyId: OTHER_COMPANY }), makeResource())).toBe(false);
  });

  it('baja con down_document → true; baja sin down_document → false', () => {
    const baja = makeResource({ isActive: false });
    expect(typeAppliesTo(makeType({ downDocument: true }), baja)).toBe(true);
    expect(typeAppliesTo(makeType({ downDocument: false }), baja)).toBe(false);
  });

  it('activo con down_document → false', () => {
    expect(typeAppliesTo(makeType({ downDocument: true }), makeResource({ isActive: true }))).toBe(false);
  });

  it('especial: sin condiciones aplica a todos; todas inválidas a nadie; con condiciones, según el recurso', () => {
    const all = makeType({ scope: { special: true, conditions: [] } });
    const none = makeType({ scope: { special: true, conditions: [{ ids: [], filter_column: 'guild' }] } });
    const cond = makeType({ scope: { special: true, conditions: [{ ids: ['G'], filter_column: 'guild' }] } });
    expect(typeAppliesTo(all, makeResource())).toBe(true);
    expect(typeAppliesTo(none, makeResource())).toBe(false);
    expect(typeAppliesTo(cond, makeResource({ direct: { guild: 'G' } }))).toBe(true);
    expect(typeAppliesTo(cond, makeResource({ direct: { guild: 'H' } }))).toBe(false);
  });
});
