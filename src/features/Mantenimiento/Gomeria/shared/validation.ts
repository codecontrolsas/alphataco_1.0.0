import { z } from 'zod';

/** Identificador que llega del cliente: se valida antes de tocar la base. */
export const uuidSchema = z.string().uuid('Identificador inválido');

/** Valida un input del cliente con zod y lanza con el primer mensaje legible (no el JSON de zod). */
export function parseInput<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Los datos enviados son inválidos');
  }
  return result.data;
}
