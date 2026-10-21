'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { NO_PERMISSION, UUID_RE, firstIssue, toTreasuryActionError } from '../lib/action-errors';
import { treasuryConceptFormSchema, type TreasuryConceptFormValues } from '../schemas/concepts';
import { revalidateTreasury } from './shared';

/** Conceptos de los movimientos manuales (spec Tesorería etapa 1 §2.2). */

const logger = new Logger('features/Treasury/concepts');

const NOT_FOUND = 'El concepto no existe';
const duplicate = (name: string) => `Ya existe el concepto «${name}»`;

/** Todos los conceptos, con cuántos movimientos los usan. Los ve quien configura y quien carga movimientos. */
export async function getTreasuryConcepts() {
  const allowed = await Promise.all([
    checkPermissionServer('tesoreria', 'config-tesoreria', 'view'),
    checkPermissionServer('tesoreria', 'movimientos', 'view'),
  ]);
  if (!allowed.some(Boolean)) return [];
  const companyId = await getActiveCompanyId();
  const rows = await prisma.treasury_concepts.findMany({
    where: { company_id: companyId },
    select: { id: true, name: true, direction: true, is_active: true, _count: { select: { movements: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map(({ _count, ...r }) => ({ ...r, used: _count.movements > 0 }));
}

export type TreasuryConceptRow = Awaited<ReturnType<typeof getTreasuryConcepts>>[number];

async function findDuplicate(companyId: string, name: string, exceptId?: string) {
  return prisma.treasury_concepts.findFirst({
    where: {
      company_id: companyId,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
}

export async function createTreasuryConcept(values: TreasuryConceptFormValues): Promise<ActionResult<{ id: string }>> {
  if (!(await checkPermissionServer('tesoreria', 'config-tesoreria', 'create'))) return fail(NO_PERMISSION);
  const parsed = treasuryConceptFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    const existing = await findDuplicate(companyId, v.name);
    if (existing) return fail(duplicate(existing.name));
    const created = await prisma.treasury_concepts.create({
      data: { name: v.name, direction: v.direction },
      select: { id: true },
    });
    revalidateTreasury();
    return ok(created);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'crear el concepto', duplicate(v.name));
  }
}

/** Un concepto ya usado conserva su sentido: cambiarlo dejaría movimientos que no lo cumplen. */
export async function updateTreasuryConcept(id: string, values: TreasuryConceptFormValues): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'config-tesoreria', 'update'))) return fail(NO_PERMISSION);
  const parsed = treasuryConceptFormSchema.safeParse(values);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  const v = parsed.data;
  try {
    const current = await prisma.treasury_concepts.findFirst({
      where: { id, company_id: companyId },
      select: { direction: true, _count: { select: { movements: true } } },
    });
    if (!current) return fail(NOT_FOUND);
    if (current.direction !== v.direction && current._count.movements > 0) {
      return fail('El concepto ya se usó en movimientos: no se puede cambiar su sentido');
    }
    const existing = await findDuplicate(companyId, v.name, id);
    if (existing) return fail(duplicate(existing.name));
    await prisma.treasury_concepts.update({ where: { id }, data: { name: v.name, direction: v.direction } });
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'actualizar el concepto', duplicate(v.name));
  }
}

export async function setTreasuryConceptActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'config-tesoreria', 'update'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  try {
    const { count } = await prisma.treasury_concepts.updateMany({
      where: { id, company_id: companyId },
      data: { is_active: isActive },
    });
    if (count === 0) return fail(NOT_FOUND);
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, isActive ? 'reactivar el concepto' : 'desactivar el concepto');
  }
}

/** Un concepto usado no se borra: se desactiva. */
export async function deleteTreasuryConcept(id: string): Promise<ActionResult> {
  if (!(await checkPermissionServer('tesoreria', 'config-tesoreria', 'delete'))) return fail(NO_PERMISSION);
  if (!UUID_RE.test(id)) return fail(NOT_FOUND);
  const companyId = await getActiveCompanyId();
  try {
    const current = await prisma.treasury_concepts.findFirst({
      where: { id, company_id: companyId },
      select: { _count: { select: { movements: true } } },
    });
    if (!current) return fail(NOT_FOUND);
    if (current._count.movements > 0) return fail('El concepto se usó en movimientos: desactivalo');
    await prisma.treasury_concepts.delete({ where: { id } });
    revalidateTreasury();
    return ok(null);
  } catch (error) {
    return toTreasuryActionError(error, logger, 'borrar el concepto');
  }
}
