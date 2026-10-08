import { z } from 'zod';

/**
 * Schema del movimiento de stock. Lo usan el formulario (cliente) y la server action
 * (servidor): por eso vive en un modulo SIN directiva (regla del repo: un schema importado por
 * una action no puede estar en un archivo `'use client'`).
 *
 * Es PLANO a proposito: todos los campos de todos los tipos conviven y la validacion cruzada
 * la hace el `superRefine`. Modelar una union discriminada en React Hook Form obligaria a
 * remontar el form al cambiar de tipo y se perderia lo ya cargado. `toStockMovementInput`
 * lo traduce a la forma normalizada que recibe el motor.
 *
 * `trackingType` de cada linea lo completa el form al elegir el material. Viene del cliente,
 * asi que el motor NO confia en el: lo vuelve a leer de la base. Aca solo sirve para dar el
 * mensaje de validacion en el campo correcto.
 */

export const STOCK_MOVEMENT_TYPES = ['ENTRY', 'EXIT', 'TRANSFER', 'ADJUSTMENT'] as const;
export const STOCK_DESTINATION_TYPES = [
  'EMPLOYEE',
  'VEHICLE',
  'OTHER_EQUIPMENT',
  'MAINTENANCE_ORDER',
  'CUSTOMER',
] as const;
export const MATERIAL_TRACKING_TYPES = ['QUANTITY', 'SERIAL', 'BATCH'] as const;

export type StockMovementTypeValue = (typeof STOCK_MOVEMENT_TYPES)[number];
export type StockDestinationTypeValue = (typeof STOCK_DESTINATION_TYPES)[number];
export type MaterialTrackingTypeValue = (typeof MATERIAL_TRACKING_TYPES)[number];

/** Hasta 11 enteros y 4 decimales (`Decimal(15, 4)`), con punto o coma. */
export const DECIMAL_RE = /^\d{1,11}([.,]\d{1,4})?$/;

export function normalizeDecimal(value: string): string {
  return value.trim().replace(',', '.');
}

