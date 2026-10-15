'use server';

import { errorMessage, fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { requireAnyView } from '@/features/Empresa/lib/config-access.server';
import { checkPermissionServer } from '@/features/Permissions';
import type { arca_environment } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { isProductionAllowed } from '@/shared/lib/arca/endpoints';
import { isFiscalSecretsKeyConfigured } from '@/shared/lib/arca/secrets';
import { isArcaMockMode } from '@/shared/lib/arca/server/gateway';
import { normalizeCompanyCuit } from '@/shared/lib/arca/server/session';
import { fromDateOnly, toDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { cache } from 'react';
import { computeReadiness, productionBlockers, type CredentialSnapshot } from '../lib/readiness';
import { ENVIRONMENT_LABELS, fiscalProfileSchema, type FiscalProfileValues } from '../schemas/fiscal-data';

const logger = new Logger('features/Empresa/General/FiscalData');

const CONFIG_PATH = '/dashboard/configuration';

/** Resultado de una prueba de conexión, tal como se guarda en `last_test_result`. */
export type ConnectionCheck = {
  key: string;
  ok: boolean;
  label: string;
  detail?: string;
  /** Código y mensaje crudo de ARCA, para el bloque "Respuesta técnica". */
  technical?: string;
};

function isConnectionChecks(value: unknown): value is ConnectionCheck[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'object' && v !== null && 'key' in v && 'ok' in v);
}

/**
 * Todo lo que necesita la pantalla de Datos fiscales en una sola lectura (y la validación de
 * Facturación). Los certificados viajan SOLO como metadatos: nunca la clave ni el PEM del
 * certificado; el CSR sí, porque es público y el usuario lo tiene que subir a ARCA.
 *
 * `cache` deduplica por request: el resumen, el banner de Facturación y la validación previa a
 * emitir comparten una sola consulta.
 */
export const getFiscalDataOverview = cache(async () => {
  // Lo consumen Datos fiscales (Configuración) y Facturación (Comercial): basta ver cualquiera. Sin permiso lanza.
  await requireAnyView([
    ['configuracion', 'datos-fiscales'],
    ['comercial', 'facturacion'],
  ]);
  const companyId = await getActiveCompanyId();

  try {
    const [company, profile, salesPoints, credentials] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { company_name: true, company_cuit: true },
      }),
      prisma.company_fiscal_profiles.findUnique({ where: { company_id: companyId } }),
      prisma.sales_points.findMany({
        where: { company_id: companyId },
        select: { id: true, number: true, name: true, is_active: true },
        orderBy: { number: 'asc' },
      }),
      prisma.arca_credentials.findMany({
        where: { company_id: companyId, status: { in: ['activo', 'pendiente'] } },
        select: {
          id: true,
          environment: true,
          status: true,
          alias: true,
          csr_pem: true,
          cert_subject: true,
          cert_issuer: true,
          cert_not_before: true,
          cert_not_after: true,
          last_test_at: true,
          last_test_ok: true,
          last_test_result: true,
          activated_at: true,
          created_at: true,
        },
      }),
    ]);
    if (!company) throw new Error('Empresa no encontrada');

    const environment: arca_environment = profile?.environment ?? 'homologacion';
    const now = new Date();

    const certificates = Object.fromEntries(
      (['homologacion', 'produccion'] as const).map((env) => {
        const active = credentials.find((c) => c.environment === env && c.status === 'activo');
        const pending = credentials.find((c) => c.environment === env && c.status === 'pendiente');
        return [
          env,
          {
            active: active
              ? {
                  alias: active.alias,
                  subject: active.cert_subject,
                  issuer: active.cert_issuer,
                  notBefore: active.cert_not_before?.toISOString() ?? null,
                  notAfter: active.cert_not_after?.toISOString() ?? now.toISOString(),
                  activatedAt: active.activated_at?.toISOString() ?? null,
                  lastTestAt: active.last_test_at?.toISOString() ?? null,
                  lastTestOk: active.last_test_ok,
                  lastTestChecks: isConnectionChecks(active.last_test_result) ? active.last_test_result : [],
                }
              : null,
            pending: pending
              ? { alias: pending.alias, createdAt: pending.created_at.toISOString(), csrPem: pending.csr_pem }
              : null,
          },
        ];
      })
    ) as Record<
      arca_environment,
      {
        active: {
          alias: string;
          subject: string | null;
          issuer: string | null;
          notBefore: string | null;
          notAfter: string;
          activatedAt: string | null;
          lastTestAt: string | null;
          lastTestOk: boolean | null;
          lastTestChecks: ConnectionCheck[];
        } | null;
        pending: { alias: string; createdAt: string; csrPem: string } | null;
      }
    >;

    const snapshot = (env: arca_environment): CredentialSnapshot => ({
      hasPending: certificates[env].pending !== null,
      active: certificates[env].active,
    });

    const activeSalesPoints = salesPoints.filter((p) => p.is_active).length;
    const simulated = isArcaMockMode();
    // Con ARCA simulado nunca se pasa a producción: los comprobantes no tendrían validez.
    const productionAllowedByServer = isProductionAllowed() && !simulated;

    return {
      company: { name: company.company_name, cuit: normalizeCompanyCuit(company.company_cuit) },
      profile: profile
        ? {
            tax_condition: profile.tax_condition,
            gross_income_regime: profile.gross_income_regime,
            gross_income_number: profile.gross_income_number,
            activity_start_date: toDateOnly(profile.activity_start_date) ?? '',
            fiscal_street: profile.fiscal_street,
            fiscal_city: profile.fiscal_city,
            fiscal_province_id: profile.fiscal_province_id ? String(profile.fiscal_province_id) : '',
            fiscal_postal_code: profile.fiscal_postal_code,
          }
        : null,
      environment,
      environmentChangedAt: profile?.environment_changed_at?.toISOString() ?? null,
      salesPoints,
      certificates,
      readiness: computeReadiness({
        environmentLabel: ENVIRONMENT_LABELS[environment],
        profileComplete: profile !== null,
        activeSalesPoints,
        credential: snapshot(environment),
        simulated,
        now,
      }),
      productionBlockers: productionBlockers({
        profileComplete: profile !== null,
        activeSalesPoints,
        production: snapshot('produccion'),
        productionAllowedByServer,
        now,
      }),
      secretsKeyConfigured: isFiscalSecretsKeyConfigured(),
      /** `ARCA_MODE=mock`: ARCA simulado (demos). La UI lo avisa siempre. */
      arcaSimulated: simulated,
    };
  } catch (error) {
    logger.error('Error al obtener los datos fiscales', { data: { error, companyId } });
    throw error;
  }
});

