'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { configPermissionError } from '../../lib/config-access.server';
import { covenantScope } from '../lib/cct-scope';
import type { CctMutationResult } from './types';

const logger = new Logger('features/Empresa/CCT/categories');

const categoryInputSchema = z.object({
  name: z.string().trim().min(2, 'El nombre de la categoría debe tener al menos 2 caracteres'),
  covenant_id: z.string().uuid('Convenio inválido'),
});

/** Primera letra en mayúscula: el catálogo se venía cargando así desde el modal. */
function normalizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed.slice(0, 1).toUpperCase() + trimmed.slice(1);
}

/**
 * Alta de categoría dentro de un convenio.
 *
 * `category` no tiene `company_id`: el perímetro sale del convenio padre, que tiene que ser de
 * la empresa activa. El nombre no puede repetirse dentro del mismo convenio (ticket 616).
 */
export async function createCategory(input: { name: string; covenant_id: string }): Promise<CctMutationResult> {
  const denied = await configPermissionError('convenios', 'create');
  if (denied) return { ok: false, error: denied };

  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  try {
    const companyId = await getActiveCompanyId();
    const name = normalizeName(parsed.data.name);
    const { covenant_id } = parsed.data;

    const covenant = await prisma.covenant.findFirst({
      where: { id: covenant_id, ...covenantScope(companyId) },
      select: { id: true },
    });
    if (!covenant) return { ok: false, error: 'El convenio no existe.' };

    const existing = await prisma.category.findFirst({
      where: { covenant_id, name: { equals: name, mode: 'insensitive' } },
      select: { name: true },
    });
    if (existing) return { ok: false, error: `Ya existe la categoría "${existing.name}" en este convenio.` };

    const created = await prisma.category.create({
      data: { name, covenant_id },
      select: { id: true },
    });

    revalidatePath('/dashboard/configuration');
    return { ok: true, id: created.id };
  } catch (error) {
    logger.error('Error al crear categoría', { data: { error } });
    return { ok: false, error: 'No se pudo crear la categoría. Intente nuevamente.' };
  }
}
