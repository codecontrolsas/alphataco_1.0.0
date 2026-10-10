import { z } from 'zod';

/** Conceptos de los movimientos manuales. Módulo SIN directiva. */

export const TREASURY_CONCEPT_DIRECTIONS = ['IN', 'OUT', 'BOTH'] as const;

export const TREASURY_CONCEPT_DIRECTION_LABELS = {
  IN: 'Solo ingresos',
  OUT: 'Solo egresos',
  BOTH: 'Ingresos y egresos',
} as const;

export const treasuryConceptFormSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'Máximo 80 caracteres'),
  direction: z.enum(TREASURY_CONCEPT_DIRECTIONS),
});

export type TreasuryConceptFormValues = z.infer<typeof treasuryConceptFormSchema>;
