'use server';

import { errorMessage, fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { arca_environment } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { normalizeCompanyCuit } from '@/shared/lib/arca/server/session';
import { fromDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { getFiscalDataOverview } from '../lib/fiscal-data-overview.server';
import { fiscalProfileSchema, type FiscalProfileValues } from '../schemas/fiscal-data';

const logger = new Logger('features/Empresa/General/FiscalData');

const CONFIG_PATH = '/dashboard/configuration';

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
