/**
 * Validación de un ciclo mensual (F.931, aporte sindical, plan de pago, recibos de sueldo). Módulo puro: lo usan la
 * pantalla y el servidor con la misma regla.
 *
 * Cruce: lo declarado (nómina / declaración jurada), la boleta (VEP o boleta de depósito) y el pago tienen que coincidir
 * al centavo; en F.931 y recibos, además, la cantidad declarada tiene que ser la del personal del período.
 */

export const CYCLE_KINDS = ['f931', 'sindical', 'plan_pago', 'recibos'] as const;
export type CycleKind = (typeof CYCLE_KINDS)[number];

export const CYCLE_KIND_UI: Record<
  CycleKind,
  { label: string; labelHint: string | null; declaration: string; needsSlip: boolean; needsHeadcount: boolean }
> = {
  f931: {
    label: 'F.931 (cargas sociales)',
    labelHint: null,
    declaration: 'Declaración jurada F.931',
    needsSlip: true,
    needsHeadcount: true,
  },
  sindical: {
    label: 'Aporte sindical',
    labelHint: 'Sindicato (ej.: Petroleros Privados)',
    declaration: 'Nómina de aportes',
    needsSlip: true,
    needsHeadcount: false,
  },
  plan_pago: {
    label: 'Plan de pago',
    labelHint: 'Número de plan',
    declaration: 'Detalle de la cuota',
    needsSlip: true,
    needsHeadcount: false,
  },
  recibos: {
    label: 'Recibos de sueldo',
    labelHint: null,
    declaration: 'Recibos firmados',
    needsSlip: false,
    needsHeadcount: true,
  },
};

export interface CycleCheckInput {
  kind: CycleKind;
  declaredHeadcount: number | null;
  declaredAmount: number | null;
  slipAmount: number | null;
  paidAmount: number | null;
  hasDeclaration: boolean;
  hasSlip: boolean;
  hasPayment: boolean;
  /** Personal activo en el período (nómina del sistema). */
  payrollHeadcount: number;
  /** Rechazos de clientes sin resolver. */
  openRejections: number;
}

export type CycleStatus = 'ok' | 'incomplete' | 'mismatch' | 'rejected';

export interface CycleCheck {
  status: CycleStatus;
  /** Qué falta o qué no coincide, en texto para mostrar. */
  issues: string[];
}

const money = (value: number) =>
  value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });

const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;

export function checkMonthlyCycle(input: CycleCheckInput): CycleCheck {
  const ui = CYCLE_KIND_UI[input.kind];
  const missing: string[] = [];
  const mismatches: string[] = [];

  if (!input.hasDeclaration) missing.push(`Falta cargar: ${ui.declaration}`);
  if (input.kind === 'recibos') {
    if (input.declaredHeadcount === null) missing.push('Falta la cantidad de recibos');
  } else {
    if (input.kind !== 'plan_pago' && input.declaredAmount === null) missing.push('Falta el monto declarado');
    if (ui.needsSlip && !input.hasSlip) missing.push('Falta cargar la boleta');
    if (input.slipAmount === null) missing.push('Falta el monto de la boleta');
    if (!input.hasPayment) missing.push('Falta cargar el comprobante de pago');
    if (input.paidAmount === null) missing.push('Falta el monto pagado');
  }
  if (input.kind === 'f931' && input.declaredHeadcount === null)
    missing.push('Falta la cantidad de empleados declarada');

  if (
    input.kind !== 'plan_pago' &&
    input.kind !== 'recibos' &&
    input.declaredAmount !== null &&
    input.slipAmount !== null
  ) {
    if (!sameAmount(input.declaredAmount, input.slipAmount)) {
      mismatches.push(
        `La boleta (${money(input.slipAmount)}) no coincide con lo declarado (${money(input.declaredAmount)})`
      );
    }
  }
  if (input.slipAmount !== null && input.paidAmount !== null && !sameAmount(input.slipAmount, input.paidAmount)) {
    mismatches.push(`El pago (${money(input.paidAmount)}) no coincide con la boleta (${money(input.slipAmount)})`);
  }
  if (ui.needsHeadcount && input.declaredHeadcount !== null && input.declaredHeadcount !== input.payrollHeadcount) {
    const what = input.kind === 'recibos' ? 'Recibos cargados' : 'Empleados declarados';
    mismatches.push(`${what}: ${input.declaredHeadcount}; nómina del período en el sistema: ${input.payrollHeadcount}`);
  }

  const issues = [...mismatches, ...missing];
  if (input.openRejections > 0) {
    return {
      status: 'rejected',
      issues: [
        `Rechazado por ${input.openRejections === 1 ? 'un cliente' : `${input.openRejections} clientes`}`,
        ...issues,
      ],
    };
  }
  if (mismatches.length > 0) return { status: 'mismatch', issues };
  if (missing.length > 0) return { status: 'incomplete', issues };
  return { status: 'ok', issues: [] };
}

export const CYCLE_STATUS_UI: Record<
  CycleStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  ok: { label: 'Validado', variant: 'success' },
  incomplete: { label: 'Incompleto', variant: 'secondary' },
  mismatch: { label: 'No coincide', variant: 'warning' },
  rejected: { label: 'Rechazado por cliente', variant: 'destructive' },
};
