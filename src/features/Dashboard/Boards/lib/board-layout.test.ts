import { describe, expect, it } from 'vitest';
import { presetScopeLabel } from './board-layout';

const base = { isOwner: true, ownerName: null, persisted: true, template: null, visibility: 'private' as const };

describe('presetScopeLabel', () => {
  it('un predefinido sin guardar es «Predefinido»', () => {
    expect(presetScopeLabel({ ...base, persisted: false, template: 'resumen' })).toBe('Predefinido');
  });

  it('un predefinido guardado al crear otro preset sigue siendo «Predefinido» (no «Solo yo»)', () => {
    expect(presetScopeLabel({ ...base, template: 'resumen' })).toBe('Predefinido');
    expect(presetScopeLabel({ ...base, template: 'vencimientos' })).toBe('Predefinido');
  });

  it('un predefinido que el dueño compartió muestra el alcance elegido', () => {
    expect(presetScopeLabel({ ...base, template: 'resumen', visibility: 'company' })).toBe('Toda la organización');
  });

  it('un preset propio muestra su alcance', () => {
    expect(presetScopeLabel(base)).toBe('Solo yo');
    expect(presetScopeLabel({ ...base, visibility: 'users' })).toBe('Usuarios específicos');
  });

  it('un preset ajeno dice quién lo compartió', () => {
    expect(presetScopeLabel({ ...base, isOwner: false, ownerName: 'Ana', visibility: 'company' })).toBe(
      'Compartido por Ana'
    );
  });
});
