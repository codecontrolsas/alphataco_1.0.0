import { describe, expect, it } from 'vitest';
import { buildTemplatePlan, type ExistingStructure } from './template-plan';
import {
  emptyItem,
  itemToColumns,
  kindFromColumns,
  parseOptions,
  slugifyCode,
  templateCodeFor,
  templateFormSchema,
  type TemplateFormValues,
} from './template-schema';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const I1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const I2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const FOREIGN = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const existing: ExistingStructure = {
  sections: [
    {
      id: S1,
      code: 'luces',
      items: [
        { id: I1, code: 'freno', input_type: 'select', options: ['B', 'M'] },
        { id: I2, code: 'km', input_type: 'number', options: null },
      ],
    },
    { id: S2, code: 'cabina', items: [] },
  ],
};

const item = (over: Partial<TemplateFormValues['sections'][number]['items'][number]> = {}) => ({
  ...emptyItem(),
  label: 'Ítem',
  ...over,
});

describe('códigos', () => {
  it('slug sin tildes ni símbolos y con respaldo', () => {
    expect(slugifyCode('Luces y Señalización (frente)', 'seccion')).toBe('luces_y_senalizacion_frente');
    expect(slugifyCode('¿¡!?', 'item')).toBe('item');
  });

  it('código de plantilla único por empresa', () => {
    expect(templateCodeFor('Checklist diario', [])).toBe('CHECKLIST-DIARIO');
    expect(templateCodeFor('Checklist diario', ['checklist-diario', 'CHECKLIST-DIARIO-2'])).toBe('CHECKLIST-DIARIO-3');
  });
});

describe('tipos de respuesta', () => {
  it('ida y vuelta entre el editor y las columnas', () => {
    expect(itemToColumns({ kind: 'bm', options: '', is_critical: true, double_side: true })).toEqual({
      input_type: 'select',
      options: ['B', 'M'],
      is_critical: true,
      requires_side_validation: true,
    });
    const opts = itemToColumns({
      kind: 'options',
      options: 'Lleno, Medio, , Lleno',
      is_critical: true,
      double_side: true,
    });
    expect(opts).toEqual({
      input_type: 'select',
      options: ['Lleno', 'Medio'],
      is_critical: false,
      requires_side_validation: false,
    });
    expect(kindFromColumns(opts)).toEqual({ kind: 'options', options: 'Lleno, Medio' });
    expect(kindFromColumns({ input_type: 'select', options: null }).kind).toBe('bm');
    expect(kindFromColumns({ input_type: 'legacy', options: null }).kind).toBe('bm');
    expect(kindFromColumns({ input_type: 'date', options: null }).kind).toBe('date');
  });

  it('una lista de opciones exige al menos dos', () => {
    expect(parseOptions(' a , b,a ')).toEqual(['a', 'b']);
    const result = templateFormSchema.safeParse({
      name: 'X',
      description: '',
      is_active: false,
      sections: [{ name: 'S', items: [item({ kind: 'options', options: 'Solo una' })] }],
    });
    expect(result.success).toBe(false);
  });
});

describe('buildTemplatePlan', () => {
  it('plantilla nueva: códigos únicos dentro de cada sección y orden por posición', () => {
    const result = buildTemplatePlan({
      sections: [
        { name: 'Luces', items: [item({ label: 'Freno' }), item({ label: 'Freno' })] },
        { name: 'Luces', items: [item({ label: 'Giro' })] },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.sections.map((s) => [s.code, s.order_index])).toEqual([
      ['luces', 0],
      ['luces_2', 1],
    ]);
    expect(result.plan.sections[0].items.map((i) => i.code)).toEqual(['freno', 'freno_2']);
  });

  it('conserva los códigos guardados y planifica las bajas sin respuestas', () => {
    const result = buildTemplatePlan(
      { sections: [{ id: S1, name: 'Luces (renombrada)', items: [item({ id: I1, label: 'Freno nuevo' })] }] },
      existing,
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.sections[0]).toMatchObject({ id: S1, code: 'luces', name: 'Luces (renombrada)' });
    expect(result.plan.sections[0].items[0]).toMatchObject({ id: I1, code: 'freno', label: 'Freno nuevo' });
    expect(result.plan.deleteSectionIds).toEqual([S2]);
    expect(result.plan.deleteItemIds).toEqual([I2]);
  });

  it('con respuestas: se puede agregar y reordenar, no quitar ni cambiar el tipo', () => {
    const sections = [
      { id: S2, name: 'Cabina', items: [item({ label: 'Nuevo' })] },
      {
        id: S1,
        name: 'Luces',
        items: [item({ id: I2, label: 'Km', kind: 'number' as const }), item({ id: I1, label: 'Freno' })],
      },
    ];
    expect(buildTemplatePlan({ sections }, existing, true).ok).toBe(true);

    const removed = buildTemplatePlan({ sections: sections.slice(1) }, existing, true);
    expect(removed).toMatchObject({ ok: false });

    const retyped = buildTemplatePlan(
      {
        sections: [
          sections[0],
          {
            id: S1,
            name: 'Luces',
            items: [item({ id: I2, label: 'Km', kind: 'text' }), item({ id: I1, label: 'Freno' })],
          },
        ],
      },
      existing,
      true
    );
    expect(retyped).toMatchObject({ ok: false });
  });

  it('rechaza ids ajenos a la plantilla o un ítem movido de sección', () => {
    expect(buildTemplatePlan({ sections: [{ id: FOREIGN, name: 'X', items: [item()] }] }, existing).ok).toBe(false);
    expect(buildTemplatePlan({ sections: [{ id: S2, name: 'Cabina', items: [item({ id: I1 })] }] }, existing).ok).toBe(
      false
    );
  });
});
