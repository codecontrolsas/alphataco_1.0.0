import { describe, expect, it } from 'vitest';
import { toServiceItemFormValues, toggledActiveState, type ServiceItemFormSource } from './service-item-form';

const item: ServiceItemFormSource = {
  item_name: 'Hora hombre',
  item_description: 'Mano de obra',
  code_item: 'HH-01',
  item_number: '12',
  item_price: '1500.5',
  item_measure_units: 3,
  vat_rate_id: 5,
  is_active: true,
  needs_personnel: true,
  needs_equipment: false,
};

describe('toServiceItemFormValues', () => {
  it('reenvía todos los campos del item cuando no hay overrides', () => {
    expect(toServiceItemFormValues(item)).toEqual({
      item_name: 'Hora hombre',
      item_description: 'Mano de obra',
      code_item: 'HH-01',
      item_number: '12',
      item_price: '1500.5',
      item_measure_units: '3',
      vat_rate_id: '5',
      is_active: true,
      needs_personnel: true,
      needs_equipment: false,
    });
  });

  it('convierte la unidad de medida a string (el select la maneja como id de texto)', () => {
    expect(toServiceItemFormValues(item).item_measure_units).toBe('3');
  });

  it('trata is_active nulo como activo', () => {
    expect(toServiceItemFormValues({ ...item, is_active: null }).is_active).toBe(true);
  });

  it('aplica los overrides encima del item', () => {
    const values = toServiceItemFormValues(item, { is_active: false, item_price: '10' });
    expect(values.is_active).toBe(false);
    expect(values.item_price).toBe('10');
    expect(values.item_name).toBe('Hora hombre');
  });

  it('conserva los campos opcionales nulos sin convertirlos a string vacío', () => {
    const values = toServiceItemFormValues({ ...item, code_item: null, item_number: null });
    expect(values.code_item).toBeNull();
    expect(values.item_number).toBeNull();
  });
});

describe('toggledActiveState', () => {
  it('da de baja un item activo', () => {
    expect(toggledActiveState(true)).toBe(false);
  });

  it('da de alta un item inactivo', () => {
    expect(toggledActiveState(false)).toBe(true);
  });

  it('da de baja un item con is_active nulo (se muestra como activo)', () => {
    expect(toggledActiveState(null)).toBe(false);
  });
});
