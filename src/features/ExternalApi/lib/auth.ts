import { Logger } from '@/lib/logger';
import { prismaSystem as prisma } from '@/shared/lib/prisma-system';
import type { NextRequest } from 'next/server';
import { hashSecret, verifySecret } from './hash';

const logger = new Logger('features/ExternalApi/auth');

/**
 * Autenticacion de la API de solo lectura para sistemas externos (ticket 671).
 *
 * El sistema externo manda `Authorization: Basic base64(client_id:secret)`.
 * Este canal NO usa la sesion de Supabase: un request server-to-server no trae
 * cookies, asi que la empresa a consultar sale de la propia credencial.
 */

export type AuthenticatedApiClient = {
  id: string;
  companyId: string;
  name: string;
};

export type ExternalApiAuthResult =
  | { ok: true; client: AuthenticatedApiClient; attemptedClientId: string }
  | { ok: false; status: 401 | 403; code: string; message: string; attemptedClientId: string | null };

/**
 * Hash de un secreto que no existe, para gastar el mismo tiempo de computo
 * cuando el `client_id` no esta en la base.
 *
 * Sin esto, un client_id inexistente responde mucho mas rapido que uno valido
 * con secreto incorrecto, y esa diferencia permite descubrir que credenciales
 * existen. Se calcula una sola vez por proceso.
 */
let decoyHashPromise: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHashPromise ??= hashSecret('decoy-secret-that-never-matches');
  return decoyHashPromise;
}

/** Decodifica el header Basic sin validar nada contra la base */
function decodeBasicHeader(header: string | null): { clientId: string; secret: string } | null {
  if (!header?.startsWith('Basic ')) return null;

  try {
    const decoded = Buffer.from(header.slice('Basic '.length).trim(), 'base64').toString('utf-8');
    // El secreto puede contener ':', asi que se corta en el PRIMER separador
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex <= 0) return null;

    return { clientId: decoded.slice(0, separatorIndex), secret: decoded.slice(separatorIndex + 1) };
  } catch {
    return null;
  }
}

/** Solo el usuario del header, para poder registrar intentos fallidos */
export function extractAttemptedClientId(header: string | null): string | null {
  return decodeBasicHeader(header)?.clientId ?? null;
}

export async function authenticateExternalApiRequest(request: NextRequest): Promise<ExternalApiAuthResult> {
  const header = request.headers.get('authorization');

  if (!header) {
    return {
      ok: false,
      status: 401,
      code: 'MISSING_CREDENTIALS',
      message: 'Falta el encabezado Authorization.',
      attemptedClientId: null,
    };
  }

  const credentials = decodeBasicHeader(header);
  if (!credentials) {
    return {
      ok: false,
      status: 401,
      code: 'MALFORMED_CREDENTIALS',
      message: 'El encabezado Authorization no tiene el formato Basic esperado.',
      attemptedClientId: null,
    };
  }

  const { clientId, secret } = credentials;

  const client = await prisma.external_api_clients.findUnique({
    where: { client_id: clientId },
    select: { id: true, company_id: true, name: true, secret_hash: true, is_active: true, revoked_at: true },
  });

  // Se verifica SIEMPRE, exista o no la credencial, para no delatar por tiempo
  // de respuesta cuales client_id son validos
  const secretMatches = await verifySecret(secret, client?.secret_hash ?? (await getDecoyHash()));

  if (!client || !secretMatches) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciales invalidas.',
      attemptedClientId: clientId,
    };
  }

  // El estado se evalua DESPUES de verificar el secreto: quien no tiene la
  // credencial correcta no puede distinguir "no existe" de "esta revocada"
  if (!client.is_active || client.revoked_at) {
    return {
      ok: false,
      status: 403,
      code: 'CREDENTIAL_REVOKED',
      message: 'La credencial fue revocada o esta inactiva.',
      attemptedClientId: clientId,
    };
  }

  try {
    await prisma.external_api_clients.update({
      where: { id: client.id },
      data: { last_used_at: new Date() },
    });
  } catch (error) {
    // No es motivo para rechazar la consulta: el dato es informativo
    logger.error('No se pudo actualizar la fecha de ultimo uso', { data: { error, clientId: client.id } });
  }

  return {
    ok: true,
    client: { id: client.id, companyId: client.company_id, name: client.name },
    attemptedClientId: clientId,
  };
}
