
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
