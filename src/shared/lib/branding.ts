/**
 * Identidad de la plataforma. Único punto a tocar cuando se rehaga la marca.
 *
 * Hoy la marca es puramente tipográfica: no hay archivo de logo. Las pantallas
 * (login, QR, recupero de contraseña) y los PDF muestran `BRAND_NAME` con el color
 * `brand`, que a su vez sigue a `--primary` del theme (`src/app/globals.css`).
 *
 * Antes de esto el producto mostraba el logo del cliente para el que se escribió el
 * sistema original. Cuando haya un logo propio, se agrega acá: uno para pantalla
 * (PNG con transparencia) y otro para PDF (JPG con fondo blanco — `@react-pdf/renderer`
 * maqueta mal el canal alfa y estira la imagen).
 *
 * Ojo: el logo de la EMPRESA que usa el sistema es otra cosa. Vive en `company.company_logo`,
 * se sirve por `/api/files` y tiene prioridad sobre la marca en los documentos que emite
 * esa empresa (constancias de entrega, checklists).
 */

/** Nombre del producto, tal como se escribe en la interfaz. */
export const BRAND_NAME = 'alphataco';

/**
 * Texto del panel de producto de las pantallas de acceso (`features/Auth/components/AuthProductPanel`).
 * Se cambia por instancia junto con `BRAND_NAME`.
 */
export const AUTH_PANEL = {
  eyebrow: 'Cumplimiento en tiempo real',
  headline: 'Personal, equipos y documentación, al día y a la vista.',
  description: 'Cada vencimiento con su semáforo. Cada persona, con su legajo.',
} as const;
