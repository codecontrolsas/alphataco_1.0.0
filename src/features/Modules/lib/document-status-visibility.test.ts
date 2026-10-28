import { describe, expect, it } from 'vitest';
import {
  withDocumentStatusColumn,
  withDocumentStatusDefault,
  withDocumentStatusFacet,
} from './document-status-visibility';

describe('visibilidad del estado documental (documentacion apagado)', () => {
  const columns = [
    { id: 'select' },
    { id: 'status', accessorKey: 'status' },
    { accessorKey: 'status' },
    { id: 'file' },
  ];

  it('con el módulo encendido deja todo', () => {
    expect(withDocumentStatusColumn(columns, true)).toHaveLength(4);
    expect(withDocumentStatusFacet([{ columnId: 'status' }], true)).toHaveLength(1);
    expect(withDocumentStatusDefault(['status', 'hierarchy'], true)).toEqual(['status', 'hierarchy']);
  });

  it('con el módulo apagado saca la columna por id o por accessorKey, y solo esa', () => {
    expect(withDocumentStatusColumn(columns, false)).toEqual([{ id: 'select' }, { id: 'file' }]);
  });

  it('con el módulo apagado saca el filtro y el filtro visible por defecto', () => {
    expect(withDocumentStatusFacet([{ columnId: 'status' }, { columnId: 'hierarchy' }], false)).toEqual([
      { columnId: 'hierarchy' },
    ]);
    expect(withDocumentStatusDefault(['status', 'hierarchy'], false)).toEqual(['hierarchy']);
  });
});
