const capitalize = (text: string) => (text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text);

/** `[legajo] Apellido, Nombre` (regla del legajo en toda superficie que muestra un empleado). */
export function formatEmployeeLabel(employee: { file: string | null; lastname: string; firstname: string }): string {
  const file = employee.file?.trim();
  const name = `${capitalize(employee.lastname.trim())}, ${capitalize(employee.firstname.trim())}`;
  return file ? `[${file}] ${name}` : name;
}
