import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import {
  cost_type_enum,
  document_type_enum,
  gender_enum,
  level_of_education_enum,
  marital_status_enum,
  nationality_enum,
} from '@/generated/prisma/enums';
import { argentinaDate } from '@/shared/lib/argentina-time';
import moment from 'moment';
import type { z } from 'zod';
import type { EmployeeFormData } from '../schemas/employee-schema';

/**
 * Piezas compartidas por el alta (`createEmployeeCore`) y la edición (`updateEmployee`):
 * parseo del payload, armado EXPLÍCITO de los datos de Prisma, validación de que los ids de
 * catálogo pertenezcan a la empresa activa y traducción de los errores de unicidad.
 *
 * Nada de `...data`: lo que el cliente manda nunca se esparce sobre la fila, así un payload
 * manipulado no puede escribir `company_id`, `status`, `is_active`, `full_name`, etc.
 */

/** Parsea con Zod y, si falla, lanza el primer mensaje (en español) en vez del ZodError crudo. */
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Los datos del formulario son inválidos');
  }
  return result.data;
}

function parseEnum<T extends Record<string, string>>(enumObject: T, value: string, label: string): T[keyof T] {
  const allowed: readonly string[] = Object.values(enumObject);
  if (!allowed.includes(value)) throw new Error(`${label} inválido`);
  return value as T[keyof T];
}

/** `''` → `null` (columna FK/texto vacía); `undefined` queda igual (Prisma lo omite). */
function blankToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() === '' ? null : value;
}

/** Fecha de ingreso como `Date` de calendario (medianoche UTC, lo que espera `@db.Date`). */
export function parseAdmissionDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  if (!moment.utc(value, 'YYYY-MM-DD', true).isValid()) throw new Error('Fecha de ingreso inválida');
  return new Date(`${value}T00:00:00.000Z`);
}

/** Datos escalares del legajo, construidos campo por campo desde el payload ya parseado. */
export function buildEmployeeScalars(data: EmployeeFormData) {
  return {
    firstname: data.firstname,
    lastname: data.lastname,
    cuil: data.cuil,
    document_number: data.document_number,
    born_date: data.born_date,
    birthplace: data.birthplace,
    street: data.street,
    street_number: data.street_number,
    province: BigInt(data.province),
    city: BigInt(data.city),
    postal_code: data.postal_code,
    phone: data.phone,
    email: data.email,
    file: data.file,
    // Enums: el formulario manda strings; se validan contra los valores reales antes de llegar a Prisma.
    nationality: parseEnum(nationality_enum, data.nationality, 'Nacionalidad'),
    document_type: parseEnum(document_type_enum, data.document_type, 'Tipo de documento'),
    gender: parseEnum(gender_enum, data.gender, 'Sexo'),
    marital_status: parseEnum(marital_status_enum, data.marital_status, 'Estado civil'),
    level_of_education: parseEnum(level_of_education_enum, data.level_of_education, 'Nivel de instrucción'),
    cost_type: data.cost_type ? parseEnum(cost_type_enum, data.cost_type, 'Tipo de costo') : undefined,
    // `''` es "quitar la foto"; `undefined` deja la actual.
    picture: blankToNull(data.picture),
    normal_hours: blankToNull(data.normal_hours),
    hierarchical_position: data.hierarchical_position,
    company_position: data.company_position,
    workflow_diagram: data.workflow_diagram,
    type_of_contract: blankToNull(data.type_of_contract),
    guild_id: blankToNull(data.guild_id),
    covenants_id: blankToNull(data.covenants_id),
    category_id: blankToNull(data.category_id),
    cost_center_id: blankToNull(data.cost_center_id),
  };
}

/** Fecha de ingreso del alta: la del formulario o, si falta, hoy en hora argentina (columna NOT NULL). */
export function admissionDateForCreate(value: string | undefined): Date {
  return parseAdmissionDate(value) ?? new Date(`${argentinaDate()}T00:00:00.000Z`);
}

/** Ids de las relaciones que el payload referencia y que deben ser de la empresa activa. */
export interface EmployeeRelationIds {
  data: EmployeeFormData;
  contractorIds?: readonly string[];
  aptitudeIds?: readonly string[];
  workshopSectorIds?: readonly string[];
}

type CatalogReader = Pick<
  Prisma.TransactionClient,
  | 'hierarchy'
  | 'company_positions'
  | 'work_diagram'
  | 'types_of_contract'
  | 'guild'
  | 'covenant'
  | 'category'
  | 'cost_center'
  | 'customers'
  | 'aptitudes_tecnicas'
  | 'workshop_sectors'
  | 'countries'
  | 'provinces'
  | 'cities'
