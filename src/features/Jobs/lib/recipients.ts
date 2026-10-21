import 'server-only';

import type { notification_kind } from '@/generated/prisma/client';
import { prismaSystem as prisma } from '@/shared/lib/prisma-system';

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
