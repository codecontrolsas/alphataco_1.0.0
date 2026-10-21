
export const formatDate = (dateString: string) => {
  if (!dateString) return 'No vence';
  const [day, month, year] = dateString.split('/');
  const formattedDate = `${day}/${month}/${year}`;
  return formattedDate || 'No vence';
};
/** Shape mínimo (PostgREST legacy o Prisma) que necesita `setEmployeesToShow`. */
type Named = { id?: string | null; name?: string | null } | null | undefined;
/** En las filas planas de PostgREST las FK vienen como id (string o number) en vez de objeto. */
type Ref = Named | string | number;
export interface LegacyEmployeeInput {
  id?: string;
  lastname?: string | null;
  firstname?: string | null;
  email?: string | null;
  cuil?: string | null;
  document_number?: string | null;
  hierarchical_position?: Ref;
  company_position?: Ref;
  normal_hours?: string | null;
  type_of_contract?: string | null;
  allocated_to?: string | string[] | null;
  picture?: string | null;
  nationality?: string | null;
  document_type?: string | null;
  birthplace?: Ref;
  gender?: string | null;
  marital_status?: string | null;
  level_of_education?: string | null;
  street?: string | null;
  street_number?: string | null;
  province?: Ref;
  country?: Ref;
  postal_code?: string | null;
  phone?: string | null;
  file?: string | null;
  date_of_admission?: string | Date | null;
  born_date?: string | Date | null;
  affiliate_status?: string | null;
  city?: Ref;
  workflow_diagram?: Ref;
  contractor_employee?: Array<{ customers?: { id?: string | null } | null }> | null;
  is_active?: boolean | null;
  reason_for_termination?: string | null;
  termination_date?: string | Date | null;
  status?: string | null;
  guild?: Named;
  guild_id?: Ref;
  covenant?: Named;
  covenants_id?: Ref;
  category?: Named;
  category_id?: Ref;
  cost_center_id?: string | null;
  empleado_aptitudes?: Array<{ aptitud_id?: string | null; aptitudes_tecnicas?: unknown }> | null;
}

const nameOf = (value: Ref | undefined) =>
  typeof value === 'string' ? value : typeof value === 'number' ? undefined : value?.name?.trim();
const idOf = (value: Ref | undefined) =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : value?.id;
const capitalize = (value: string | null | undefined) =>
  value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : '';

export const setEmployeesToShow = (employees: LegacyEmployeeInput[] | null | undefined) => {
  return employees?.map((employee) => ({
    full_name: `${capitalize(employee.lastname)} ${capitalize(employee.firstname)}`,
    id: employee.id,
    email: employee.email,
    cuil: employee.cuil,
    document_number: employee.document_number,
    hierarchical_position: nameOf(employee.hierarchical_position),
    company_position: idOf(employee.company_position), // Usar el ID del puesto
    company_position_name: nameOf(employee.company_position), // Agregar el nombre del puesto
    normal_hours: employee.normal_hours,
    type_of_contract: employee.type_of_contract,
    allocated_to: employee.allocated_to,
    picture: employee.picture,
    nationality: employee.nationality,
    lastname: capitalize(employee.lastname),
    firstname: capitalize(employee.firstname),
    document_type: employee.document_type,
    birthplace: nameOf(employee.birthplace),
    gender: employee.gender,
    marital_status: employee.marital_status,
    level_of_education: employee.level_of_education,
    street: employee.street,
    street_number: employee.street_number,
    province: nameOf(employee.province),
    country: nameOf(employee.country),
    postal_code: employee.postal_code,
    phone: employee.phone,
    file: employee.file,
    date_of_admission: employee.date_of_admission,
    born_date: employee.born_date,
    affiliate_status: employee.affiliate_status,
    city: nameOf(employee.city),
    hierrl_position: nameOf(employee.hierarchical_position),
    workflow_diagram: nameOf(employee.workflow_diagram),
    contractor_employee: employee.contractor_employee?.map(({ customers }) => customers?.id),
    is_active: employee.is_active,
    reason_for_termination: employee.reason_for_termination,
    termination_date: employee.termination_date,
    status: employee.status,
    guild_id: employee.guild?.id || idOf(employee.guild_id),
    covenants_id: employee.covenant?.id || idOf(employee.covenants_id),
    category_id: employee.category?.id || idOf(employee.category_id),
    guild: nameOf(employee.guild_id) || idOf(employee.guild_id),
    covenants: nameOf(employee.covenants_id) || idOf(employee.covenants_id),
    category: nameOf(employee.category_id) || idOf(employee.category_id),
    cost_center_id: employee.cost_center_id,
    empleado_aptitudes:
      employee.empleado_aptitudes?.map((apt) => ({
        aptitud_id: apt.aptitud_id,
        aptitudes_tecnicas: apt.aptitudes_tecnicas,
      })) || [],
  }));
};
/**
 * Normaliza un texto para usarlo como segmento de una ruta de Supabase Storage.
 *
 * Storage rechaza con `InvalidKey` cualquier caracter fuera de ASCII (tildes, ñ), asi que
 * TODO segmento que provenga de datos cargados por el usuario (nombre de empresa, nombre del
 * empleado, dominio del equipo, nombre del tipo de documento) debe pasar por aca antes de
 * armar el path.
 */
export const formatPathSegment = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[áäàâ]/g, 'a')
    .replace(/[éëèê]/g, 'e')
    .replace(/[íïìî]/g, 'i')
    .replace(/[óöòô]/g, 'o')
    .replace(/[úüùû]/g, 'u')
    .replace(/ñ/g, 'n') // Reemplaza ñ por n
    .replace(/['"]/g, '') // Elimina apóstrofes y comillas
    .replace(/[^a-z0-9-]/g, '-') // Reemplaza cualquier carácter que no sea letra, número o guión por guión
    .replace(/-+/g, '-') // Reemplaza múltiples guiones consecutivos por uno solo
    .replace(/^-|-$/g, ''); // Elimina guiones al inicio y al final
};

export const formatDocumentTypeName = (documentType: string) => {
  return formatPathSegment(documentType);
};
// export const stylesPDF = StyleSheet.create({
//   page: {
//     flexDirection: 'column',
//     padding: 20,
//   },
//   section: {
//     marginBottom: 10,
//   },
//   label: {
//     fontSize: 12,
//     fontWeight: 'bold',
//   },
//   value: {
//     fontSize: 12,
//     marginTop: 4,
//   },
//   checkboxContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//   },
//   checkbox: {
//     width: 12,
//     height: 12,
//     borderWidth: 1,
//     marginRight: 8,
//   },
//   radioButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 4,
//   },
//   radioLabel: {
//     fontSize: 12,
//     marginRight: 4,
//   },
//   text: {
//     marginRight: 20,
//   },
//   text2: {
//   },
// });
