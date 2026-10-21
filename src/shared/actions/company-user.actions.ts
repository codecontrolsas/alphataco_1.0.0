'use server';

import { logger } from '@/lib/logger';
import { getSessionCompanyClaim, getSessionToken, getSessionUser } from '@/shared/lib/session';
import { writeCompanyClaim } from '@/shared/lib/session-claims';
import { canUseAsActiveCompany, setActiveCompanyCookie } from '@/shared/lib/tenant';

export type SwitchActiveCompanyResult = { ok: boolean; error?: string };

/** Un año: la empresa activa del dashboard sobrevive al cierre del navegador. */
const ACTIVE_COMPANY_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Cambia la empresa activa del usuario. Es la ÚNICA vía de escritura desde el cliente.
 *
 * Antes el cliente escribía `actualComp` con `js-cookie` y avisaba al servidor por
 * separado: la cookie quedaba a merced de `document.cookie` y con ella el perímetro de
 * todo el sistema. Ahora la cookie es `httpOnly` y sólo se escribe acá, después de validar
 * con `canUseAsActiveCompany()` que el usuario tenga un vínculo real con esa empresa.
 *
 * Escribe las dos caras de la empresa activa, en este orden:
 * 1. El claim `company` de la sesión, que es lo que `getActiveCompanyId()` prefiere. Si esto
 *    fallara y sólo se escribiera la cookie, el claim viejo seguiría ganando y el cambio de
 *    empresa sería un no-op silencioso.
 * 2. La cookie `actualComp`, que es la que ven los flujos sin claim.
 *
 * Éste es el ÚNICO camino por el que el claim se mueve a pedido del cliente, y por eso la
 * validación de arriba no es opcional: la escritura de `writeCompanyClaim()` es server-only y
 * no revalida nada, confía en que el llamador ya lo hizo (ver `shared/lib/session-claims.ts`).
 */
export const switchActiveCompany = async (companyId: string): Promise<SwitchActiveCompanyResult> => {
  if (!companyId) return { ok: false, error: 'Empresa inválida' };

  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'No hay sesión activa' };

  if (!(await canUseAsActiveCompany(companyId))) {
    logger.warn('Intento de cambiar a una empresa sin pertenencia', {
      data: { userId: user.id, companyId },
    });
    return { ok: false, error: 'No tenés acceso a esa empresa' };
  }

  if ((await getSessionCompanyClaim()) !== companyId) {
    const sessionToken = await getSessionToken();
    if (!sessionToken) return { ok: false, error: 'No hay sesión activa' };

    try {
      await writeCompanyClaim(sessionToken, companyId);
    } catch (error) {
      logger.error('Error actualizando el claim de empresa de la sesión', { data: { userId: user.id, error } });
      return { ok: false, error: 'No se pudo cambiar la empresa activa' };
    }
  }

  await setActiveCompanyCookie(companyId, ACTIVE_COMPANY_MAX_AGE);

  return { ok: true };
};
