import { describe, expect, it } from 'vitest';
import {
  NO_DIAGRAM_ID,
  aggregateDiagramIndicators,
  aggregateEquipmentIndicators,
  groupServicesByClient,
  isNotOperative,
  percentage,
  summarizeFleet,
  summarizeServicesByType,
  type DiagramRowForIndicator,
  type ServiceRowForClient,
  type VehicleForIndicator,
} from './indicators';

function vehicle(id: string, condition: string | null, typeName: string | null): VehicleForIndicator {
  return { id, condition, type_vehicles_typeTotype: typeName === null ? null : { name: typeName } };
}

describe('isNotOperative', () => {
  it('reconoce las tres condiciones fuera de servicio', () => {
    expect(isNotOperative('no_operativo')).toBe(true);
    expect(isNotOperative('en_reparacion')).toBe(true);
    expect(isNotOperative('en_preparacion')).toBe(true);
  });

  it('cualquier otra condición (o ninguna) cuenta como operativa', () => {
    expect(isNotOperative('operativo')).toBe(false);
    expect(isNotOperative('operativo_condicionado')).toBe(false);
    expect(isNotOperative(null)).toBe(false);
  });
});

describe('percentage', () => {
  it('redondea a entero', () => {
    expect(percentage(1, 3)).toBe(33);
    expect(percentage(2, 3)).toBe(67);
  });

  it('devuelve 0 si el denominador es 0', () => {
    expect(percentage(5, 0)).toBe(0);
  });
});

describe('aggregateEquipmentIndicators', () => {
  it('separa disponibles de no disponibles por tipo', () => {
    const result = aggregateEquipmentIndicators(
      [vehicle('v1', 'operativo', 'Tractor'), vehicle('v2', 'en_reparacion', 'Tractor')],
      new Set()
    );

    expect(result).toEqual([
      {
        type_name: 'Tractor',
        type_color: null,
        available_units: 1,
        used_units: 0,
        not_available_units: 1,
        cancelled_units: 0,
      },
    ]);
  });

  it('un equipo fuera de servicio no cuenta como usado aunque esté en el parte', () => {
    const result = aggregateEquipmentIndicators([vehicle('v1', 'no_operativo', 'Tractor')], new Set(['v1']));

    expect(result[0].used_units).toBe(0);
    expect(result[0].not_available_units).toBe(1);
  });

  it('agrupa los equipos sin tipo bajo "Sin tipo"', () => {
    const result = aggregateEquipmentIndicators([vehicle('v1', 'operativo', null)], new Set());

    expect(result[0].type_name).toBe('Sin tipo');
  });

  it('ordena por flota total descendente', () => {
    const result = aggregateEquipmentIndicators(
      [
        vehicle('v1', 'operativo', 'Chasis'),
        vehicle('v2', 'operativo', 'Tractor'),
        vehicle('v3', 'operativo', 'Tractor'),
      ],
      new Set()
    );

    expect(result.map((item) => item.type_name)).toEqual(['Tractor', 'Chasis']);
  });
});

describe('summarizeFleet', () => {
  it('suma operativos y no disponibles de todos los tipos', () => {
    const totals = summarizeFleet([
      {
        type_name: 'A',
        type_color: null,
        available_units: 3,
        used_units: 1,
        not_available_units: 1,
        cancelled_units: 0,
      },
      {
        type_name: 'B',
        type_color: null,
        available_units: 2,
        used_units: 0,
        not_available_units: 4,
        cancelled_units: 0,
      },
    ]);

    expect(totals).toEqual({ operative: 5, notAvailable: 5, total: 10 });
  });

  it('devuelve ceros sin indicadores', () => {
    expect(summarizeFleet([])).toEqual({ operative: 0, notAvailable: 0, total: 0 });
  });
});

