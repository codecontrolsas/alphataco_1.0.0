import { z } from 'zod';
import { STATEMENT_DATE_FORMATS, columnIndex } from '../lib/statement-parse';

/**
 * Conciliación bancaria (spec Tesorería etapa 4). Módulo SIN directiva: lo usan el diálogo de
 * importación, el panel de conciliación y las actions. Lo que depende de la base (estados,
 * importes iguales, cuentas) lo valida el servidor.
 */

export const MAX_STATEMENT_ROWS = 5000;

const column = z.string().trim().toUpperCase().refine((v) => columnIndex(v) !== null, 'Columna inválida (A, B, C…)');
const optionalColumn = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === '' || columnIndex(v) !== null, 'Columna inválida (A, B, C…)');

export const AMOUNT_MODES = ['SINGLE', 'SPLIT'] as const;

export const statementProfileSchema = z
  .object({
    headerRow: z.coerce.number().int('Fila inválida').min(0, 'Fila inválida').max(100, 'Fila inválida'),
    dateColumn: column,
    descriptionColumn: column,
    referenceColumn: optionalColumn,
    amountMode: z.enum(AMOUNT_MODES),
    amountColumn: optionalColumn,
    debitColumn: optionalColumn,
    creditColumn: optionalColumn,
    dateFormat: z.enum(STATEMENT_DATE_FORMATS),
    decimalSeparator: z.enum([',', '.']),
  })
  .superRefine((v, ctx) => {
    if (v.amountMode === 'SINGLE' && !v.amountColumn) ctx.addIssue({ code: 'custom', path: ['amountColumn'], message: 'Indicá la columna del importe' });
    if (v.amountMode === 'SPLIT') {
      if (!v.debitColumn) ctx.addIssue({ code: 'custom', path: ['debitColumn'], message: 'Indicá la columna de débitos' });
      if (!v.creditColumn) ctx.addIssue({ code: 'custom', path: ['creditColumn'], message: 'Indicá la columna de créditos' });
    }
  });
export type StatementProfileValues = z.infer<typeof statementProfileSchema>;

export const importStatementSchema = z.object({
  accountId: z.string().uuid('Elegí la cuenta bancaria'),
  fileName: z.string().trim().min(1, 'Elegí el archivo').max(200, 'Nombre de archivo demasiado largo'),
  profile: statementProfileSchema,
  rows: z
    .array(z.array(z.string().max(500, 'Celda demasiado larga')).max(60, 'Demasiadas columnas'))
    .min(1, 'El archivo no tiene filas')
    .max(MAX_STATEMENT_ROWS + 100, `El archivo tiene más de ${MAX_STATEMENT_ROWS} filas: partilo en varios`),
});
export type ImportStatementValues = z.infer<typeof importStatementSchema>;

export const matchLineSchema = z.object({ lineId: z.string().uuid('Línea inválida'), movementId: z.string().uuid('Elegí el movimiento') });
export type MatchLineValues = z.infer<typeof matchLineSchema>;

export const registerLineSchema = z.object({
  lineId: z.string().uuid('Línea inválida'),
  conceptId: z.string().uuid('Elegí el concepto'),
  description: z.string().trim().max(200, 'Máximo 200 caracteres'),
});
export type RegisterLineValues = z.infer<typeof registerLineSchema>;

export const ignoreLineSchema = z.object({
  lineId: z.string().uuid('Línea inválida'),
  reason: z.string().trim().min(1, 'Indicá el motivo').max(300, 'Máximo 300 caracteres'),
});
export type IgnoreLineValues = z.infer<typeof ignoreLineSchema>;

export const debitCheckLineSchema = z.object({ lineId: z.string().uuid('Línea inválida'), checkId: z.string().uuid('Elegí el cheque') });
export type DebitCheckLineValues = z.infer<typeof debitCheckLineSchema>;

export const BANK_LINE_STATUS_LABELS = {
  PENDING: 'Pendiente',
  MATCHED: 'Conciliada',
  CREATED: 'Registrada',
  IGNORED: 'Ignorada',
} as const;

/** Días de tolerancia de la conciliación automática (spec §3.2). */
export const AUTO_MATCH_DAYS = 3;
