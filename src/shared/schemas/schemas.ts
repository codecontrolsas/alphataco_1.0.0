import * as z from 'zod';

export const passwordSchema = z
  .string()
  .min(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  .max(50, { message: 'La contraseña debe tener menos de 50 caracteres.' })
  .regex(/[A-Z]/, {
    message: 'La contraseña debe tener al menos una mayúscula.',
  })
  .regex(/[a-z]/, {
    message: 'La contraseña debe tener al menos una minúscula.',
  })
  .regex(/[0-9]/, { message: 'La contraseña debe tener al menos un número.' })
  .regex(/[^A-Za-z0-9]/, {
    message: 'La contraseña debe tener al menos un carácter especial.',
  });

/**
 * Ingreso. La contraseña sólo se exige NO vacía: la política de complejidad (`passwordSchema`)
 * rige al crearla o cambiarla. Aplicarla acá bloquearía a quien tiene una contraseña anterior a
 * la política y le mostraría las reglas antes de saber si el mail existe.
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, { message: 'Ingresá tu correo.' }).email({ message: 'Ingresá un correo válido.' }),
  password: z.string().min(1, { message: 'Ingresá tu contraseña.' }),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const recoveryPassSchema = z.object({
  email: z.string().email({ message: 'Email inválido' }),
});

export const changePassSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

export const SharedUser = z.object({
  email: z.string(),
  fullname: z.string(),
  role: z.string(),
  alta: z.date().or(z.string()),
  id: z.string(),
  img: z.string(),
  customerName: z.string().optional(),
});

export type SharedUser = z.infer<typeof SharedUser>;

export const contactSchema = z.object({
  contact_name: z
    .string({ required_error: 'El nombre es requerido' })
    .min(2, {
      message: 'El nombre debe tener al menos 2 caracteres.',
    })
    .max(40, { message: 'EL nombre debe tener menos de 40 caracteres.' }),

  contact_phone: z
    .string({ required_error: 'El numero de teléfono es requerido' })
    .min(4, {
      message: 'El teléfono debe tener al menos 4 caracteres.',
    })
    .max(15, {
      message: 'El teléfono debe tener menos de 15 caracteres.',
    }),
  contact_email: z
    .string()
    .email({
      message: 'Email inválido',
    })
    .optional(),
  contact_charge: z
    .string({ required_error: 'El cargo es requerido' })
    .min(4, {
      message: 'El cargo debe tener al menos 4 caracteres.',
    })
    .max(30, { message: 'EL cargo debe tener menos de 30 caracteres.' }),
  customer: z.string({ required_error: 'El cliente es requerido' }).optional(),
});
