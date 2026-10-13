import { validarCUIL } from '@/lib/utils';
import { isCompanyCuitAvailable } from '@/shared/actions/company-validation.server';
import * as z from 'zod';

/** true si NO existe otra empresa con ese CUIT (validación asíncrona del form de empresa). */
const validateDuplicatedCuil = async (cuil: string) => {
  return isCompanyCuitAvailable(cuil);
};

const passwordSchema = z
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

export const registerSchema = z
  .object({
    firstname: z
      .string()
      .min(2, {
        message: 'El nombre debe tener al menos 2 caracteres.',
      })
      .max(20, {
        message: 'El nombre debe tener menos de 20 caracteres.',
      })
      .regex(/^[a-zA-Z ]+$/, {
        message: 'El nombre solo puede contener letras.',
      })
      .trim(),
    lastname: z
      .string()
      .min(2, {
        message: 'El apellido debe tener al menos 2 caracteres.',
      })
      .max(20, {
        message: 'El apellido debe tener menos de 20 caracteres.',
      })
      .regex(/^[a-zA-Z ]+$/, {
        message: 'El apellido solo puede contener letras.',
      })
      .trim(),
    email: z.string().email({ message: 'Email inválido' }),
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

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

export const companySchema = z.object({
  company_name: z
    .string({ required_error: 'El nombre de la compañía es requerido' })
    .min(2, {
      message: 'El nombre debe tener al menos 2 caracteres.',
    })
    .max(30, { message: 'La compañia debe tener menos de 30 caracteres.' }),
  company_cuit: z
    .string()
    .refine((value) => /^\d{11}$/.test(value), {
      message: 'El CUIT debe contener 11 números.',
    })
    .refine(
      (cuil) => {
        return validarCUIL(cuil);
      },
      { message: 'El CUIT es inválido' }
    )
    .refine(
      async (value) => {
        return await validateDuplicatedCuil(value);
      },
      {
        message: 'Ya existe una compañía con este CUIT.',
      }
    ),

  description: z
    .string()
    .min(3, {
      message: 'La descripción debe tener al menos 3 caracteres.',
    })
    .max(200, {
      message: 'La descripción debe tener menos de 200 caracteres.',
    }),
  website: z
    .string()
    .refine(
      (value) => {
        if (value === '') return true;

        const urlRegex = /^(?:(?:https?|ftp):\/\/)?(?:www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?].*)?$/i;

        return urlRegex.test(value);
      },
      {
        message: 'La URL proporcionada no es válida.',
      }
    )
    .optional(),
  contact_email: z.string().email({ message: 'Email inválido' }),
  contact_phone: z
    .string()
    .min(5, {
      message: 'El número de teléfono debe tener al menos 5 caracteres.',
    })
    .max(25, {
      message: 'El número de teléfono debe tener menos de 25 caracteres.',
    })
    .regex(/^\+?[0-9]{1,25}$/, {
      message: 'El número de teléfono debe contener solo números',
    })
    .refine((value) => /^\+?[0-9]{1,25}$/.test(value), {
      message: 'El número de teléfono debe contener solo números',
    }),
  address: z
    .string()
    .min(4, { message: 'Address debe tener al menos 4 caracteres.' })
    .max(50, {
      message: 'Address debe tener menos de 50 caracteres.',
    })
    .regex(/^[a-zA-Z0-9\s]*$/, {
      message: 'Address debe contener solo letras y números y tener hasta 50 caracteres',
    }),
  country: z.string().min(2, { message: 'Country debe tener al menos 2 caracteres.' }),
  province_id: z.string().min(1, { message: 'Province debe tener al menos 1 caracteres.' }),
  industry: z.string().min(2, { message: 'Industry debe tener al menos 2 caracteres.' }),
  city: z.string().min(1, { message: 'City debe tener al menos 1 caracteres.' }),
  company_logo: z.string().optional(),
  by_defect: z.boolean().optional(),
});

export const editCompanySchema = z.object({
  company_name: z
    .string({ required_error: 'El nombre de la compañía es requerido' })
    .min(2, {
      message: 'El nombre debe tener al menos 2 caracteres.',
    })
    .max(30, { message: 'La compañia debe tener menos de 30 caracteres.' }),
  company_cuit: z
    .string()
    .refine((value) => /^\d{11}$/.test(value), {
      message: 'El CUIT debe contener 11 números.',
    })
    .refine(
      (cuil) => {
        return validarCUIL(cuil);
      },
      { message: 'El CUIT es inválido' }
    )
    .refine((value) => {
      return new Promise(async (resolve, reject) => {
        try {
          const isDuplicated = await validateDuplicatedCuil(value);
          if (!isDuplicated) {
            resolve(true);
          } else {
            reject(new Error('Ya existe una compañía con este CUIT.'));
          }
        } catch (error) {
          reject(error);
        }
      });
    }),

  description: z
    .string()
    .min(3, {
      message: 'La descripción debe tener al menos 3 caracteres.',
    })
    .max(200, {
      message: 'La descripción debe tener menos de 200 caracteres.',
    }),
  website: z
    .string()
    .refine(
      (value) => {
        if (value === '') return true;

        const urlRegex = /^(?:(?:https?|ftp):\/\/)?(?:www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?].*)?$/i;

        return urlRegex.test(value);
      },
      {
        message: 'La URL proporcionada no es válida.',
      }
    )
    .optional(),
  contact_email: z.string().email({ message: 'Email inválido' }),
  contact_phone: z
    .string()
    .min(5, {
      message: 'El número de teléfono debe tener al menos 5 caracteres.',
    })
    .max(25, {
      message: 'El número de teléfono debe tener menos de 25 caracteres.',
    })
    .regex(/^\+?[0-9]{1,25}$/, {
      message: 'El número de teléfono debe contener solo números',
    })
    .refine((value) => /^\+?[0-9]{1,25}$/.test(value), {
      message: 'El número de teléfono debe contener solo números',
    }),
  address: z
    .string()
    .min(4, { message: 'Address debe tener al menos 4 caracteres.' })
    .max(50, {
      message: 'Address debe tener menos de 50 caracteres.',
    })
    .regex(/^[a-zA-Z0-9\s]*$/, {
      message: 'Address debe contener solo letras y números y tener hasta 50 caracteres',
    }),
  country: z.string().min(2, { message: 'Country debe tener al menos 2 caracteres.' }),
  province_id: z.string().min(1, { message: 'Province debe tener al menos 1 caracteres.' }),
  industry: z.string().min(2, { message: 'Industry debe tener al menos 2 caracteres.' }),
  city: z.string().min(1, { message: 'City debe tener al menos 1 caracteres.' }),
  company_logo: z.string().optional(),
  by_defect: z.boolean().optional(),
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

export const VehicleSchema =
  z.array(
    z.object({
      created_at: z.coerce.date(),
      picture: z.string().optional(),
      type_of_vehicle: z.number(),
      domain: z.string(),
      chassis: z.string(),
      engine: z.string(),
      serie: z.string(),
      intern_number: z.string(),
      year: z.string(),
      brand: z.number(),
      model: z.number(),
      is_active: z.boolean(),
      termination_date: z.null() || z.string(),
      reason_for_termination: z.null() || z.string(),
      user_id: z.string(),
      company_id: z.string(),
      id: z.string(),
      type: z.object({
        name: z.string(),
      }),
      status: z.string(),
      types_of_vehicles: z.object({ name: z.string() }),
      brand_vehicles: z.object({ name: z.string() }),
      model_vehicles: z.object({ name: z.string() }),
      condition: z.enum(['operativo', 'no operativo', 'en reparacion', 'operativo condicionado', 'en preparacion']),
      kilometer: z.string(),
    })
  ) || [];

export type Vehicle = z.infer<typeof VehicleSchema>;

export const customersSchema = z.object({
  company_name: z
    .string({ required_error: 'El nombre es requerido' })
    .min(2, {
      message: 'El nombre debe tener al menos 2 caracteres.',
    })
    .max(40, { message: 'EL nombre debe tener menos de 40 caracteres.' }),

  client_cuit: z
    .string({ required_error: 'El cuit es requerido' })
    .refine((value) => /^\d{11}$/.test(value), {
      message: 'El CUIT debe contener 11 números.',
    })
    .refine(
      (cuil) => {
        return validarCUIL(cuil);
      },
      { message: 'El CUIT es inválido' }
    ),

  address: z.string({ required_error: 'la calle es requerida' }).min(2, {
    message: 'La dirección debe tener al menos 2 caracteres.',
  }),

  client_phone: z
    .string({ required_error: 'El numero de teléfono es requerido' })
    .min(4, {
      message: 'El teléfono debe tener al menos 4 caracteres.',
    })
    .max(15, {
      message: 'El teléfono debe tener menos de 15 caracteres.',
    }),
  client_email: z
    .string()
    .email({
      message: 'Email inválido',
    })
    .optional(),
});

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

export const covenantSchema = z.object({
  name: z
    .string({ required_error: 'El nombre es requerido' })
    .min(2, {
      message: 'El nombre debe tener al menos 2 caracteres.',
    })
    .max(100, { message: 'EL nombre debe tener menos de 100 caracteres.' }),
  category: z.string().optional(),
});

export const dailyReportSchema = z
  .object({
    customer: z.string().min(1, 'El cliente es obligatorio'),
    services: z.string().min(1, 'El servicio es obligatorio'),
    item: z.string().min(1, 'El item es obligatorio'),
    employees: z.array(z.string()).optional(),
    equipment: z.array(z.string()).optional(),
    working_day: z.string().optional(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    status: z.string().optional(),
    description: z.string().optional(),
    document_path: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.working_day === 'por horario') {
        return data.start_time && data.end_time;
      }
      return true;
    },
    {
      message: 'Debe ingresar start_time y end_time si working_day es igual a "por horario".',
      path: ['start_time', 'end_time'],
    }
  );

// --- Schemas used only for type inference (consumed by store and legacy components) ---

const ProfileSchema = z.object({
  id: z.string(),
  role: z.string(),
  email: z.string(),
  avatar: z.string().nullable(),
  fullname: z.string(),
  created_at: z.coerce.date(),
  credential_id: z.string(),
});

const ShareCompanyUserSchema = z.object({
  id: z.string(),
  role: z.string(),
  profile: ProfileSchema,
  company_id: z.string(),
  created_at: z.coerce.date(),
  profile_id: z.string(),
});

const ContractorsSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.coerce.date(),
});