>;

function unique(ids: ReadonlyArray<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/**
 * Los ids del payload llegan del cliente: antes de escribirlos se comprueba que existan y sean
 * de la empresa activa (un id de otra empresa, o inventado, rompería el perímetro o la FK con un
 * error crudo). Los catálogos globales (países, provincias, ciudades) se validan por existencia.
 */
export async function assertEmployeeRefsAllowed(
  reader: CatalogReader,
  companyId: string,
  refs: EmployeeRelationIds
): Promise<void> {
  const { data } = refs;
  const checks: Array<{ label: string; ids: string[]; count: (ids: string[]) => Promise<number> }> = [
    {
      label: 'Sector',
      ids: unique([data.hierarchical_position]),
      count: (ids) => reader.hierarchy.count({ where: { id: { in: ids }, company_id: companyId } }),
    },
    {
      label: 'Puesto',
      ids: unique([data.company_position]),
      count: (ids) => reader.company_positions.count({ where: { id: { in: ids }, company_id: companyId } }),
    },
    {
      label: 'Diagrama de trabajo',
      ids: unique([data.workflow_diagram]),
      count: (ids) => reader.work_diagram.count({ where: { id: { in: ids }, company_id: companyId } }),
    },
    {
      label: 'Tipo de contrato',
      ids: unique([data.type_of_contract]),
      count: (ids) => reader.types_of_contract.count({ where: { id: { in: ids }, company_id: companyId } }),
    },
    {
      // Los sindicatos pueden ser globales (company_id NULL).
      label: 'Sindicato',
      ids: unique([data.guild_id]),
      count: (ids) =>
        reader.guild.count({ where: { id: { in: ids }, OR: [{ company_id: companyId }, { company_id: null }] } }),
    },
    {
      label: 'Convenio',
      ids: unique([data.covenants_id]),
      count: (ids) => reader.covenant.count({ where: { id: { in: ids }, company_id: companyId } }),
    },
    {
      // `category` no tiene company_id: se acota por el convenio al que pertenece.
      label: 'Categoría',
      ids: unique([data.category_id]),
      count: (ids) => reader.category.count({ where: { id: { in: ids }, covenant: { company_id: companyId } } }),
    },
    {
      label: 'Centro de costo',
      ids: unique([data.cost_center_id]),
      count: (ids) => reader.cost_center.count({ where: { id: { in: ids }, company_id: companyId } }),
    },
    {
      label: 'Cliente',
      ids: unique([...(refs.contractorIds ?? [])]),
      count: (ids) => reader.customers.count({ where: { id: { in: ids }, company_id: companyId } }),
    },
    {
      label: 'Aptitud técnica',
      ids: unique([...(refs.aptitudeIds ?? [])]),
      count: (ids) => reader.aptitudes_tecnicas.count({ where: { id: { in: ids }, company_id: companyId } }),
    },
    {
      label: 'Sector de taller',
      ids: unique([...(refs.workshopSectorIds ?? [])]),
      count: (ids) => reader.workshop_sectors.count({ where: { id: { in: ids }, company_id: companyId } }),
    },
    {
      label: 'País de nacimiento',
      ids: unique([data.birthplace]),
      count: (ids) => reader.countries.count({ where: { id: { in: ids } } }),
    },
  ];

  await Promise.all(
    checks
      .filter((check) => check.ids.length > 0)
      .map(async (check) => {
        if ((await check.count(check.ids)) !== check.ids.length) {
          throw new Error(`${check.label} inválido para la empresa activa`);
        }
      })
  );

  // La ciudad tiene que pertenecer a la provincia elegida.
  const validLocation = await reader.cities.count({
    where: { id: BigInt(data.city), province_id: BigInt(data.province) },
  });
  if (validLocation === 0) throw new Error('La ciudad no pertenece a la provincia elegida');
}

/**
 * Traduce un error de unicidad (P2002) de la escritura del legajo a un mensaje claro, sin revelar
 * nada del registro que ya existe. Cualquier otro error se relanza tal cual.
 */
export function rethrowEmployeeWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    // Con el adaptador de pg el nombre del campo viaja en `meta` con forma variable: se busca en el texto.
    const detail = JSON.stringify(error.meta ?? {}).toLowerCase();
    if (detail.includes('cuil')) throw new Error('Ya existe un legajo registrado con ese CUIL');
    if (detail.includes('document_number'))
      throw new Error('Ya existe un legajo registrado con ese número de documento');
    if (detail.includes('file')) throw new Error('Ya existe un legajo con ese número de legajo');
    throw new Error('Ya existe un legajo con alguno de esos datos (CUIL, documento o legajo)');
  }
  throw error;
}
