import { z } from 'zod';

/**
 * Habilitar el portal a un legajo. Lo usan el formulario del legajo (cliente) y la Server Action (servidor): vive en un
 * módulo sin directiva para que el objeto Zod exista de los dos lados.
 *
 * - `invitation`: se manda un enlace de un solo uso para que el empleado elija su contraseña.
 * - `temporary_password`: se genera una contraseña temporal que RR.HH. le entrega; al entrar la tiene que cambiar.
 * El correo es el usuario con el que entra (aun con contraseña temporal); si el legajo ya tiene usuario, se usa ese.
 */
export const portalAccessMethodSchema = z.enum(['invitation', 'temporary_password']);

export const enablePortalAccessSchema = z.object({
  employeeId: z.string().uuid('Legajo inválido'),
  method: portalAccessMethodSchema,
  email: z.string().trim().max(254, 'El correo es demasiado largo').email('Ingresá un correo válido').or(z.literal('')),
});

export type EnablePortalAccessInput = z.infer<typeof enablePortalAccessSchema>;
export type PortalAccessMethodInput = z.infer<typeof portalAccessMethodSchema>;
