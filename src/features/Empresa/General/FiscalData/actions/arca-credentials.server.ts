'use server';

import { formatSalesPoint, formatVoucherNumber } from '@/features/Comercial/Facturacion/lib/invoice-type';
import { errorMessage, fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { isValidCuit } from '@/features/Empresa/General/lib/company-form';
import { checkPermissionServer } from '@/features/Permissions';
import { Prisma } from '@/generated/prisma/client';
import type { arca_environment } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { CBTE_TYPES, EMITTER_LETTERS, cbteTypeFor } from '@/shared/lib/arca/catalogs';
import { certificateMatchesKey, certificateProblems, inspectCertificate } from '@/shared/lib/arca/certificate';
import { generateKeyAndCsr } from '@/shared/lib/arca/csr';
import {
  ArcaAuthError,
  ArcaBusyError,
  ArcaConfigError,
  ArcaProtocolError,
  ArcaServiceError,
  ArcaTokenUnavailableError,
  ArcaTransportError,
} from '@/shared/lib/arca/errors';
import { decryptSecret, encryptSecret } from '@/shared/lib/arca/secrets';
import { getArcaGateway, isArcaMockMode } from '@/shared/lib/arca/server/gateway';
import { normalizeCompanyCuit, secretAad } from '@/shared/lib/arca/server/session';
import { isDummyOk } from '@/shared/lib/arca/wsfe';
import { formatArgentinaDateTime, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import type { ConnectionCheck } from '../lib/fiscal-data-overview.server';
import { ENVIRONMENT_LABELS, certificateAliasSchema } from '../schemas/fiscal-data';

const logger = new Logger('features/Empresa/General/FiscalData/arca-credentials');

const CONFIG_PATH = '/dashboard/configuration';

async function assertCanUpdate(): Promise<string | null> {
  const canUpdate = await checkPermissionServer('configuracion', 'datos-fiscales', 'update');
  return canUpdate ? null : 'No tenés permiso para administrar el certificado de ARCA';
}

/**
 * Paso 1: genera la clave privada (queda cifrada en la base) y el CSR para subir a ARCA. Si ya
 * había una solicitud pendiente en ese ambiente, la reemplaza: el certificado que ARCA devuelva
 * para la anterior ya no se va a poder cargar (la UI lo advierte antes).
 */
export async function generateArcaCsr(env: arca_environment, alias: string): Promise<ActionResult<{ csrPem: string }>> {
  const denied = await assertCanUpdate();
  if (denied) return fail(denied);

  const parsedAlias = certificateAliasSchema.safeParse(alias);
  if (!parsedAlias.success) return fail(parsedAlias.error.issues[0]?.message ?? 'Alias inválido');

  const companyId = await getActiveCompanyId();
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { company_name: true, company_cuit: true },
    });
    if (!company) return fail('Empresa no encontrada');
    const cuit = normalizeCompanyCuit(company.company_cuit);
    if (!isValidCuit(cuit)) return fail('El CUIT de la empresa no es válido. Corregilo en Configuración → Empresa.');

    const { privateKeyPem, csrPem } = generateKeyAndCsr({
      cuit,
      organization: company.company_name,
      alias: parsedAlias.data,
    });
    const userId = await getSessionUserId();

    await prisma.$transaction([
      prisma.arca_credentials.deleteMany({ where: { company_id: companyId, environment: env, status: 'pendiente' } }),
      prisma.arca_credentials.create({
        data: {
          company_id: companyId,
          environment: env,
          status: 'pendiente',
          alias: parsedAlias.data,
          private_key_enc: encryptSecret(privateKeyPem, secretAad(companyId, env, 'private_key')),
          csr_pem: csrPem,
          created_by: userId,
        },
      }),
    ]);

    logger.info('Solicitud de certificado generada', { data: { companyId, env, alias: parsedAlias.data } });
    revalidatePath(CONFIG_PATH);
    return ok({ csrPem });
  } catch (error) {
    logger.error('Error al generar la solicitud de certificado', {
      data: { error: errorMessage(error, ''), companyId, env },
    });
    return fail(errorMessage(error, 'Error al generar la solicitud de certificado'));
  }
}

export async function discardPendingArcaCsr(env: arca_environment): Promise<ActionResult<null>> {
  const denied = await assertCanUpdate();
  if (denied) return fail(denied);

  const companyId = await getActiveCompanyId();
  await prisma.arca_credentials.deleteMany({ where: { company_id: companyId, environment: env, status: 'pendiente' } });
  revalidatePath(CONFIG_PATH);
  return ok(null);
}

/** Los certificados de homologación los emite la AC "Computadores Test"; los de producción, "Computadores". */
function issuerEnvironment(issuer: string): arca_environment | null {
  if (/CN=Computadores Test/i.test(issuer)) return 'homologacion';
  if (/CN=Computadores(\s|$|,)/i.test(issuer)) return 'produccion';
  return null;
}

