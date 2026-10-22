import { isValidCuit } from '@/shared/utils/cuit-text';
import { z } from 'zod';

/** Tipo de acceso elegido en el paso 2 del login del QR. */
export type MaintenanceLoginType = 'empleado' | 'invitado' | '';

export const equipmentSelectionSchema = z.object({
  equipment_id: z.string({ required_error: 'Debe seleccionar un equipo' }).min(1, 'Debe seleccionar un equipo'),
});

export type EquipmentSelectionValues = z.infer<typeof equipmentSelectionSchema>;

/**
 * Campos del login: los tres son opcionales en el shape y la obligatoriedad la decide
 * `loginType` en `buildCredentialsSchema`. El shape fijo evita que el tipo del formulario
 * cambie al cambiar de paso (empleado ↔ invitado).
 */
const credentialsShape = z.object({
  email: z.string().optional(),
  password: z.string().optional(),
  cuil: z.string().optional(),
});

export type CredentialsValues = z.infer<typeof credentialsShape>;

/**
 * Schema del login según el tipo de acceso: el invitado valida email y contraseña, el
 * empleado valida el CUIL. Mismos mensajes que la versión anterior en la página.
 */
export function buildCredentialsSchema(loginType: MaintenanceLoginType) {
  return credentialsShape.superRefine((values, ctx) => {
    if (loginType === 'invitado') {
      if (!values.email) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['email'],
          message: 'El correo electrónico es requerido.',
        });
      } else if (!z.string().email().safeParse(values.email).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['email'],
          message: 'El correo electrónico es inválido.',
        });
      }

      if (!values.password) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'La contraseña es requerida.' });
      } else if (values.password.length < 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: 'La contraseña debe tener al menos 6 caracteres.',
        });
      }
    }

    if (loginType === 'empleado') {
      if (!values.cuil) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cuil'], message: 'El CUIL es requerido.' });
      } else if (!isValidCuit(values.cuil)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cuil'], message: 'El CUIL es inválido' });
      }
    }
  });
}
