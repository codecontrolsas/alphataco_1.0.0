/**
 * Los formularios de alta/edición de empresa son páginas server con inputs nativos: cada campo
 * tiene un elemento `id="<campo>_error"` debajo. Este helper pinta ahí el error por campo
 * (o lo limpia) a partir del resultado de `parseCompanyForm` o de `fieldErrors` del servidor,
 * marca el control con `aria-invalid`/`aria-describedby` y lleva el foco al primer campo con error.
 *
 * Ticket 806: antes el error quedaba escrito arriba de todo mientras el usuario estaba abajo, junto
 * al botón, y "no pasaba nada". Por eso devuelve la cantidad de errores (el llamador avisa con un
 * toast) y enfoca el primero, que además lo trae a la vista.
 */
export function showCompanyFieldErrors(formData: FormData, errors: Record<string, string>): number {
  const keys = new Set<string>([...Array.from(formData.keys()), ...Object.keys(errors)]);
  let firstInvalid: HTMLElement | null = null;
  let count = 0;

  for (const key of keys) {
    const element = document.getElementById(`${key}_error`);
    if (!element) continue;
    const message = errors[key];
    element.innerText = message ?? '';
    // Token del tema (no un color fijo): `text-danger` existe escrito completo en el código, Tailwind lo genera.
    element.classList.toggle('text-danger', Boolean(message));
    element.setAttribute('role', message ? 'alert' : '');

    const control = document.getElementById(key);
    if (control) {
      if (message) {
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', `${key}_error`);
      } else {
        control.removeAttribute('aria-invalid');
      }
    }
    if (message) {
      count += 1;
      if (!firstInvalid && control) firstInvalid = control;
    }
  }

  if (firstInvalid) {
    firstInvalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
    firstInvalid.focus({ preventScroll: true });
  }
  return count;
}