/**
 * Paso 3: carga el `.crt` que devolvió ARCA. Se valida contra la clave de la solicitud pendiente,
 * el CUIT de la empresa, la vigencia y el ambiente; recién ahí reemplaza al certificado activo.
 */
export async function uploadArcaCertificate(
  env: arca_environment,
  certificatePem: string
): Promise<ActionResult<{ notAfter: string }>> {
  const denied = await assertCanUpdate();
  if (denied) return fail(denied);

  const companyId = await getActiveCompanyId();
  const pem = certificatePem.trim();
  if (!pem.includes('BEGIN CERTIFICATE')) {
    return fail(
      'El archivo no es un certificado en formato PEM (tiene que empezar con "-----BEGIN CERTIFICATE-----").'
    );
  }

  try {
    const [company, pending] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { company_cuit: true } }),
      prisma.arca_credentials.findFirst({
        where: { company_id: companyId, environment: env, status: 'pendiente' },
        select: { id: true, private_key_enc: true, created_at: true },
      }),
    ]);
    if (!company) return fail('Empresa no encontrada');
    if (!pending) return fail('Primero generá la solicitud (paso 1) y subila a ARCA.');

    let info;
    try {
      info = inspectCertificate(pem);
    } catch (error) {
      return fail(errorMessage(error, 'El archivo no es un certificado válido'));
    }

    const privateKeyPem = decryptSecret(pending.private_key_enc, secretAad(companyId, env, 'private_key'));
    if (!certificateMatchesKey(pem, privateKeyPem)) {
      return fail(
        `Este certificado no corresponde a la solicitud generada el ${formatArgentinaDay(pending.created_at)}. ` +
          'Cargá el certificado que ARCA devolvió para esa solicitud, o generá una nueva.'
      );
    }

    const certEnv = issuerEnvironment(info.issuer);
    if (certEnv && certEnv !== env) {
      return fail(
        `El certificado es de ${ENVIRONMENT_LABELS[certEnv].toLowerCase()} y estás configurando ${ENVIRONMENT_LABELS[env].toLowerCase()}.`
      );
    }

    const cuit = normalizeCompanyCuit(company.company_cuit);
    const problems = certificateProblems(info, { cuit, now: new Date() });
    if (problems.length > 0) return fail(problems.join('. '));

    await prisma.$transaction([
      prisma.arca_credentials.updateMany({
        where: { company_id: companyId, environment: env, status: 'activo' },
        data: { status: 'reemplazado' },
      }),
      prisma.arca_credentials.update({
        where: { id: pending.id },
        data: {
          status: 'activo',
          certificate_pem: pem,
          cert_subject: info.subject,
          cert_issuer: info.issuer,
          cert_serial: info.serialNumber,
          cert_not_before: info.notBefore,
          cert_not_after: info.notAfter,
          activated_at: new Date(),
        },
      }),
      // El ticket de WSAA del certificado anterior ya no sirve.
      prisma.arca_tokens.deleteMany({ where: { company_id: companyId, environment: env } }),
    ]);

    logger.info('Certificado de ARCA cargado', { data: { companyId, env, notAfter: info.notAfter } });
    revalidatePath(CONFIG_PATH);
    return ok({ notAfter: info.notAfter.toISOString() });
  } catch (error) {
    logger.error('Error al cargar el certificado', { data: { error: errorMessage(error, ''), companyId, env } });
    return fail(errorMessage(error, 'Error al cargar el certificado'));
  }
}

/** Traduce un error de ARCA a qué hacer, sin perder el mensaje técnico. */
function describeArcaError(error: unknown): { detail: string; technical: string } {
  const technical =
    error instanceof ArcaAuthError ? `${error.faultCode}: ${error.message}` : errorMessage(error, 'Error desconocido');
  if (error instanceof ArcaAuthError) {
    if (/notAuthorized/i.test(error.faultCode)) {
      return {
        detail:
          'El certificado no está autorizado para el servicio de facturación. Volvé al paso 2 y creá la autorización para "wsfe".',
        technical,
      };
    }
    if (/untrusted/i.test(error.faultCode)) {
      return {
        detail:
          'ARCA no reconoce el certificado en este ambiente. Revisá que sea el certificado de este ambiente y no del otro.',
        technical,
      };
    }
    if (/expired/i.test(error.faultCode)) return { detail: 'ARCA informa que el certificado está vencido.', technical };
    return { detail: 'ARCA rechazó la autenticación con este certificado.', technical };
  }
  if (
    error instanceof ArcaTokenUnavailableError ||
    error instanceof ArcaConfigError ||
    error instanceof ArcaBusyError
  ) {
    return { detail: error.message, technical };
  }
  if (error instanceof ArcaTransportError || error instanceof ArcaProtocolError) {
    return {
      detail: 'ARCA no responde. Tu configuración puede estar bien: probá de nuevo en unos minutos.',
      technical,
    };
  }
  if (error instanceof ArcaServiceError) return { detail: 'ARCA devolvió un error.', technical };
  return { detail: 'No se pudo completar la prueba.', technical };
}

