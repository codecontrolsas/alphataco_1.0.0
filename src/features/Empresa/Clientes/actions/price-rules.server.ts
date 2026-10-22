'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { fromDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { errorMessage, fail, ok, type ActionResult } from '../lib/action-result';
import { PriceFactorError, applyFactor, indexFactor, polynomialFactor } from '../lib/price-factor';
import { writePriceRevision } from '../lib/price-revision-writer';
import { assertComercialView } from '../lib/require-permission.server';
import { polynomialConfigSchema, priceRuleFormSchema, type PriceRuleFormValues } from '../schemas/price-rule';

const logger = new Logger('features/Empresa/Clientes/price-rules');

const COMERCIAL_PATH = '/dashboard/comercial';

/**
 * Reglas de actualización de precios.
 *
 * Una regla con `customer_service_id` en null aplica a toda la empresa; con contrato, sólo a
 * ese. Eso es el "adaptable a cada empresa y a cada contrato" del pedido.
 *
 * La regla guarda la ESTRUCTURA (qué índice, qué componentes y con qué peso). Los coeficientes
 * de cada período se entregan al ejecutarla, porque son del momento y no de la regla.
 */

export async function getPriceUpdateRules() {
  await assertComercialView(['reglas-precio']);
  const companyId = await getActiveCompanyId();

  try {
    return await prisma.price_update_rules.findMany({
      where: { company_id: companyId },
      select: {
        id: true,
        name: true,
        method: true,
        config: true,
        is_active: true,
        created_at: true,
        customer_services: { select: { id: true, service_name: true, customers: { select: { name: true } } } },
        _count: { select: { runs: true } },
      },
      orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
    });
  } catch (error) {
    logger.error('Error al obtener las reglas de precio', { data: { error, companyId } });
    throw error;
  }
}

export type PriceUpdateRuleRow = Awaited<ReturnType<typeof getPriceUpdateRules>>[number];

/** Perímetro: si la regla apunta a un contrato, ese contrato tiene que ser de la empresa. */
async function assertServiceOwned(customerServiceId: string | null, companyId: string) {
  if (!customerServiceId) return;
  const service = await prisma.customer_services.findFirst({
    where: { id: customerServiceId, customers: { company_id: companyId } },
    select: { id: true },
  });
  if (!service) throw new Error('Contrato no encontrado');
}

/**
 * Contratos de la empresa para elegir el alcance de una regla.
 *
 * Es una consulta propia y mínima en vez de reusar `getCustomerServices`: ese trae el include
 * completo del contrato (documentos, ítems, cliente) para alimentar la ficha, y acá sólo se
 * necesita el texto de un `<Select>`.
 */
export async function getContractOptionsForRules() {
  await assertComercialView(['reglas-precio', 'certificaciones']);
  const companyId = await getActiveCompanyId();
  try {
    const rows = await prisma.customer_services.findMany({
      where: { customers: { company_id: companyId } },
      select: { id: true, service_name: true, contract_number: true, customers: { select: { name: true } } },
      orderBy: [{ customers: { name: 'asc' } }, { service_name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      label: [row.customers?.name, row.service_name, row.contract_number && `N° ${row.contract_number}`]
        .filter(Boolean)
        .join(' · '),
    }));
  } catch (error) {
    logger.error('Error al obtener los contratos para reglas', { data: { error, companyId } });
    throw error;
  }
}

export type ContractOption = Awaited<ReturnType<typeof getContractOptionsForRules>>[number];

export async function savePriceUpdateRule(
  input: PriceRuleFormValues & { id?: string }
): Promise<ActionResult<{ id: string }>> {
  const parsed = priceRuleFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const values = parsed.data;

  const canWrite = await checkPermissionServer('comercial', 'reglas-precio', input.id ? 'update' : 'create');
  if (!canWrite) return fail('No tenés permiso para administrar reglas de precio');

  const companyId = await getActiveCompanyId();

  // Una polinómica cuyos pesos no suman 1 deja de representar el precio entero: se rechaza al
  // guardar y no al ejecutar, para no descubrirlo recién cuando ya actualizó 200 ítems.
  if (values.method === 'polynomial') {
    try {
      polynomialFactor(values.config.components.map((c) => ({ ...c, coefficient: 1 })));
    } catch (error) {
      if (error instanceof PriceFactorError) return fail(error.message);
      throw error;
    }
  }

  try {
    await assertServiceOwned(values.customerServiceId, companyId);
    const createdBy = await getSessionUserId();

    const data = {
      company_id: companyId,
      customer_service_id: values.customerServiceId,
      name: values.name,
      method: values.method,
      config: values.config as Prisma.InputJsonValue,
    };

    let saved: { id: string };
    if (input.id) {
      // El `where` lleva `company_id`: con `where: { id }` solo, el id de una regla de otra
      // empresa alcanzaria para editarla. `updateMany` es lo que permite filtrar por las dos.
      const { count } = await prisma.price_update_rules.updateMany({
        where: { id: input.id, company_id: companyId },
        data: { ...data, company_id: undefined },
      });
      if (count === 0) return fail('Regla no encontrada');
      saved = { id: input.id };
    } else {
      saved = await prisma.price_update_rules.create({
        data: { ...data, created_by: createdBy },
        select: { id: true },
      });
    }

    logger.info('Regla de precio guardada', { data: { ruleId: saved.id, method: values.method } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ id: saved.id });
  } catch (error) {
    logger.error('Error al guardar la regla de precio', { data: { error } });
    return fail(errorMessage(error, 'Error al guardar la regla de precio'));
  }
}

export async function setPriceUpdateRuleActive(ruleId: string, isActive: boolean): Promise<ActionResult<null>> {
  const canWrite = await checkPermissionServer('comercial', 'reglas-precio', 'update');
  if (!canWrite) return fail('No tenés permiso para administrar reglas de precio');

  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.price_update_rules.updateMany({
      where: { id: ruleId, company_id: companyId },
      data: { is_active: isActive },
    });
    if (count === 0) return fail('Regla no encontrada');
    revalidatePath(COMERCIAL_PATH);
    return ok(null);
  } catch (error) {
    logger.error('Error al cambiar el estado de la regla', { data: { error, ruleId } });
    return fail(errorMessage(error, 'Error al cambiar el estado de la regla'));
  }
}

