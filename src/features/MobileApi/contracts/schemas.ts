import { z } from 'zod';
import { changeRowResourcesSchema, changeRowStatusSchema } from '@/features/Operaciones/PartesDiarios/detail/use-cases/command-schemas';

/**
 * Contratos de entrada de `/api/mobile/v1` (congelados: solo cambios compatibles). Los cuerpos de comando salen de los
 * mismos esquemas que usa la Server Action de la web, sin `rowId` (viaja en la ruta).
 */
export const signInBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changeResourcesBodySchema = changeRowResourcesSchema.omit({ rowId: true });
export const changeStatusBodySchema = changeRowStatusSchema.omit({ rowId: true });
