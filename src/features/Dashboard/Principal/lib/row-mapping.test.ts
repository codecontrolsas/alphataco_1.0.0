import { describe, expect, it } from 'vitest';
import { mapCustomers, mapEmployeesNotInReport, mapVehicleToResult, type EmployeeDiagramRow } from './row-mapping';

describe('mapCustomers', () => {
  it('devuelve los nombres de los clientes', () => {
    expect(mapCustomers([{ customers: { name: 'ACME' } }, { customers: { name: 'Otro' } }])).toEqual([
      { customer_name: 'ACME' },
      { customer_name: 'Otro' },
    ]);
  });

  it('descarta relaciones sin cliente o sin nombre', () => {
    expect(mapCustomers([{ customers: null }, { customers: { name: null } }])).toBeNull();
  });

  it('devuelve null sin relaciones', () => {
    expect(mapCustomers([])).toBeNull();
    expect(mapCustomers(null)).toBeNull();
  });
});

describe('mapVehicleToResult', () => {
  it('mapea la fila al DTO del diálogo', () => {
    const result = mapVehicleToResult({
      id: 'v1',
      domain: 'AA123BB',
      type_vehicles_typeTotype: { name: 'Tractor' },
      sub_type: { name: 'Pesado' },
      contractor_equipment: [{ customers: { name: 'ACME' } }],
    });

    expect(result).toEqual({
      vehicle_id: 'v1',
      domain: 'AA123BB',
      type_name: 'Tractor',
      sub_type_name: 'Pesado',
      customers: [{ customer_name: 'ACME' }],
    });
  });

  it('un dominio ausente sale como cadena vacía y el resto como null', () => {
    const result = mapVehicleToResult({
      id: 'v1',
      domain: null,
      type_vehicles_typeTotype: null,
      sub_type: null,
      contractor_equipment: [],
    });

    expect(result).toMatchObject({ domain: '', type_name: null, sub_type_name: null, customers: null });
  });
});

describe('mapEmployeesNotInReport', () => {
  function row(id: string, lastname = 'Perez'): EmployeeDiagramRow {
    return {
      employees: {
        id,
        firstname: 'Juan',
        lastname,
        cuil: '20-1-3',
        file: '1234',
        company_positions: { name: 'Chofer' },
        contractor_employee: [{ customers: { name: 'ACME' } }],
      },
      diagram_type_employees_diagram_diagram_typeTodiagram_type: { short_description: 'T', color: '#fff' },
    };
  }

  it('mapea el empleado con su legajo y su diagrama', () => {
    expect(mapEmployeesNotInReport([row('e1')])).toEqual([
      {
        employee_id: 'e1',
        firstname: 'Juan',
        lastname: 'Perez',
        cuil: '20-1-3',
        file_number: '1234',
        position_name: 'Chofer',
        diagram_short_description: 'T',
        diagram_color: '#fff',
        customers: [{ customer_name: 'ACME' }],
      },
    ]);
  });

  it('no repite un empleado con varias filas de diagrama', () => {
    expect(mapEmployeesNotInReport([row('e1'), row('e1')])).toHaveLength(1);
  });

  it('descarta filas sin empleado', () => {
    const orphan: EmployeeDiagramRow = {
      employees: null,
      diagram_type_employees_diagram_diagram_typeTodiagram_type: null,
    };

    expect(mapEmployeesNotInReport([orphan])).toEqual([]);
  });
});