export type FiscalDataOverview = Awaited<ReturnType<typeof getFiscalDataOverview>>;

export async function saveFiscalProfile(values: FiscalProfileValues): Promise<ActionResult<null>> {
  const canUpdate = await checkPermissionServer('configuracion', 'datos-fiscales', 'update');
  if (!canUpdate) return fail('No tenés permiso para modificar los datos fiscales');

  const parsed = fiscalProfileSchema.safeParse(values);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');

  const companyId = await getActiveCompanyId();
  const data = parsed.data;

  try {
    const fields = {
      tax_condition: data.tax_condition,
      gross_income_regime: data.gross_income_regime,
      gross_income_number: data.gross_income_number,
      activity_start_date: fromDateOnly(data.activity_start_date)!,
      fiscal_street: data.fiscal_street,
      fiscal_city: data.fiscal_city,
      fiscal_province_id: BigInt(data.fiscal_province_id),
      fiscal_postal_code: data.fiscal_postal_code.toUpperCase(),
    };
    await prisma.company_fiscal_profiles.upsert({
      where: { company_id: companyId },
      create: { company_id: companyId, ...fields },
      update: fields,
    });

    logger.info('Datos fiscales guardados', { data: { companyId } });
    revalidatePath(CONFIG_PATH);
    return ok(null);
  } catch (error) {
    logger.error('Error al guardar los datos fiscales', { data: { error, companyId } });
    return fail(errorMessage(error, 'Error al guardar los datos fiscales'));
  }
}

/**
 * Cambia el ambiente con el que se emite. Pasar a producción exige todo lo de
 * `productionBlockers` (se revalida acá, no se confía en el botón) y que el usuario escriba el
 * CUIT de la empresa. Volver a homologación no pide nada más.
 */
export async function setFiscalEnvironment(
  environment: arca_environment,
  confirmCuit?: string
): Promise<ActionResult<null>> {
  const canUpdate = await checkPermissionServer('configuracion', 'datos-fiscales', 'update');
  if (!canUpdate) return fail('No tenés permiso para modificar los datos fiscales');

  const companyId = await getActiveCompanyId();

  try {
    const overview = await getFiscalDataOverview();
    if (!overview.profile) return fail('Primero completá los datos fiscales');
    if (overview.environment === environment) return ok(null);

    if (environment === 'produccion') {
      if (overview.productionBlockers.length > 0) return fail(overview.productionBlockers[0]);
      if (normalizeCompanyCuit(confirmCuit ?? '') !== overview.company.cuit) {
        return fail('El CUIT ingresado no coincide con el de la empresa');
      }
    }

    const userId = await getSessionUserId();
    await prisma.company_fiscal_profiles.update({
      where: { company_id: companyId },
      data: { environment, environment_changed_at: new Date(), environment_changed_by: userId },
    });

    logger.info('Ambiente fiscal cambiado', { data: { companyId, environment, userId } });
    revalidatePath(CONFIG_PATH);
    revalidatePath('/dashboard/comercial');
    return ok(null);
  } catch (error) {
    logger.error('Error al cambiar el ambiente fiscal', { data: { error, companyId, environment } });
    return fail(errorMessage(error, 'Error al cambiar el ambiente'));
  }
}
