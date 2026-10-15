/**
 * Destino al terminar un checklist.
 *
 * El mismo formulario corre en el dashboard (con sesión, ruta `/dashboard/forms/<id>/...`)
 * y en el QR anónimo (`/maintenance/equipment/<id>/checklists/...`): cada camino vuelve
 * a su propio listado.
 */
export function getChecklistRedirectPath(pathname: string | null | undefined, equipmentId: string): string {
  if (pathname?.includes('/dashboard/forms/')) {
    const formIdMatch = pathname.match(/\/dashboard\/forms\/([^/]+)/);
    return formIdMatch?.[1] ? `/dashboard/forms/${formIdMatch[1]}` : '/dashboard/forms';
  }
  return `/maintenance/equipment/${equipmentId}/checklists`;
}
