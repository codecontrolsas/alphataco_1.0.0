import { describe, expect, it } from 'vitest';
import { deviationText, employeeDeviations, equipmentDeviations } from './resource-deviations';

describe('employeeDeviations', () => {
  it('devuelve vacío cuando ningún flag está prendido', () => {
    expect(
      employeeDeviations({
        is_duplicated: false,
        is_unassigned_to_client: false,
        has_no_diagram: false,
        is_non_work_day: false,
      })
    ).toEqual([]);
  });

  it('marca duplicated cuando el empleado está en varias filas', () => {
    expect(
      employeeDeviations({
        is_duplicated: true,
        is_unassigned_to_client: false,
        has_no_diagram: false,
        is_non_work_day: false,
      })
    ).toEqual([{ kind: 'duplicated', label: 'Duplicado', detail: 'Empleado asignado en múltiples filas' }]);
  });

  it('marca unassigned_to_client cuando no está afectado al cliente de la fila', () => {
    expect(
      employeeDeviations({
        is_duplicated: false,
        is_unassigned_to_client: true,
        has_no_diagram: false,
        is_non_work_day: false,
      })
    ).toEqual([{ kind: 'unassigned_to_client', label: 'No afectado', detail: 'No asignado al cliente de esta fila' }]);
  });

  it('marca no_diagram cuando no hay diagrama cargado para el día', () => {
    expect(
      employeeDeviations({
        is_duplicated: false,
        is_unassigned_to_client: false,
        has_no_diagram: true,
        is_non_work_day: false,
      })
    ).toEqual([{ kind: 'no_diagram', label: 'Sin diagrama', detail: 'Sin diagrama cargado para este día' }]);
  });

  it('marca non_work_day con el nombre del tipo de diagrama en el label', () => {
    expect(
      employeeDeviations({
        is_duplicated: false,
        is_unassigned_to_client: false,
        has_no_diagram: false,
        is_non_work_day: true,
        diagram_type_name: 'Franco',
      })
    ).toEqual([{ kind: 'non_work_day', label: 'Día no laboral', detail: 'Diagrama del día: Franco' }]);
  });

  it('usa "No laboral" cuando no llega diagram_type_name', () => {
    expect(
      employeeDeviations({
        is_duplicated: false,
        is_unassigned_to_client: false,
        has_no_diagram: false,
        is_non_work_day: true,
        diagram_type_name: null,
      })
    ).toEqual([{ kind: 'non_work_day', label: 'Día no laboral', detail: 'Diagrama del día: No laboral' }]);
  });

  it('semántica ADITIVA: devuelve TODOS los desvíos simultáneos, no sólo el de mayor prioridad', () => {
    const result = employeeDeviations({
      is_duplicated: true,
      is_unassigned_to_client: true,
      has_no_diagram: true,
      is_non_work_day: true,
      diagram_type_name: 'Franco',
    });
    expect(result.map((r) => r.kind)).toEqual(['duplicated', 'unassigned_to_client', 'no_diagram', 'non_work_day']);
    expect(result).toHaveLength(4);
  });
});

describe('equipmentDeviations', () => {
  it('devuelve vacío cuando no hay desvíos', () => {
    expect(
      equipmentDeviations({ is_duplicated: false, is_unassigned_to_client: false, condition: 'operativo' })
    ).toEqual([]);
  });

  it('devuelve vacío con condición null (sin dato no es desvío)', () => {
    expect(equipmentDeviations({ is_duplicated: false, is_unassigned_to_client: false, condition: null })).toEqual([]);
  });

  it('marca duplicated cuando el equipo está en varias filas', () => {
    expect(
      equipmentDeviations({ is_duplicated: true, is_unassigned_to_client: false, condition: 'operativo' })
    ).toEqual([{ kind: 'duplicated', label: 'Duplicado', detail: 'Asignado en múltiples filas del parte diario' }]);
  });

  it('marca not_operative con condición "no operativo"', () => {
    expect(
      equipmentDeviations({ is_duplicated: false, is_unassigned_to_client: false, condition: 'no operativo' })
    ).toEqual([{ kind: 'not_operative', label: 'No operativo', detail: 'Condición del equipo' }]);
  });

  it('marca under_repair con "en reparacion" o "en_reparacion"', () => {
    expect(
      equipmentDeviations({ is_duplicated: false, is_unassigned_to_client: false, condition: 'en reparacion' })
    ).toEqual([{ kind: 'under_repair', label: 'En reparación', detail: 'Condición del equipo' }]);
    expect(
      equipmentDeviations({ is_duplicated: false, is_unassigned_to_client: false, condition: 'en_reparacion' })
    ).toEqual([{ kind: 'under_repair', label: 'En reparación', detail: 'Condición del equipo' }]);
  });

  it('marca unassigned_to_client cuando no está afectado al cliente de la fila', () => {
    expect(
      equipmentDeviations({ is_duplicated: false, is_unassigned_to_client: true, condition: 'operativo' })
    ).toEqual([{ kind: 'unassigned_to_client', label: 'No afectado', detail: 'No asignado al cliente de esta fila' }]);
  });

  it('marca conditioned con "operativo condicionado"', () => {
    expect(
      equipmentDeviations({ is_duplicated: false, is_unassigned_to_client: false, condition: 'operativo condicionado' })
    ).toEqual([{ kind: 'conditioned', label: 'Condicionado', detail: 'Condición del equipo' }]);
  });

  it('marca in_preparation con "en preparacion" o "en_preparacion"', () => {
    expect(
      equipmentDeviations({ is_duplicated: false, is_unassigned_to_client: false, condition: 'en preparacion' })
    ).toEqual([{ kind: 'in_preparation', label: 'En preparación', detail: 'Condición del equipo' }]);
  });

  it('condición desconocida sin match específico: no agrega label de condición', () => {
    expect(
      equipmentDeviations({ is_duplicated: false, is_unassigned_to_client: false, condition: 'desconocido' })
    ).toEqual([]);
  });

  it('semántica ADITIVA: duplicado + no operativo + sin afectar, todos a la vez', () => {
    const result = equipmentDeviations({
      is_duplicated: true,
      is_unassigned_to_client: true,
      condition: 'no operativo',
    });
    expect(result.map((r) => r.kind)).toEqual(['duplicated', 'not_operative', 'unassigned_to_client']);
    expect(result).toHaveLength(3);
  });

  it('es case-insensitive con la condición', () => {
    expect(
      equipmentDeviations({ is_duplicated: false, is_unassigned_to_client: false, condition: 'NO OPERATIVO' })
    ).toEqual([{ kind: 'not_operative', label: 'No operativo', detail: 'Condición del equipo' }]);
  });
});

describe('deviationText', () => {
  it('junta el rótulo corto y el detalle largo', () => {
    const [entry] = employeeDeviations({
      is_duplicated: true,
      is_unassigned_to_client: false,
      has_no_diagram: false,
      is_non_work_day: false,
    });
    expect(deviationText(entry)).toBe('Duplicado — Empleado asignado en múltiples filas');
  });
});