describe('aggregateDiagramIndicators', () => {
  function row(employeeId: string | null, typeId: string | null, name = 'Trabaja'): DiagramRowForIndicator {
    return {
      employee_id: employeeId,
      diagram_type: typeId,
      diagram_type_employees_diagram_diagram_typeTodiagram_type: { name, color: '#111111' },
    };
  }

  it('cuenta cada empleado una sola vez por tipo', () => {
    const result = aggregateDiagramIndicators([row('e1', 'd1'), row('e1', 'd1')], 1);

    expect(result).toEqual([
      { diagram_type_id: 'd1', diagram_type_name: 'Trabaja', diagram_type_color: '#111111', cantidad_empleados: 1 },
    ]);
  });

  it('agrega "Sin diagrama" con los activos que no tienen fila', () => {
    const result = aggregateDiagramIndicators([row('e1', 'd1')], 4);
    const none = result.find((item) => item.diagram_type_id === NO_DIAGRAM_ID);

    expect(none?.cantidad_empleados).toBe(3);
  });

  it('no agrega "Sin diagrama" si todos tienen diagrama', () => {
    const result = aggregateDiagramIndicators([row('e1', 'd1')], 1);

    expect(result.some((item) => item.diagram_type_id === NO_DIAGRAM_ID)).toBe(false);
  });

  it('descarta filas sin empleado o sin tipo de diagrama', () => {
    const result = aggregateDiagramIndicators(
      [
        row(null, 'd1'),
        { employee_id: 'e2', diagram_type: 'd1', diagram_type_employees_diagram_diagram_typeTodiagram_type: null },
      ],
      0
    );

    expect(result).toEqual([]);
  });

  it('ordena por cantidad descendente', () => {
    const result = aggregateDiagramIndicators(
      [row('e1', 'd1', 'Uno'), row('e2', 'd2', 'Dos'), row('e3', 'd2', 'Dos')],
      3
    );

    expect(result[0].diagram_type_name).toBe('Dos');
  });
});

describe('summarizeServicesByType', () => {
  it('calcula el porcentaje sobre el total', () => {
    const result = summarizeServicesByType([
      { type_service: 'mensual', _count: { id: 3 } },
      { type_service: 'adicional', _count: { id: 1 } },
    ]);

    expect(result).toEqual([
      { type_service: 'mensual', service_count: 3, percentage: 75 },
      { type_service: 'adicional', service_count: 1, percentage: 25 },
    ]);
  });

  it('agrupa los servicios sin tipo en «sin_tipo» y los cuenta en el total', () => {
    const result = summarizeServicesByType([
      { type_service: 'mensual', _count: { id: 1 } },
      { type_service: null, _count: { id: 1 } },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].percentage).toBe(50);
    expect(result[1]).toMatchObject({ type_service: 'sin_tipo', service_count: 1 });
  });
});

describe('groupServicesByClient', () => {
  function serviceRow(clientId: string | null, type: string | null, status: string | null): ServiceRowForClient {
    return {
      type_service: type,
      status,
      customers: clientId === null ? null : { id: clientId, name: `Cliente ${clientId}` },
    };
  }

  it('separa mensuales de adicionales y suma el total', () => {
    const result = groupServicesByClient([
      serviceRow('c1', 'mensual', 'pendiente'),
      serviceRow('c1', 'adicional', 'ejecutado'),
      serviceRow('c1', 'adicional_permanente', 'ejecutado'),
    ]);

    expect(result[0]).toMatchObject({ mensual_count: 1, adicional_count: 2, total_count: 3 });
  });

  it('acumula la distribución por estado y usa "sin_estado" cuando falta', () => {
    const result = groupServicesByClient([serviceRow('c1', 'mensual', null), serviceRow('c1', 'mensual', null)]);

    expect(result[0].status_distribution).toEqual([{ status: 'sin_estado', count: 2 }]);
  });

  it('agrupa las filas sin cliente en «Sin cliente»', () => {
    expect(groupServicesByClient([serviceRow(null, 'mensual', 'pendiente')])).toMatchObject([
      { client_name: 'Sin cliente', total_count: 1 },
    ]);
  });

  it('ordena por total descendente', () => {
    const result = groupServicesByClient([
      serviceRow('c1', 'mensual', 'pendiente'),
      serviceRow('c2', 'mensual', 'pendiente'),
      serviceRow('c2', 'mensual', 'pendiente'),
    ]);

    expect(result.map((client) => client.client_name)).toEqual(['Cliente c2', 'Cliente c1']);
  });
});
