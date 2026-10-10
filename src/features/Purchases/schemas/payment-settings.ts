import { z } from 'zod';
import { AMOUNT_SCALE, parseScaled } from '@/features/Comercial/Facturacion/lib/invoice-math';

/**
 * Configuracion de pagos (spec Compras etapa 5 §2): regimenes de retencion y la situacion
 * impositiva del proveedor. Las cuentas y cajas se mudaron a Tesoreria (`Treasury/schemas/accounts`).
 * Modulo SIN directiva.
 */

export const WITHHOLDING_TAXES = ['GANANCIAS', 'IVA', 'IIBB', 'SUSS'] as const;
export type WithholdingTax = (typeof WITHHOLDING_TAXES)[number];

export const WITHHOLDING_TAX_LABELS: Record<WithholdingTax, string> = {
  GANANCIAS: 'Ganancias',
  IVA: 'IVA',
  IIBB: 'IIBB Neuquén',
  SUSS: 'SUSS',
};

export const WITHHOLDING_STATUS_LABELS = {
  SUBJECT: 'Sujeto a retención',
  NOT_REGISTERED: 'No inscripto',
  EXEMPT: 'Exento',
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Porcentaje 0..100 con hasta 4 decimales. */
const isPercent = (value: string, allowZero = true) => {
  const scaled = parseScaled(value, 4);
  return scaled !== null && (allowZero ? scaled >= BigInt(0) : scaled > BigInt(0)) && scaled <= BigInt(1_000_000);
};
const isAmount = (value: string) => {
  const scaled = parseScaled(value || '0', AMOUNT_SCALE);
  return scaled !== null && scaled >= BigInt(0);
};

export const withholdingRegimeFormSchema = z
  .object({
    tax: z.enum(WITHHOLDING_TAXES),
    code: z.string().trim().regex(/^\d{3}$/, 'El código de régimen tiene 3 dígitos'),
    description: z.string().trim().min(1, 'La descripción es obligatoria').max(120, 'Máximo 120 caracteres'),
    rateRegistered: z.string().trim(),
    rateUnregistered: z.string().trim(),
    monthlyExemptAmount: z.string().trim(),
    minimumWithholding: z.string().trim(),
    vatPercentage: z.string().trim(),
    scale: z.array(z.object({ from: z.string().trim(), to: z.string().trim(), fixed: z.string().trim(), rate: z.string().trim() })),
  })
  .superRefine((v, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    if (v.tax !== 'IVA' && !isPercent(v.rateRegistered)) issue(['rateRegistered'], 'Alícuota inválida (0 a 100, hasta 4 decimales)');
    if (v.rateUnregistered && !isPercent(v.rateUnregistered)) issue(['rateUnregistered'], 'Alícuota inválida (0 a 100, hasta 4 decimales)');
    if (!isAmount(v.monthlyExemptAmount)) issue(['monthlyExemptAmount'], 'Importe inválido');
    if (!isAmount(v.minimumWithholding)) issue(['minimumWithholding'], 'Importe inválido');
    if (v.tax === 'IVA' && !isPercent(v.vatPercentage || '', false)) issue(['vatPercentage'], 'Indicá el porcentaje del IVA a retener');
    v.scale.forEach((row, i) => {
      if (!isAmount(row.from) || (row.to && !isAmount(row.to)) || !isAmount(row.fixed) || !isPercent(row.rate)) {
        issue(['scale', i], 'Tramo inválido');
      }
    });
  });

export type WithholdingRegimeFormValues = z.infer<typeof withholdingRegimeFormSchema>;

const profileSchema = z.object({
  /** NONE = no aplica (se borra el perfil). */
  status: z.enum(['NONE', 'SUBJECT', 'NOT_REGISTERED', 'EXEMPT']),
  regimeId: z.string(),
  rate: z.string().trim(),
  exclusionPercentage: z.string().trim(),
  exclusionFrom: z.string().trim(),
  exclusionTo: z.string().trim(),
  exclusionCertificate: z.string().trim().max(60, 'Máximo 60 caracteres'),
});

export const withholdingProfilesFormSchema = z
  .object({
    profiles: z.object({ GANANCIAS: profileSchema, IVA: profileSchema, IIBB: profileSchema, SUSS: profileSchema }),
  })
  .superRefine((v, ctx) => {
    for (const tax of WITHHOLDING_TAXES) {
      const p = v.profiles[tax];
      const issue = (field: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: ['profiles', tax, field], message: `${WITHHOLDING_TAX_LABELS[tax]}: ${message}` });
      if (p.status === 'NONE' || p.status === 'EXEMPT') continue;
      if (tax !== 'IIBB' && !p.regimeId) issue('regimeId', 'elegí el régimen');
      if (tax === 'IIBB' && !p.regimeId && !p.rate) issue('rate', 'indicá la alícuota del padrón o el régimen');
      if (p.rate && !isPercent(p.rate)) issue('rate', 'alícuota inválida');
      if (p.exclusionPercentage) {
        if (!isPercent(p.exclusionPercentage, false)) issue('exclusionPercentage', 'porcentaje de exclusión inválido');
        if (!DATE_RE.test(p.exclusionFrom) || !DATE_RE.test(p.exclusionTo)) issue('exclusionFrom', 'indicá la vigencia de la exclusión');
        else if (p.exclusionTo < p.exclusionFrom) issue('exclusionTo', 'la vigencia termina antes de empezar');
      }
    }
  });

export type WithholdingProfilesFormValues = z.infer<typeof withholdingProfilesFormSchema>;
