import { NULL_FILTER_VALUE } from '@/shared/components/common/DataTable/helpers';
import { describe, expect, it } from 'vitest';
import { toFacetMap } from './table-facets';

describe('toFacetMap', () => {
  it('arma el mapa de counts por clave', () => {
    const map = toFacetMap([
      { key: 'a', count: 2 },
      { key: 'b', count: 1 },
    ]);

    expect(map.get('a')).toBe(2);
    expect(map.get('b')).toBe(1);
  });

  it('acumula las claves nulas bajo "Sin asignar"', () => {
    const map = toFacetMap([
      { key: null, count: 2 },
      { key: undefined, count: 3 },
    ]);

    expect(map.get(NULL_FILTER_VALUE)).toBe(5);
    expect(map.size).toBe(1);
  });
});
