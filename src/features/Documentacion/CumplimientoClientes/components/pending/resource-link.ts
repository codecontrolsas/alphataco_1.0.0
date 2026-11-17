/** Ficha del recurso dueño del documento. */
export function resourceHref(kind: 'Persona' | 'Equipos', resourceId: string): string {
  return kind === 'Persona'
    ? `/dashboard/employee/action?action=view&employee_id=${resourceId}`
    : `/dashboard/equipment/action?action=view&id=${resourceId}`;
}