const ContractorEmployeeSchema = z.object({
  contractors: ContractorsSchema,
});

const BirthplaceSchema = z.object({
  name: z.string(),
});

const EmployeesSchema = z.object({
  id: z.string(),
  city: BirthplaceSchema,
  cuil: z.string(),
  file: z.string(),
  email: z.string(),
  phone: z.string(),
  gender: z.string(),
  status: z.string(),
  street: z.string(),
  picture: z.string().optional(),
  lastname: z.string(),
  province: BirthplaceSchema,
  firstname: z.string(),
  is_active: z.boolean(),
  birthplace: BirthplaceSchema,
  company_id: z.string(),
  created_at: z.coerce.date(),
  nationality: z.string(),
  postal_code: z.string(),
  allocated_to: z.array(z.string()),
  normal_hours: z.string(),
  document_type: z.string(),
  street_number: z.string(),
  marital_status: z.string(),
  document_number: z.string(),
  affiliate_status: z.null() || z.string(),
  company_position: z.string(),
  termination_date: z.null() || z.string(),
  type_of_contract: z.string(),
  workflow_diagram: BirthplaceSchema,
  date_of_admission: z.string(),
  level_of_education: z.string(),
  contractor_employee: z.array(ContractorEmployeeSchema),
  hierarchical_position: BirthplaceSchema,
  reason_for_termination: z.null() || z.string(),
});