interface RunRuleInput {
  ruleId: string;
  /** Desde cuándo rige el precio nuevo. */
  validFrom: string;
  /** Para `index`: el coeficiente del período (1.15 = subió 15%). */
  coefficient?: string;
  /** Para `polynomial`: el coeficiente de cada componente, por nombre. */
  coefficients?: Record<string, string>;
  note?: string | null;
}

/**
 * Ejecuta una regla: calcula el factor, lo aplica a los ítems alcanzados y deja una revisión
 * por ítem, todo colgando de una corrida.
 *
 * Cada revisión apunta a su `price_update_runs`, así un precio siempre puede explicar de dónde
 * salió: qué regla, qué día, quién la corrió y con qué coeficientes.
 *
 * Todo en UNA transacción: si falla a la mitad, no queda medio catálogo actualizado.
 */
export async function runPriceUpdateRule(input: RunRuleInput): Promise<ActionResult<{ runId: string; items: number }>> {
  const canUpdatePrices = await checkPermissionServer('comercial', 'items-contrato', 'update_prices');
  if (!canUpdatePrices) return fail('No tenés permiso para modificar precios');

  const companyId = await getActiveCompanyId();

  // `valid_from` es @db.Date: 'YYYY-MM-DD' estricto, a medianoche UTC.
  let parsedFrom: Date | null = null;
  try {
    parsedFrom = fromDateOnly(input.validFrom);
  } catch {
    parsedFrom = null;
  }
  if (!parsedFrom) return fail('La fecha de vigencia no es válida');
  const validFrom: Date = parsedFrom;

  try {
    const rule = await prisma.price_update_rules.findFirst({
      where: { id: input.ruleId, company_id: companyId },
      select: { id: true, name: true, method: true, config: true, is_active: true, customer_service_id: true },
    });
    if (!rule) return fail('Regla no encontrada');
    if (!rule.is_active) return fail('La regla está desactivada');

    if (rule.method === 'manual') {
      // No es una limitación técnica: una regla manual declara que en ese contrato los precios
      // se escriben uno por uno. El camino es `applyPriceRevision`.
      return fail('Esta regla es manual: los precios se cargan uno por uno desde el ítem');
    }

    let factor;
    try {
      if (rule.method === 'index') {
        if (!input.coefficient) return fail('Falta el coeficiente del índice');
        factor = indexFactor(input.coefficient);
      } else {
        const config = polynomialConfigSchema.parse(rule.config);
        const faltante = config.components.find((c) => !input.coefficients?.[c.name]);
        if (faltante) return fail(`Falta el coeficiente de "${faltante.name}"`);
        factor = polynomialFactor(config.components.map((c) => ({ ...c, coefficient: input.coefficients![c.name] })));
      }
    } catch (error) {
      if (error instanceof PriceFactorError) return fail(error.message);
      throw error;
    }

    // Alcance: el contrato de la regla, o todos los de la empresa si no tiene contrato.
    const items = await prisma.service_items.findMany({
      where: {
        is_active: true,
        customer_services: {
          customers: { company_id: companyId },
          ...(rule.customer_service_id ? { id: rule.customer_service_id } : {}),
        },
      },
      select: { id: true, item_price: true },
    });

    if (items.length === 0) return fail('La regla no alcanza a ningún ítem activo');

    const appliedBy = await getSessionUserId();

    const run = await prisma.$transaction(async (tx) => {
      const createdRun = await tx.price_update_runs.create({
        data: {
          rule_id: rule.id,
          applied_by: appliedBy,
          items_affected: items.length,
          note: input.note?.trim() || null,
        },
        select: { id: true },
      });

      for (const item of items) {
        await writePriceRevision(tx, {
          serviceItemId: item.id,
          price: applyFactor(item.item_price, factor),
          previousPrice: item.item_price,
          validFrom,
          source: rule.method,
          reason: `${rule.name} (factor ${factor.toString()})`,
          createdBy: appliedBy,
          runId: createdRun.id,
        });
      }

      return createdRun;
    });

    logger.info('Regla de precio ejecutada', {
      data: { ruleId: rule.id, runId: run.id, items: items.length, factor: factor.toString() },
    });
    revalidatePath(COMERCIAL_PATH);
    return ok({ runId: run.id, items: items.length });
  } catch (error) {
    logger.error('Error al ejecutar la regla de precio', { data: { error, ruleId: input.ruleId } });
    return fail(errorMessage(error, 'Error al ejecutar la regla de precio'));
  }
}
