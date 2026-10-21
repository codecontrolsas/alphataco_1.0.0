/**
 * Catálogos de ARCA (WSFEv1) como constantes. Las columnas de la base guardan el id numérico de
 * ARCA; estos mapas son la única traducción id → significado del sistema.
 *
 * Se contrastan contra los `FEParamGet*` reales con `node scripts/arca/smoke.ts diagnose`: si ARCA
 * difiere, manda ARCA y se corrige este archivo.
 *
 * Módulo puro (sin Next ni alias `@/`): lo importan la app, la UI y los scripts de node.
 */

export type VoucherLetter = 'A' | 'B' | 'C';
export type VoucherKind = 'invoice' | 'debit_note' | 'credit_note';

type CbteTypeInfo = {
  letter: VoucherLetter;
  kind: VoucherKind;
  label: string;
  /** Las FCE MiPyME quedan declaradas pero fuera de la v1. */
  enabled: boolean;
};

export const CBTE_TYPES = {
  1: { letter: 'A', kind: 'invoice', label: 'Factura A', enabled: true },
  2: { letter: 'A', kind: 'debit_note', label: 'Nota de Débito A', enabled: true },
  3: { letter: 'A', kind: 'credit_note', label: 'Nota de Crédito A', enabled: true },
  6: { letter: 'B', kind: 'invoice', label: 'Factura B', enabled: true },
  7: { letter: 'B', kind: 'debit_note', label: 'Nota de Débito B', enabled: true },
  8: { letter: 'B', kind: 'credit_note', label: 'Nota de Crédito B', enabled: true },
  11: { letter: 'C', kind: 'invoice', label: 'Factura C', enabled: true },
  12: { letter: 'C', kind: 'debit_note', label: 'Nota de Débito C', enabled: true },
  13: { letter: 'C', kind: 'credit_note', label: 'Nota de Crédito C', enabled: true },
  201: { letter: 'A', kind: 'invoice', label: 'Factura de Crédito Electrónica MiPyME A', enabled: false },
  202: { letter: 'A', kind: 'debit_note', label: 'Nota de Débito Electrónica MiPyME A', enabled: false },
  203: { letter: 'A', kind: 'credit_note', label: 'Nota de Crédito Electrónica MiPyME A', enabled: false },
  206: { letter: 'B', kind: 'invoice', label: 'Factura de Crédito Electrónica MiPyME B', enabled: false },
  207: { letter: 'B', kind: 'debit_note', label: 'Nota de Débito Electrónica MiPyME B', enabled: false },
  208: { letter: 'B', kind: 'credit_note', label: 'Nota de Crédito Electrónica MiPyME B', enabled: false },
  211: { letter: 'C', kind: 'invoice', label: 'Factura de Crédito Electrónica MiPyME C', enabled: false },
  212: { letter: 'C', kind: 'debit_note', label: 'Nota de Débito Electrónica MiPyME C', enabled: false },
  213: { letter: 'C', kind: 'credit_note', label: 'Nota de Crédito Electrónica MiPyME C', enabled: false },
} as const satisfies Record<number, CbteTypeInfo>;

export type CbteTypeId = keyof typeof CBTE_TYPES;

export function isCbteTypeId(value: number): value is CbteTypeId {
  return Object.prototype.hasOwnProperty.call(CBTE_TYPES, value);
}

/** Tipo de comprobante (no FCE) para una letra y una clase de comprobante. */
export function cbteTypeFor(letter: VoucherLetter, kind: VoucherKind): CbteTypeId {
  const entries: [string, CbteTypeInfo][] = Object.entries(CBTE_TYPES);
  const match = entries.find(([, info]) => info.enabled && info.letter === letter && info.kind === kind);
  if (!match) throw new Error(`Sin tipo de comprobante para ${letter}/${kind}`);
  return Number(match[0]) as CbteTypeId;
}