const CompaniesEmployeeSchema = z.object({
  employees: EmployeesSchema,
});

const CitySchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const CompanySchema = z.array(
  z.object({
    id: z.string(),
    company_name: z.string(),
    description: z.string(),
    website: z.string(),
    contact_email: z.string(),
    contact_phone: z.string(),
    address: z.string(),
    city: CitySchema,
    country: z.string(),
    industry: z.string(),
    company_logo: z.string(),
    is_active: z.boolean(),
    company_cuit: z.string(),
    province_id: CitySchema,
    owner_id: ProfileSchema,
    by_defect: z.boolean(),
    share_company_users: z.array(ShareCompanyUserSchema) || null,
    companies_employees: z.array(CompaniesEmployeeSchema) || null,
  })
);
export type Company = z.infer<typeof CompanySchema>;

export const EquipoSchema = z
  .array(
    z.object({
      id: z.string(),
      created_at: z.coerce.date(),
      name: z.string(),
      applies: z.string(),
      multiresource: z.boolean(),
      mandatory: z.boolean(),
      explired: z.boolean(),
      special: z.boolean(),
      is_active: z.boolean(),
      description: z.union([z.null(), z.string()]),
      company_id: z.string().optional().nullable(),
      is_it_montlhy: z.boolean().optional().nullable(),
      private: z.boolean().optional().nullable(),
      down_document: z.boolean().optional().nullable(),
      type: z.object({
        name: z.string(),
      }),
      conditions: z
        .array(
          z.object({
            ids: z.array(z.string()),
            values: z.array(z.string()),
            is_relation: z.boolean(),
            property_key: z.string(),
            filter_column: z.string(),
            relation_type: z.string(),
            property_label: z.string(),
            relation_table: z.string(),
            reference_values: z.array(z.object({ id: z.string(), value: z.string() })),
            is_array_relation: z.boolean(),
            column_on_relation: z.string(),
            column_on_employees: z.string(),
          })
        )
        .optional(),
    })
  )
  .default([]);

export type Equipo = z.infer<typeof EquipoSchema>;

export const MandatoryDocumentsSchema = z.object({
  Persona: EquipoSchema,
  Equipos: EquipoSchema,
});
export type MandatoryDocuments = z.infer<typeof MandatoryDocumentsSchema>;

const CompanyIdSchema =
  z.object({
    id: z.string(),
    city: CitySchema,
    address: z.string(),
    country: z.string(),
    website: z.string(),
    industry: z.string(),
    owner_id: ProfileSchema,
    by_defect: z.boolean(),
    is_active: z.boolean(),
    description: z.string(),
    province_id: CitySchema,
    company_cuit: z.string(),
    company_logo: z.string(),
    company_name: z.string(),
    contact_email: z.string(),
    contact_phone: z.string(),
    companies_employees: z.array(CompaniesEmployeeSchema) || null,
    share_company_users: z.array(ShareCompanyUserSchema) || null,
  }) || undefined;

export const SharedCompaniesSchema = z.array(
  z.object({
    created_at: z.coerce.date(),
    profile_id: z.string(),
    company_id: CompanyIdSchema,
    role: z.string(),
    id: z.string(),
  })
);
export type SharedCompanies = z.infer<typeof SharedCompaniesSchema>;
