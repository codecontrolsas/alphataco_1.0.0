import {
  CONTACT_DATA_FIELD_NAMES,
  PERSONAL_DATA_FIELD_NAMES,
} from '@/features/Employees/shared/schemas/person-data-schemas';
import { requiredFieldsOf, type CompletenessSection } from '@/shared/components/common/FormCompleteness';
import moment from 'moment';
import type { DefaultValues } from 'react-hook-form';
import type { PreEmployeeDetailData } from '../actions/pre-employee-actions.server';
import {
  PRE_EMPLOYEE_WORK_DATA_FIELD_NAMES,
  preEmployeeFormSchema,
  type PreEmployeeFormData,
} from '../schemas/pre-employee-schema';

/** Secciones del formulario del candidato y los campos de cada una. */
export const PRE_EMPLOYEE_FORM_SECTIONS: readonly CompletenessSection[] = [
  { id: 'personal', title: 'Datos personales', fields: PERSONAL_DATA_FIELD_NAMES },
  { id: 'contact', title: 'Contacto y dirección', fields: CONTACT_DATA_FIELD_NAMES },
  { id: 'proposal', title: 'Función propuesta', fields: PRE_EMPLOYEE_WORK_DATA_FIELD_NAMES },
];

/** Campos obligatorios del candidato (los calcula el helper compartido a partir del schema). */
export const REQUIRED_PRE_EMPLOYEE_FIELDS = requiredFieldsOf(preEmployeeFormSchema);

/** Valores iniciales del formulario: vacíos para un alta, los del candidato para una edición. */
export function buildPreEmployeeDefaultValues(
  preEmployee: PreEmployeeDetailData | null
): DefaultValues<PreEmployeeFormData> {
  if (!preEmployee) return {};

  return {
    firstname: preEmployee.firstname,
    lastname: preEmployee.lastname,
    nationality: preEmployee.nationality ?? undefined,
    born_date: preEmployee.born_date ? moment(preEmployee.born_date).format('YYYY-MM-DD') : undefined,
    cuil: preEmployee.cuil,
    document_type: preEmployee.document_type ?? undefined,
    document_number: preEmployee.document_number,
    birthplace: preEmployee.birthplace,
    gender: preEmployee.gender ?? undefined,
    marital_status: preEmployee.marital_status ?? undefined,
    level_of_education: preEmployee.level_of_education ?? undefined,
    picture: preEmployee.picture ?? undefined,
    street: preEmployee.street,
    street_number: preEmployee.street_number,
    province: Number(preEmployee.province),
    city: preEmployee.city != null ? Number(preEmployee.city) : undefined,
    postal_code: preEmployee.postal_code ?? undefined,
    phone: preEmployee.phone,
    email: preEmployee.email ?? undefined,
    proposed_hierarchical_position: preEmployee.proposed_hierarchical_position ?? undefined,
    proposed_company_position: preEmployee.proposed_company_position ?? undefined,
  };
}