/** Separa los numeros de serie pegados en un textarea: uno por linea, coma o punto y coma. */
export function parseSerialNumbers(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Campo del form que guarda el recurso de cada tipo de destino. */
export const DESTINATION_FIELD = {
  EMPLOYEE: 'employeeId',
  VEHICLE: 'vehicleId',
  OTHER_EQUIPMENT: 'otherEquipmentId',
  MAINTENANCE_ORDER: 'maintenanceOrderId',
  CUSTOMER: 'customerId',
} as const;

/** Campos de destino que comparten la salida y el pedido de materiales. */
export const destinationFieldsSchema = {
  destinationType: z.enum(STOCK_DESTINATION_TYPES).or(z.literal('')),
  employeeId: z.string(),
  vehicleId: z.string(),
  otherEquipmentId: z.string(),
  maintenanceOrderId: z.string(),
  customerId: z.string(),
  customerServiceId: z.string(),
};

export type DestinationFormValues = { [K in keyof typeof destinationFieldsSchema]: z.infer<(typeof destinationFieldsSchema)[K]> };

/** El destino es obligatorio y su recurso tambien (salida y pedido). */
export function refineDestination(v: DestinationFormValues, issue: (path: (string | number)[], message: string) => void) {
  if (!v.destinationType) issue(['destinationType'], 'Elegí a quién se imputa la salida');
  else if (!v[DESTINATION_FIELD[v.destinationType]]) issue([DESTINATION_FIELD[v.destinationType]], 'Requerido');
}

const lineSchema = z.object({
  materialId: z.string().uuid({ message: 'Elegí un material' }),
  trackingType: z.enum(MATERIAL_TRACKING_TYPES),
  quantity: z.string(),
  unitCost: z.string(),
  /** Solo ajustes: si suma o resta stock. */
  adjustmentDirection: z.enum(['IN', 'OUT']),
  /** Lote existente (salidas, transferencias y ajustes que restan). */
  batchId: z.string(),
  /** Lote que entra (entradas y ajustes que suman): se crea o se reutiliza por numero. */
  batchNumber: z.string(),
  batchExpiresOn: z.date().optional(),
  /** Series que entran, en texto libre (ver `parseSerialNumbers`). */
  serialNumbers: z.string(),
  /** Unidades serializadas que salen. */
  unitIds: z.array(z.string().uuid()),
});

export const stockMovementSchema = z
  .object({
    type: z.enum(STOCK_MOVEMENT_TYPES),
    warehouseId: z.string().uuid({ message: 'Elegí un depósito' }),
    targetWarehouseId: z.string(),
    occurredOn: z.date({ required_error: 'La fecha es requerida', invalid_type_error: 'Fecha inválida' }),
    reference: z.string().trim().max(120, 'Máximo 120 caracteres'),
    notes: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
    ...destinationFieldsSchema,
    lines: z.array(lineSchema).min(1, 'Agregá al menos una línea'),
  })
  .superRefine((v, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

    if (v.type === 'TRANSFER') {
      if (!v.targetWarehouseId) issue(['targetWarehouseId'], 'Elegí el depósito destino');
      else if (v.targetWarehouseId === v.warehouseId) issue(['targetWarehouseId'], 'El destino tiene que ser otro depósito');
    }

    if (v.type === 'EXIT') refineDestination(v, issue);

    if (v.type === 'ADJUSTMENT' && !v.notes) issue(['notes'], 'El motivo del ajuste es obligatorio');

    v.lines.forEach((line, i) => {
      const inbound = isInboundLine(v.type, line.adjustmentDirection);

      if (line.trackingType !== 'SERIAL') {
        if (!line.quantity.trim()) issue(['lines', i, 'quantity'], 'Indicá la cantidad');
        else if (!DECIMAL_RE.test(line.quantity.trim())) issue(['lines', i, 'quantity'], 'Número inválido (hasta 4 decimales)');
        else if (Number(normalizeDecimal(line.quantity)) <= 0) issue(['lines', i, 'quantity'], 'Tiene que ser mayor a 0');
      }

      if (v.type === 'ENTRY' && !DECIMAL_RE.test(line.unitCost.trim())) {
        issue(['lines', i, 'unitCost'], 'Costo inválido (hasta 4 decimales)');
      }

      if (line.trackingType === 'BATCH') {
        if (inbound && !line.batchNumber.trim()) issue(['lines', i, 'batchNumber'], 'Indicá el lote');
        if (!inbound && !line.batchId) issue(['lines', i, 'batchId'], 'Elegí el lote');
      }

      if (line.trackingType === 'SERIAL') {
        if (inbound) {
          const serials = parseSerialNumbers(line.serialNumbers);
          if (serials.length === 0) issue(['lines', i, 'serialNumbers'], 'Cargá al menos un número de serie');
          const repeated = serials.filter((s, j) => serials.indexOf(s) !== j);
          if (repeated.length > 0) issue(['lines', i, 'serialNumbers'], `Series repetidas: ${[...new Set(repeated)].join(', ')}`);
        } else if (line.unitIds.length === 0) {
          issue(['lines', i, 'unitIds'], 'Elegí al menos una unidad');
        }
      }
    });
  });

export type StockMovementFormValues = z.infer<typeof stockMovementSchema>;
export type StockMovementLineFormValues = StockMovementFormValues['lines'][number];

/** Si la linea suma stock al deposito del movimiento. */
export function isInboundLine(type: StockMovementTypeValue, adjustmentDirection: 'IN' | 'OUT'): boolean {
  return type === 'ENTRY' || (type === 'ADJUSTMENT' && adjustmentDirection === 'IN');
}

export function emptyStockMovementLine(): StockMovementLineFormValues {
  return {
    materialId: '',
    trackingType: 'QUANTITY',
    quantity: '',
    unitCost: '',
    adjustmentDirection: 'OUT',
    batchId: '',
    batchNumber: '',
    batchExpiresOn: undefined,
    serialNumbers: '',
    unitIds: [],
  };
}

// ── Forma normalizada que recibe el motor ───────────────────────────────────

export interface StockMovementLineInput {
  materialId: string;
  /** Cantidad como string decimal normalizado. En serializados, la cantidad de series/unidades. */
  quantity: string;
  /** Solo entradas. */
  unitCost: string | null;
  /** Solo ajustes; en el resto lo deriva el motor del tipo. */
  adjustmentDirection: 'IN' | 'OUT' | null;
  batchId: string | null;
  batchNumber: string | null;
  batchExpiresOn: Date | null;
  serialNumbers: string[];
  unitIds: string[];
}

export interface StockMovementInput {
  type: StockMovementTypeValue;
  warehouseId: string;
  targetWarehouseId: string | null;
  occurredOn: Date;
  reference: string | null;
  notes: string | null;
  destinationType: StockDestinationTypeValue | null;
  employeeId: string | null;
  vehicleId: string | null;
  otherEquipmentId: string | null;
  maintenanceOrderId: string | null;
  customerId: string | null;
  customerServiceId: string | null;
  lines: StockMovementLineInput[];
}

const orNull = (value: string) => (value.trim() ? value.trim() : null);

export type DestinationInput = Pick<
  StockMovementInput,
  | 'destinationType'
  | 'employeeId'
  | 'vehicleId'
  | 'otherEquipmentId'
  | 'maintenanceOrderId'
  | 'customerId'
  | 'customerServiceId'
>;

/** Deja solo la FK del tipo de destino elegido (y el contrato si es un cliente). */
export function toDestinationInput(v: DestinationFormValues): DestinationInput {
  const destination = v.destinationType || null;
  const pick = (type: StockDestinationTypeValue, value: string) => (destination === type ? orNull(value) : null);
  return {
    destinationType: destination,
    employeeId: pick('EMPLOYEE', v.employeeId),
    vehicleId: pick('VEHICLE', v.vehicleId),
    otherEquipmentId: pick('OTHER_EQUIPMENT', v.otherEquipmentId),
    maintenanceOrderId: pick('MAINTENANCE_ORDER', v.maintenanceOrderId),
    customerId: pick('CUSTOMER', v.customerId),
    customerServiceId: destination === 'CUSTOMER' ? orNull(v.customerServiceId) : null,
  };
}

/**
 * Traduce el form (ya validado) a la entrada del motor: descarta los campos que no aplican al
 * tipo de movimiento ni al tipo de control de cada linea, para que el motor nunca reciba un
 * destino en una entrada o un lote en un material por cantidad.
 */
export function toStockMovementInput(v: StockMovementFormValues): StockMovementInput {
  return {
    type: v.type,
    warehouseId: v.warehouseId,
    targetWarehouseId: v.type === 'TRANSFER' ? orNull(v.targetWarehouseId) : null,
    occurredOn: v.occurredOn,
    reference: orNull(v.reference),
    notes: orNull(v.notes),
    ...toDestinationInput(v.type === 'EXIT' ? v : { ...v, destinationType: '' }),
    lines: v.lines.map((line) => {
      const inbound = isInboundLine(v.type, line.adjustmentDirection);
      const serialIn = line.trackingType === 'SERIAL' && inbound ? parseSerialNumbers(line.serialNumbers) : [];
      const unitsOut = line.trackingType === 'SERIAL' && !inbound ? line.unitIds : [];
      const quantity =
        line.trackingType === 'SERIAL' ? String(inbound ? serialIn.length : unitsOut.length) : normalizeDecimal(line.quantity);

      return {
        materialId: line.materialId,
        quantity,
        unitCost: v.type === 'ENTRY' ? normalizeDecimal(line.unitCost) : null,
        adjustmentDirection: v.type === 'ADJUSTMENT' ? line.adjustmentDirection : null,
        batchId: line.trackingType === 'BATCH' && !inbound ? orNull(line.batchId) : null,
        batchNumber: line.trackingType === 'BATCH' && inbound ? orNull(line.batchNumber) : null,
        batchExpiresOn: line.trackingType === 'BATCH' && inbound ? (line.batchExpiresOn ?? null) : null,
        serialNumbers: serialIn,
        unitIds: unitsOut,
      };
    }),
  };
}
