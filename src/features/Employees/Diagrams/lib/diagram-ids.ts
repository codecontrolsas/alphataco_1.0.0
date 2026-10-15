import { z } from 'zod';

/**
 * UUID por formato (sin exigir bits de versión): los ids sembrados a mano no son v4 y `z.string().uuid()`
 * estricto los rechazaría. Alcanza para no mandar texto arbitrario a las consultas.
 */
export const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Identificador inválido');