/**
 * Paso 4: prueba real contra ARCA, un chequeo por cosa que se verifica (sin pasos inventados):
 * servidores, autenticación y el último comprobante de cada punto de venta activo. El resultado
 * se guarda en el certificado para mostrarlo al volver a la pantalla.
 *
 * Con ARCA simulado (`ARCA_MODE=mock`) no hace falta certificado y cada chequeo lo aclara.
 */
export async function testArcaConnection(
  env: arca_environment
): Promise<ActionResult<{ ok: boolean; checks: ConnectionCheck[] }>> {
  const denied = await assertCanUpdate();
  if (denied) return fail(denied);

  const companyId = await getActiveCompanyId();
  const simulated = isArcaMockMode();
  const credential = await prisma.arca_credentials.findFirst({
    where: { company_id: companyId, environment: env, status: 'activo' },
    select: { id: true },
  });
  if (!credential && !simulated)
    return fail(`No hay un certificado de ${ENVIRONMENT_LABELS[env].toLowerCase()} cargado.`);

  const suffix = simulated ? ' (simulado)' : '';
  const checks: ConnectionCheck[] = [];

  try {
    const gateway = await getArcaGateway(companyId, env);

    try {
      const status = await gateway.dummy();
      checks.push(
        isDummyOk(status)
          ? { key: 'servers', ok: true, label: `Servidores de ARCA: disponibles${suffix}` }
          : {
              key: 'servers',
              ok: false,
              label: 'Servidores de ARCA: con problemas',
              detail: 'ARCA informa servicios caídos. Probá de nuevo más tarde.',
              technical: `AppServer=${status.appServer} DbServer=${status.dbServer} AuthServer=${status.authServer}`,
            }
      );
    } catch (error) {
      checks.push({
        key: 'servers',
        ok: false,
        label: 'Servidores de ARCA: sin respuesta',
        ...describeArcaError(error),
      });
    }

    if (checks[0]?.ok) {
      checks.push({
        key: 'auth',
        ok: true,
        label: `Autenticación: correcta${suffix}. Ticket de acceso vigente hasta el ${formatArgentinaDateTime(gateway.tokenExpiresAt)}`,
      });

      const [profile, salesPoints] = await Promise.all([
        prisma.company_fiscal_profiles.findUnique({
          where: { company_id: companyId },
          select: { tax_condition: true },
        }),
        prisma.sales_points.findMany({
          where: { company_id: companyId, is_active: true },
          select: { number: true },
          orderBy: { number: 'asc' },
        }),
      ]);
      const types = profile
        ? EMITTER_LETTERS[profile.tax_condition].map((letter) => {
            const type = cbteTypeFor(letter, 'invoice');
            return { type, label: CBTE_TYPES[type].label };
          })
        : [];

      // Una consulta por punto de venta y tipo, en paralelo (cada una es una llamada SOAP).
      const pvChecks = await Promise.all(
        salesPoints.flatMap((point) =>
          types.map(async (t): Promise<ConnectionCheck> => {
            const pv = formatSalesPoint(point.number);
            try {
              const last = await gateway.lastAuthorized(point.number, t.type);
              return {
                key: `pv:${point.number}:${t.type}`,
                ok: true,
                label: `Punto de venta ${pv}, ${t.label}: ${last === 0 ? 'sin comprobantes todavía' : `último autorizado ${formatVoucherNumber(point.number, last)}`}`,
              };
            } catch (error) {
              return {
                key: `pv:${point.number}:${t.type}`,
                ok: false,
                label: `Punto de venta ${pv}, ${t.label}: no se pudo consultar`,
                ...describeArcaError(error),
              };
            }
          })
        )
      );
      checks.push(...pvChecks);
    }
  } catch (error) {
    // Falló la autenticación (getArcaGateway pide el ticket de WSAA).
    checks.push({ key: 'auth', ok: false, label: 'Autenticación: rechazada', ...describeArcaError(error) });
  }

  const allOk = checks.every((c) => c.ok);
  if (credential) {
    await prisma.arca_credentials.update({
      where: { id: credential.id },
      data: {
        last_test_at: new Date(),
        last_test_ok: allOk,
        last_test_result: checks as unknown as Prisma.InputJsonValue,
      },
    });
  }

  logger.info('Prueba de conexión con ARCA', {
    data: { companyId, env, simulated, ok: allOk, failed: checks.filter((c) => !c.ok).map((c) => c.key) },
  });
  if (!allOk && checks.some((c) => !c.ok && c.technical)) {
    logger.warn('Detalle de la prueba fallida', { data: { checks: checks.filter((c) => !c.ok) } });
  }
  revalidatePath(CONFIG_PATH);
  return ok({ ok: allOk, checks });
}
