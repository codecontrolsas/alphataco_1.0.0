import { requiredFieldsOf } from '@/shared/components/common/FormCompleteness';
import moment from 'moment';
import type { DefaultValues } from 'react-hook-form';
import { CONTACT_DATA_FIELD_NAMES, PERSONAL_DATA_FIELD_NAMES } from '../../shared/schemas/person-data-schemas';
import type { EmployeeDetailData } from '../actions.server';
import { employeeFormSchema, employeeWorkDataSchema, type EmployeeFormData } from '../schemas/employee-schema';

type FieldName = keyof EmployeeFormData;

/** Secciones del formulario del legajo y los campos de cada una. */
export const EMPLOYEE_FORM_SECTIONS: readonly { id: string; title: string; fields: readonly string[] }[] = [
  { id: 'personal', title: 'Datos personales', fields: PERSONAL_DATA_FIELD_NAMES },
  { id: 'contact', title: 'Contacto y dirección', fields: CONTACT_DATA_FIELD_NAMES },
  { id: 'work', title: 'Datos laborales', fields: Object.keys(employeeWorkDataSchema.shape) as FieldName[] },
];

/** Campos obligatorios del legajo (los calcula el helper compartido a partir del schema). */
export const REQUIRED_EMPLOYEE_FIELDS = requiredFieldsOf(employeeFormSchema);

/** Valores iniciales del formulario: vacíos para un alta, los del legajo para una edición. */
export function buildEmployeeDefaultValues(employee: EmployeeDetailData | null): DefaultValues<EmployeeFormData> {
  if (!employee) {
    // Alta: todos los campos sin valor para que react-hook-form los inicie vacíos.
    return { aptitudes: [], allocated_to: [] };
  }

  return {
    firstname: employee.firstname || undefined,
    lastname: employee.lastname || undefined,
    nationality: employee.nationality || undefined,
    born_date: employee.born_date ? moment(employee.born_date).format('YYYY-MM-DD') : undefined,
    cuil: employee.cuil || undefined,
    document_type: employee.document_type || undefined,
    document_number: employee.document_number || undefined,
    birthplace: employee.countries?.id || undefined,
    gender: employee.gender || undefined,
    marital_status: employee.marital_status || undefined,
    level_of_education: employee.level_of_education || undefined,
    picture: employee.picture || undefined,
    street: employee.street || undefined,
    street_number: employee.street_number || undefined,
    province: employee.province ? Number(employee.province) : undefined,
    city: employee.city ? Number(employee.city) : undefined,
    postal_code: employee.postal_code || undefined,
    phone: employee.phone || undefined,
    email: employee.email || undefined,
    hierarchical_position: employee.hierarchical_position || undefined,
    file: employee.file || undefined,
    company_position: employee.company_position || undefined,
    workflow_diagram: employee.workflow_diagram || undefined,
    normal_hours: employee.normal_hours ? String(employee.normal_hours) : undefined,
    type_of_contract: employee.types_of_contract?.id || undefined,
    allocated_to: (employee.contractor_employee?.map((ce) => ce.customers?.id).filter(Boolean) as string[]) || [],
    aptitudes: (employee.empleado_aptitudes?.map((ea) => ea.aptitudes_tecnicas?.id).filter(Boolean) as string[]) || [],
    // `@db.Date` llega como medianoche UTC: en hora local (UTC-3) mostraría —y guardaría— el día anterior.
    date_of_admission: employee.date_of_admission
      ? moment.utc(employee.date_of_admission).format('YYYY-MM-DD')
      : undefined,
    guild_id: employee.guild_id || undefined,
    covenants_id: employee.covenants_id || undefined,
    category_id: employee.category_id || undefined,
    cost_center_id: employee.cost_center_id || undefined,
    cost_type: employee.cost_type || undefined,
    workshop_sector_ids:
      (employee.employee_workshop_sectors?.map((ews) => ews.workshop_sectors?.id).filter(Boolean) as string[]) ?? [],
  };
}
