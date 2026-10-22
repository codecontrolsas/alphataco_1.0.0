'use server';

import { generateClientCredentials, hashSecret } from '@/features/ExternalApi/lib/hash';
import { Logger } from '@/lib/logger';
import { requireServerAuthProfile } from '@/shared/actions/auth.actions';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { requireConfigTabPermission } from '../lib/config-access.server';
import { createExternalApiClientSchema, type CreateExternalApiClientValues } from './schemas';
import type { CreatedExternalApiClient } from './types';

const logger = new Logger('features/Empresa/AccesosExternos');

/**
 * ABM de las credenciales que usan los sistemas externos para consultar la API
 * de solo lectura (ticket 671).
 *
 * Regla dura de este archivo: el secreto en claro solo existe dentro de
 * `createExternalApiClient` y `rotateExternalApiClientSecret`, se devuelve una
 * unica vez a quien lo creo, y NUNCA se persiste ni se pasa al logger.
 */

/** `created_by`/`revoked_by` apuntan a `profile.id`, no al id de la credencial de sesión. */
async function getCurrentProfileId(): Promise<string> {
  return (await requireServerAuthProfile()).id;
}

export async function createExternalApiClient(
  values: CreateExternalApiClientValues
): Promise<CreatedExternalApiClient> {
  await requireConfigTabPermission('accesos-externos', 'create');
  const parsed = createExternalApiClientSchema.parse(values);

  const companyId = await getActiveCompanyId();
  if (!companyId) throw new Error('No se pudo determinar la empresa actual');

  const profileId = await getCurrentProfileId();
  const { clientId, secret, secretPrefix } = generateClientCredentials();

  try {
    const created = await prisma.external_api_clients.create({
      data: {
        name: parsed.name,
        notes: parsed.notes || null,
        client_id: clientId,
        secret_hash: await hashSecret(secret),
        secret_prefix: secretPrefix,
        created_by: profileId,
      },
      select: { id: true, name: true, client_id: true },
    });

    logger.info('Acceso externo creado', { data: { id: created.id, clientId: created.client_id } });

    return { id: created.id, name: created.name, clientId: created.client_id, secret };
  } catch (error) {
    logger.error('Error al crear el acceso externo', { data: { error, name: parsed.name } });
    throw error;
  }
}

/**
 * Genera una clave nueva conservando el mismo `client_id`.
 *
 * La anterior deja de funcionar en el acto: el sistema externo solo tiene que
 * cambiar la contrasena, no toda su configuracion.
 */
export async function rotateExternalApiClientSecret(id: string): Promise<CreatedExternalApiClient> {
  await requireConfigTabPermission('accesos-externos', 'update');
  const companyId = await getActiveCompanyId();
  if (!companyId) throw new Error('No se pudo determinar la empresa actual');

  const existing = await prisma.external_api_clients.findFirst({
    where: { id, company_id: companyId },
    select: { id: true, name: true, client_id: true, revoked_at: true },
  });

  if (!existing) throw new Error('El acceso externo no existe');
  if (existing.revoked_at) throw new Error('No se puede rotar la clave de un acceso revocado');

  const { secret, secretPrefix } = generateClientCredentials();

  try {
    await prisma.external_api_clients.update({
      where: { id },
      data: { secret_hash: await hashSecret(secret), secret_prefix: secretPrefix },
    });

    logger.info('Clave de acceso externo rotada', { data: { id, clientId: existing.client_id } });

    return { id: existing.id, name: existing.name, clientId: existing.client_id, secret };
  } catch (error) {
    logger.error('Error al rotar la clave del acceso externo', { data: { error, id } });
    throw error;
  }
}

/**
 * Revoca el acceso de forma permanente.
 *
 * No hay vuelta atras a proposito: si el sistema externo tiene que volver a
 * integrarse, se emite una credencial nueva y queda el rastro de las dos.
 */
export async function revokeExternalApiClient(id: string): Promise<void> {
  await requireConfigTabPermission('accesos-externos', 'delete');
  const companyId = await getActiveCompanyId();
  if (!companyId) throw new Error('No se pudo determinar la empresa actual');

  const profileId = await getCurrentProfileId();

  try {
    const result = await prisma.external_api_clients.updateMany({
      where: { id, company_id: companyId, revoked_at: null },
      data: { is_active: false, revoked_at: new Date(), revoked_by: profileId },
    });

    if (result.count === 0) throw new Error('El acceso externo no existe o ya estaba revocado');

    logger.info('Acceso externo revocado', { data: { id } });
  } catch (error) {
    logger.error('Error al revocar el acceso externo', { data: { error, id } });
    throw error;
  }
}
