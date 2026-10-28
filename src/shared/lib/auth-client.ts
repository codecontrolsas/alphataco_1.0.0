'use client';

import { anonymousClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Cliente de Better Auth para el navegador.
 *
 * Lo usan MUY pocos lugares a propósito: el QR de mantenimiento (que necesita abrir la sesión
 * anónima antes de validar el CUIL) y el logout del menú de usuario. Todo el resto del login
 * pasa por Server Actions, que es donde vive la validación.
 *
 * No expone ninguna vía para escribir los claims de empresa/legajo: son `input: false` en el
 * servidor (ver `shared/lib/auth.ts`).
 */
// Sin `baseURL`: Better Auth usa el origen de la página (`/api/auth`), así que la misma imagen sirve para cualquier dominio.
export const authClient = createAuthClient({
  plugins: [anonymousClient()],
});
