/**
 * Campos de un empleado que consume el listado (tabla y export).
 *
 * Es propio del listado y NO incluye `picture`: es un base64 que viajaba por cada fila de cada página y de cada
 * export sin que ninguna celda ni columna exportable lo necesite más que para un avatar. La API externa sigue
 * usando `EMPLOYEE_SELECT` (shared); este select no la afecta.
 */
export const EMPLOYEE_LIST_SELECT = {
  id: true,
  created_at: true,
  lastname: true,
  firstname: true,
  cuil: true,
  document_type: true,
  document_number: true,
  nationality: true,
  gender: true,
  marital_status: true,
  level_of_education: true,
  born_date: true,
  street: true,
  street_number: true,
  province: true,
  city: true,
  postal_code: true,
  phone: true,
  email: true,
  file: true,
  normal_hours: true,
  date_of_admission: true,
  affiliate_status: true,
  cost_type: true,
  status: true,
  is_active: true,
  reason_for_termination: true,
  termination_date: true,
  // FK resueltas
  provinces: { select: { id: true, name: true } },
  cities: { select: { id: true, name: true } },
  countries: { select: { id: true, name: true } },
  hierarchy: { select: { id: true, name: true } },
  company_positions: { select: { id: true, name: true } },
  types_of_contract: { select: { id: true, name: true } },
  work_diagram: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  covenant: { select: { id: true, name: true } },
  guild: { select: { id: true, name: true } },
  cost_center: { select: { id: true, name: true } },
  // M:M
  contractor_employee: {
    select: {
      customers: { select: { id: true, name: true } },
    },
  },
  empleado_aptitudes: {
    select: {
      aptitudes_tecnicas: { select: { id: true, nombre: true } },
    },
  },
  employee_workshop_sectors: {
    select: {
      workshop_sectors: { select: { id: true, name: true } },
    },
  },
} as const;
