'use server';

import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { configPermissionError } from '../../lib/config-access.server';
import { covenantScope, guildReadScope } from '../lib/cct-scope';
import type { CctMutationResult } from './types';

const logger = new Logger('features/Empresa/CCT/covenants');

const covenantInputSchema = z.object({
  name: z.string().trim().min(2, 'El nombre del convenio debe tener al menos 2 caracteres'),
  guild_id: z.string().uuid('Sindicato inválido'),
});

/**
 * Alta de convenio dentro de un sindicato.
 *
 * El sindicato tiene que ser legible por la empresa activa (propio o global) y el nombre del
 * convenio no puede repetirse **dentro de ese sindicato**: el mismo número en otro sindicato
 * es válido (ticket 616).
 */
export async function createCovenant(input: { name: string; guild_id: string }): Promise<CctMutationResult> {
  const denied = await configPermissionError('convenios', 'create');
  if (denied) return { ok: false, error: denied };

  const parsed = covenantInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  try {
    const companyId = await getActiveCompanyId();
    const { name, guild_id } = parsed.data;

    const guild = await prisma.guild.findFirst({
      where: { id: guild_id, ...guildReadScope(companyId) },
      select: { id: true },
    });
    if (!guild) return { ok: false, error: 'El sindicato no existe.' };

    const existing = await prisma.covenant.findFirst({
      where: { ...covenantScope(companyId), guild_id, name: { equals: name, mode: 'insensitive' } },
      select: { name: true },
    });
    if (existing) return { ok: false, error: `Ya existe el convenio "${existing.name}" en este sindicato.` };

    const created = await prisma.covenant.create({
      data: { name, guild_id, ...covenantScope(companyId) },
      select: { id: true },
    });

    revalidatePath('/dashboard/configuration');
    return { ok: true, id: created.id };
  } catch (error) {
    logger.error('Error al crear convenio', { data: { error } });
    return { ok: false, error: 'No se pudo crear el convenio. Intente nuevamente.' };
  }
}