/** Tipos habilitados de una clase (factura, NC, ND), en orden de id. */
export function cbteTypesOfKind(kind: VoucherKind): CbteTypeId[] {
  const entries: [string, CbteTypeInfo][] = Object.entries(CBTE_TYPES);
  return entries.filter(([, info]) => info.enabled && info.kind === kind).map(([id]) => Number(id) as CbteTypeId);
}

/** Letras que emite cada condición frente al IVA del EMISOR. */
export const EMITTER_LETTERS = {
  responsable_inscripto: ['A', 'B'],
  monotributo: ['C'],
  exento: ['C'],
} as const satisfies Record<string, readonly VoucherLetter[]>;

/** Alícuotas de IVA (id ARCA → porcentaje como string decimal, para no perder precisión). */
export const VAT_RATES = {
  3: '0',
  4: '10.5',
  5: '21',
  6: '27',
  8: '5',
  9: '2.5',
} as const;

export type VatRateId = keyof typeof VAT_RATES;

export const DEFAULT_VAT_RATE_ID: VatRateId = 5;

export function isVatRateId(value: number): value is VatRateId {
  return Object.prototype.hasOwnProperty.call(VAT_RATES, value);
}

export const VAT_RATE_LABELS: Record<VatRateId, string> = {
  3: '0%',
  4: '10,5%',
  5: '21%',
  6: '27%',
  8: '5%',
  9: '2,5%',
};

/**
 * Condición frente al IVA del receptor (RG 5616, `CondicionIVAReceptorId`) y las letras de
 * comprobante que admite. La letra C la admiten todas (la emite un monotributista o exento).
 */
export const RECEIVER_VAT_CONDITIONS = {
  1: { label: 'IVA Responsable Inscripto', letters: ['A', 'C'] },
  4: { label: 'IVA Sujeto Exento', letters: ['B', 'C'] },
  5: { label: 'Consumidor Final', letters: ['B', 'C'] },
  6: { label: 'Responsable Monotributo', letters: ['A', 'C'] },
  7: { label: 'Sujeto No Categorizado', letters: ['B', 'C'] },
  8: { label: 'Proveedor del Exterior', letters: ['B', 'C'] },
  9: { label: 'Cliente del Exterior', letters: ['B', 'C'] },
  10: { label: 'IVA Liberado – Ley N° 19.640', letters: ['B', 'C'] },
  13: { label: 'Monotributista Social', letters: ['A', 'C'] },
  15: { label: 'IVA No Alcanzado', letters: ['B', 'C'] },
  16: { label: 'Monotributo Trabajador Independiente Promovido', letters: ['A', 'C'] },
} as const satisfies Record<number, { label: string; letters: readonly VoucherLetter[] }>;

export type ReceiverVatConditionId = keyof typeof RECEIVER_VAT_CONDITIONS;

export function isReceiverVatConditionId(value: number): value is ReceiverVatConditionId {
  return Object.prototype.hasOwnProperty.call(RECEIVER_VAT_CONDITIONS, value);
}

/** Condiciones de receptor habilitadas en la v1 (sin exterior: 8 y 9). */
export const ENABLED_RECEIVER_VAT_CONDITIONS: ReceiverVatConditionId[] = [1, 4, 5, 6, 7, 10, 13, 15, 16];

export const CONCEPTS = {
  1: 'Productos',
  2: 'Servicios',
  3: 'Productos y servicios',
} as const;

export type ConceptId = keyof typeof CONCEPTS;

/** Tipos de documento del receptor. La v1 solo emite a CUIT (80). */
export const DOC_TYPES = {
  80: 'CUIT',
  86: 'CUIL',
  96: 'DNI',
  99: 'Sin identificar',
} as const;

/** Moneda ISO (como la guardan contratos y certificaciones) → código de moneda ARCA. */
export const ARCA_CURRENCY_BY_ISO = {
  ARS: 'PES',
  USD: 'DOL',
  EUR: '060',
} as const;

export type SupportedCurrency = keyof typeof ARCA_CURRENCY_BY_ISO;

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return Object.prototype.hasOwnProperty.call(ARCA_CURRENCY_BY_ISO, value);
}
