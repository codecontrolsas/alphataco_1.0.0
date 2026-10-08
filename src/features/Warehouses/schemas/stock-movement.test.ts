import { describe, expect, it } from 'vitest';
import {
  emptyStockMovementLine,
  parseSerialNumbers,
  stockMovementSchema,
  toStockMovementInput,
  type StockMovementFormValues,
  type StockMovementLineFormValues,
} from './stock-movement';

const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';
const M1 = '33333333-3333-4333-8333-333333333333';
const E1 = '44444444-4444-4444-8444-444444444444';
const U1 = '55555555-5555-4555-8555-555555555555';

function line(overrides: Partial<StockMovementLineFormValues> = {}): StockMovementLineFormValues {
  return { ...emptyStockMovementLine(), materialId: M1, quantity: '2', ...overrides };
}

function movement(overrides: Partial<StockMovementFormValues> = {}): StockMovementFormValues {
  return {
    type: 'ENTRY',
    warehouseId: W1,
    targetWarehouseId: '',
    occurredOn: new Date('2026-10-04T00:00:00'),
    reference: '',
    notes: '',
    destinationType: '',
    employeeId: '',
    vehicleId: '',
    otherEquipmentId: '',
    maintenanceOrderId: '',
    customerId: '',
    customerServiceId: '',
    lines: [line({ unitCost: '10' })],
    ...overrides,
  };
}

function issues(values: StockMovementFormValues): string[] {
  const result = stockMovementSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('stockMovementSchema', () => {
  it('acepta una entrada valida', () => {
    expect(issues(movement())).toEqual([]);
  });

  it('una entrada exige costo', () => {
    expect(issues(movement({ lines: [line({ unitCost: '' })] }))).toContain('lines.0.unitCost: Costo inválido (hasta 4 decimales)');
  });

  it('rechaza cantidad 0 y mas de 4 decimales', () => {
    expect(issues(movement({ lines: [line({ unitCost: '1', quantity: '0' })] }))).toContain(
      'lines.0.quantity: Tiene que ser mayor a 0'
    );
    expect(issues(movement({ lines: [line({ unitCost: '1', quantity: '1.12345' })] }))).toContain(
      'lines.0.quantity: Número inválido (hasta 4 decimales)'
    );
  });

  it('rechaza montos que no entran en la columna', () => {
    expect(issues(movement({ lines: [line({ unitCost: '123456789012' })] }))).toContain(
      'lines.0.unitCost: Costo inválido (hasta 4 decimales)'
    );
  });

  it('cantidad vacia pide la cantidad', () => {
    expect(issues(movement({ lines: [line({ unitCost: '1', quantity: '' })] }))).toContain('lines.0.quantity: Indicá la cantidad');
  });

  it('acepta coma decimal', () => {
    expect(issues(movement({ lines: [line({ unitCost: '10,5', quantity: '1,25' })] }))).toEqual([]);
  });

  it('una salida exige destino y su FK', () => {
    expect(issues(movement({ type: 'EXIT', lines: [line()] }))).toContain(
      'destinationType: Elegí a quién se imputa la salida'
    );
    expect(issues(movement({ type: 'EXIT', destinationType: 'EMPLOYEE', lines: [line()] }))).toContain(
      'employeeId: Requerido'
    );
    expect(issues(movement({ type: 'EXIT', destinationType: 'EMPLOYEE', employeeId: E1, lines: [line()] }))).toEqual([]);
  });

  it('una transferencia exige otro deposito', () => {
    expect(issues(movement({ type: 'TRANSFER', lines: [line()] }))).toContain(
      'targetWarehouseId: Elegí el depósito destino'
    );
    expect(issues(movement({ type: 'TRANSFER', targetWarehouseId: W1, lines: [line()] }))).toContain(
      'targetWarehouseId: El destino tiene que ser otro depósito'
    );
  });

  it('un ajuste exige motivo', () => {
    expect(issues(movement({ type: 'ADJUSTMENT', lines: [line()] }))).toContain(
      'notes: El motivo del ajuste es obligatorio'
    );
  });

  it('lote: entra con numero, sale con lote elegido', () => {
    expect(issues(movement({ lines: [line({ unitCost: '1', trackingType: 'BATCH' })] }))).toContain(
      'lines.0.batchNumber: Indicá el lote'
    );
    expect(
      issues(movement({ type: 'TRANSFER', targetWarehouseId: W2, lines: [line({ trackingType: 'BATCH' })] }))
    ).toContain('lines.0.batchId: Elegí el lote');
  });

  it('serie: entra con series sin repetir, sale con unidades', () => {
    expect(
      issues(movement({ lines: [line({ unitCost: '1', trackingType: 'SERIAL', serialNumbers: 'A\nB\nA' })] }))
    ).toContain('lines.0.serialNumbers: Series repetidas: A');
    expect(
      issues(movement({ type: 'TRANSFER', targetWarehouseId: W2, lines: [line({ trackingType: 'SERIAL' })] }))
    ).toContain('lines.0.unitIds: Elegí al menos una unidad');
  });

  it('serie no valida la cantidad tipeada (se deriva de las series)', () => {
    expect(
      issues(movement({ lines: [line({ unitCost: '1', trackingType: 'SERIAL', quantity: '', serialNumbers: 'A' })] }))
    ).toEqual([]);
  });
});

describe('toStockMovementInput', () => {
  it('descarta el destino fuera de una salida y los campos que no aplican al tipo de control', () => {
    const input = toStockMovementInput(
      movement({
        destinationType: 'EMPLOYEE',
        employeeId: E1,
        targetWarehouseId: W2,
        lines: [line({ unitCost: '10,5', batchId: U1, serialNumbers: 'X' })],
      })
    );
    expect(input.destinationType).toBeNull();
    expect(input.employeeId).toBeNull();
    expect(input.targetWarehouseId).toBeNull();
    expect(input.lines[0]).toMatchObject({ unitCost: '10.5', batchId: null, serialNumbers: [], unitIds: [] });
  });

  it('serializados: la cantidad es la cantidad de series o unidades', () => {
    const inbound = toStockMovementInput(
      movement({ lines: [line({ unitCost: '1', trackingType: 'SERIAL', serialNumbers: 'A, B; C' })] })
    );
    expect(inbound.lines[0]).toMatchObject({ quantity: '3', serialNumbers: ['A', 'B', 'C'] });

    const outbound = toStockMovementInput(
      movement({
        type: 'EXIT',
        destinationType: 'EMPLOYEE',
        employeeId: E1,
        lines: [line({ trackingType: 'SERIAL', unitIds: [U1] })],
      })
    );
    expect(outbound.lines[0]).toMatchObject({ quantity: '1', unitIds: [U1], unitCost: null });
  });

  it('cliente con contrato solo en salidas a cliente', () => {
    const input = toStockMovementInput(
      movement({ type: 'EXIT', destinationType: 'CUSTOMER', customerId: E1, customerServiceId: U1, lines: [line()] })
    );
    expect(input).toMatchObject({ destinationType: 'CUSTOMER', customerId: E1, customerServiceId: U1 });
  });
});

describe('parseSerialNumbers', () => {
  it('separa por linea, coma o punto y coma e ignora vacios', () => {
    expect(parseSerialNumbers(' A \n\nB,C;; D ')).toEqual(['A', 'B', 'C', 'D']);
  });
});
