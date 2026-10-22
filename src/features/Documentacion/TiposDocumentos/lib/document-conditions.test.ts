import { parseDocumentConditions } from '@/features/Documentacion/shared/compliance/applicability';
import { describe, expect, it } from 'vitest';
import { resourceMatchesConditions, type DocumentCondition } from './document-conditions';

const POSITION_A = '11111111-1111-4111-8111-111111111111';
const POSITION_B = '22222222-2222-4222-8222-222222222222';
const APTITUD_X = '33333333-3333-4333-8333-333333333333';
const APTITUD_Y = '44444444-4444-4444-8444-444444444444';

/** Condición simple (columna directa de employees). */
const byPosition: DocumentCondition = {
  kind: 'direct',
  propertyKey: 'company_position',
  filterColumn: 'company_position',
  ids: [POSITION_A, POSITION_B],
};

/** Condición M:M (tabla pivote empleado_aptitudes). */
const byAptitud: DocumentCondition = {
  kind: 'many_to_many',
  propertyKey: 'empleado_aptitudes',
  relationTable: 'empleado_aptitudes',
  filterColumn: 'aptitud_id',
  ids: [APTITUD_X],
};

describe('resourceMatchesConditions', () => {
  it('sin condiciones → aplica a todos los recursos', () => {
    expect(resourceMatchesConditions({ company_position: 'cualquiera' }, [])).toBe(true);
  });

  it('condición simple: el puesto coincide → true', () => {
    expect(resourceMatchesConditions({ company_position: POSITION_B }, [byPosition])).toBe(true);
  });

  it('condición simple: el puesto NO coincide (o es null) → false', () => {
    expect(resourceMatchesConditions({ company_position: 'otro' }, [byPosition])).toBe(false);
    expect(resourceMatchesConditions({ company_position: null }, [byPosition])).toBe(false);
    expect(resourceMatchesConditions({}, [byPosition])).toBe(false);
  });

  it('condición M:M: la aptitud está entre las filas de la pivote → true', () => {
    const employee = { empleado_aptitudes: [{ aptitud_id: APTITUD_Y }, { aptitud_id: APTITUD_X }] };
    expect(resourceMatchesConditions(employee, [byAptitud])).toBe(true);
  });

  it('condición M:M: la aptitud está ausente (pivote vacía o sin la relación cargada) → false', () => {
    expect(resourceMatchesConditions({ empleado_aptitudes: [{ aptitud_id: APTITUD_Y }] }, [byAptitud])).toBe(false);
    expect(resourceMatchesConditions({ empleado_aptitudes: [] }, [byAptitud])).toBe(false);
    expect(resourceMatchesConditions({}, [byAptitud])).toBe(false);
  });

  it('mezcla: TODAS las condiciones deben cumplirse (AND), no sólo la primera', () => {
    const conditions = [byPosition, byAptitud];
    // Cumple el puesto pero no la aptitud → evaluar sólo conditions[0] daría true; debe ser false.
    expect(
      resourceMatchesConditions(
        { company_position: POSITION_A, empleado_aptitudes: [{ aptitud_id: APTITUD_Y }] },
        conditions
      )
    ).toBe(false);
    // Cumple la aptitud pero no el puesto → false.
    expect(
      resourceMatchesConditions(
        { company_position: 'otro', empleado_aptitudes: [{ aptitud_id: APTITUD_X }] },
        conditions
      )
    ).toBe(false);
    // Cumple ambas → true.
    expect(
      resourceMatchesConditions(
        { company_position: POSITION_A, empleado_aptitudes: [{ aptitud_id: APTITUD_X }] },
        conditions
      )
    ).toBe(true);
  });

  it('columnas bigint (provincia, marca) se comparan como texto', () => {
    const byProvince: DocumentCondition = {
      kind: 'direct',
      propertyKey: 'province',
      filterColumn: 'province',
      ids: ['5'],
    };
    expect(resourceMatchesConditions({ province: BigInt(5) }, [byProvince])).toBe(true);
    expect(resourceMatchesConditions({ province: 6 }, [byProvince])).toBe(false);
  });
});

describe('parseDocumentConditions', () => {
  const rawJson = [
    {
      property_key: 'company_position',
      ids: [POSITION_A],
      relation_type: 'direct',
      relation_table: null,
      filter_column: 'company_position',
    },
    {
      property_key: 'empleado_aptitudes',
      ids: [APTITUD_X],
      relation_type: 'many_to_many',
      relation_table: 'empleado_aptitudes',
      filter_column: 'aptitud_id',
    },
    // Sin ids → se ignora (no restringe nada)
    { property_key: 'guild', ids: [], relation_type: 'direct', relation_table: null, filter_column: 'guild_id' },
    // Basura → se ignora
    'no-es-un-objeto',
    null,
  ];

  it('convierte el Json[] de document_types.conditions a condiciones discriminadas', () => {
    expect(parseDocumentConditions(rawJson)).toEqual([
      { kind: 'direct', propertyKey: 'company_position', filterColumn: 'company_position', ids: [POSITION_A] },
      {
        kind: 'many_to_many',
        propertyKey: 'empleado_aptitudes',
        relationTable: 'empleado_aptitudes',
        filterColumn: 'aptitud_id',
        ids: [APTITUD_X],
      },
    ]);
  });

  it("descarta ids vacíos (como `id IS NOT NULL AND id <> ''` en build_employee_where_alias) y la condición si no queda ninguno", () => {
    const withEmpty = [
      {
        property_key: 'company_position',
        ids: [POSITION_A, '', null],
        relation_type: 'direct',
        filter_column: 'company_position',
      },
      { property_key: 'guild', ids: ['', ''], relation_type: 'direct', filter_column: 'guild_id' },
    ];
    expect(parseDocumentConditions(withEmpty)).toEqual([
      { kind: 'direct', propertyKey: 'company_position', filterColumn: 'company_position', ids: [POSITION_A] },
    ]);
  });

  it('acepta el JSON como string y devuelve [] ante null o JSON inválido', () => {
    expect(parseDocumentConditions(JSON.stringify(rawJson))).toHaveLength(2);
    expect(parseDocumentConditions(null)).toEqual([]);
    expect(parseDocumentConditions('{no json')).toEqual([]);
    expect(parseDocumentConditions({ not: 'array' })).toEqual([]);
  });
});
