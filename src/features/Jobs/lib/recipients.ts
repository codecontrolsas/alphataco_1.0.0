import 'server-only';

import type { notification_kind } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';

/**
 * Destinatarios ADICIONALES de los correos automáticos, resueltos POR EMPRESA. Desde #786 los avisos
 * los entrega `notify` (features/Notifications): esta lista se suma a los usuarios de los roles que tienen
 * el aviso activo, deduplicada por dirección.
 *
 * **Por qué no son variables de entorno.** Las edge functions leían una lista global
 * (`DEVIATIONS_RECIPIENTS`, `DOCUMENTS_EXPIRY_RECIPIENTS`), que servía cuando el sistema era
 * de hecho mono-empresa. Estos jobs recorren TODAS las empresas: con una lista global, los
 * datos de cada empresa irían a gente que no pertenece a ninguna en particular. La sección 5
 * del diseño aprobado lo resuelve con una tabla `notification_settings (company_id, kind,
 * recipients)`, y es lo que se implementó.
 *
 * **Perímetro.** La lista se pide con el MISMO `companyId` con el que el job consultó los
 * datos, y cada empresa recibe su propio `sendMail`. No hay ningún camino por el que la lista
 * de una empresa se use para el contenido de otra, ni fallback global que lo habilite.
 *
 * Sin fila, inactiva o con la lista vacía, el job saltea la empresa y lo deja anotado en
 * `jobs_runs` — nunca manda "por las dudas".
 */
export interface CompanyRecipients {
  companyId: string;
  recipients: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lista de direcciones de una empresa para un tipo de aviso. Devuelve `[]` si no hay nada
 * configurado o si ninguna dirección es válida.
 */
export async function getCompanyRecipients(companyId: string, kind: notification_kind): Promise<string[]> {
  const setting = await prisma.notification_settings.findUnique({
    where: { company_id_kind: { company_id: companyId, kind } },
    select: { recipients: true, is_active: true },
  });

  if (!setting || !setting.is_active) return [];

  // Se deduplica y se descarta lo que no parece un correo: una entrada mal cargada haría
  // fallar el envío de TODA la empresa, no sólo el de esa dirección.
  const clean = setting.recipients.map((address) => address.trim()).filter((address) => EMAIL_RE.test(address));

  return Array.from(new Set(clean));
}
