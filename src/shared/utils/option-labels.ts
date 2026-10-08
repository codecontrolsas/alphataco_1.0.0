import type { SearchSelectOption } from '@/components/ui/search-select';

/**
 * Labels y opciones de `SearchSelect` para entidades que se repiten en todo el sistema.
 * Sin directiva: puro, se usa igual desde server y client components. No pide campos a ninguna query:
 * si al consumidor le falta el legajo, sumarlo al `select` es cambio de query (decisión 7.5 del plan).
 */

type OptionExtras = Pick<SearchSelectOption, 'description' | 'group' | 'disabled' | 'hint'>;

/** Legajo: la columna real es `employees.file`; varios tipos del sistema lo exponen como `file_number`. */
type EmployeeLike = {
  id: string;
  lastname: string | null;
  firstname: string | null;
  file?: string | number | null;
  file_number?: string | number | null;
};

type VehicleLike = {
  id: string;
  domain?: string | null;
  intern_number?: string | null;
  serie?: string | null;
};

function getEmployeeFileNumber(employee: EmployeeLike): string | undefined {
  const raw = employee.file ?? employee.file_number;
  if (raw === null || raw === undefined) return undefined;
  const text = String(raw).trim();
  return text === '' ? undefined : text;
}

function getEmployeeName(employee: EmployeeLike): string {
  return [employee.lastname, employee.firstname]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * `[legajo] Apellido Nombre` (`employee-file-number.md`). Para los lugares que necesitan el texto plano
 * (labels de facetas, export). En `SearchSelect` usar `toEmployeeOption`, que muestra el legajo en mono.
 */
export function getEmployeeOptionLabel(employee: EmployeeLike): string {
  const fileNumber = getEmployeeFileNumber(employee);
  const name = getEmployeeName(employee) || 'Sin nombre';
  return fileNumber ? `[${fileNumber}] ${name}` : name;
}

/** Opción de empleado: el legajo va en `code` (se ve en mono y se busca), el nombre en `label`. */
export function toEmployeeOption(employee: EmployeeLike, extras?: OptionExtras): SearchSelectOption {
  return {
    value: employee.id,
    code: getEmployeeFileNumber(employee),
    label: getEmployeeName(employee) || 'Sin nombre',
    ...extras,
  };
}

/**
 * Opción de equipo: el dominio (o la serie, si no tiene) en `code`; el label es el interno.
 * Se busca por dominio, serie o interno.
 */
export function toVehicleOption(vehicle: VehicleLike, extras?: OptionExtras): SearchSelectOption {
  const domain = vehicle.domain?.trim() || undefined;
  const serie = vehicle.serie?.trim() || undefined;
  const intern = vehicle.intern_number?.trim() || undefined;
  const code = domain ?? serie;
  // Sin interno, el dominio pasa a ser el label (mostrarlo dos veces, como código y como label, no suma).
  return {
    value: vehicle.id,
    code: intern ? code : undefined,
    label: intern ? `Interno ${intern}` : (code ?? 'Sin dominio'),
    keywords: [domain, serie, intern].filter((term): term is string => term !== undefined),
    ...extras,
  };
}
