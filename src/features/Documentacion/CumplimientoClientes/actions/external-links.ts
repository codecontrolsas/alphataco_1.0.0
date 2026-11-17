'use server';

import { checkMultiplePermissionsServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { appBaseUrl } from '@/shared/lib/app-url';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

const logger = new Logger('features/Documentacion/CumplimientoClientes/external-links');

/** Quien puede subir documentos de personal o de equipos puede abrirle la puerta a un tercero. */
async function linkPermissions() {
  const granted = await checkMultiplePermissionsServer([
    { moduleSlug: 'documentacion', tabSlug: 'docs-empleados-permanentes', actionSlug: 'update' },
    { moduleSlug: 'documentacion', tabSlug: 'docs-equipos-permanentes', actionSlug: 'update' },
  ]);
  return {
    people: granted.get('documentacion:docs-empleados-permanentes:update') === true,
    equipment: granted.get('documentacion:docs-equipos-permanentes:update') === true,
  };
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function getExternalUploadLinks() {
  const perms = await linkPermissions();
  if (!perms.people && !perms.equipment)
    return { ok: false as const, error: 'No tenés permiso para gestionar links de carga' };
  const companyId = await getActiveCompanyId();
  const links = await prisma.external_upload_links.findMany({
    where: { company_id: companyId },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      label: true,
      scope: true,
      expires_at: true,
      revoked_at: true,
      created_at: true,
      last_used_at: true,
      uploads_count: true,
    },
  });
  const now = Date.now();
  return {
    ok: true as const,
    canPeople: perms.people,
    canEquipment: perms.equipment,
    links: links.map((l) => ({
      id: l.id,
      label: l.label,
      scope: l.scope as 'Persona' | 'Equipos' | 'Ambos',
      expiresAt: l.expires_at.toISOString(),
      createdAt: l.created_at.toISOString(),
      lastUsedAt: l.last_used_at?.toISOString() ?? null,
      uploads: l.uploads_count,
      state: l.revoked_at
        ? ('revoked' as const)
        : l.expires_at.getTime() < now
          ? ('expired' as const)
          : ('active' as const),
    })),
  };
}

export type ExternalLinksData = Extract<Awaited<ReturnType<typeof getExternalUploadLinks>>, { ok: true }>;

const createSchema = z.object({
  label: z.string().trim().min(3, 'Indicá para quién es el link').max(120),
  scope: z.enum(['Persona', 'Equipos', 'Ambos']),
  days: z.number().int().min(1).max(90),
});

/**
 * Crea un link de carga externa. El token en claro se devuelve UNA vez (se guarda solo su hash): el link se copia en
 * ese momento.
 */
export async function createExternalUploadLink(input: z.input<typeof createSchema>) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const perms = await linkPermissions();
  const { scope } = parsed.data;
  const allowed =
    scope === 'Persona' ? perms.people : scope === 'Equipos' ? perms.equipment : perms.people && perms.equipment;
  if (!allowed) return { ok: false as const, error: 'No tenés permiso para abrir la carga de esos documentos' };

  const token = randomBytes(24).toString('base64url');
  try {
    await prisma.external_upload_links.create({
      data: {
        label: parsed.data.label,
        scope,
        token_hash: hashToken(token),
        expires_at: new Date(Date.now() + parsed.data.days * 86_400_000),
        created_by: await getSessionUserId(),
      },
    });
    return { ok: true as const, url: `${appBaseUrl()}/carga-externa/${token}` };
  } catch (error) {
    logger.error('Error al crear el link de carga externa', { data: { error } });
    return { ok: false as const, error: 'No se pudo crear el link' };
  }
}

export async function revokeExternalUploadLink(id: string) {
  if (!z.string().uuid().safeParse(id).success) return { ok: false as const, error: 'Link inválido' };
  const perms = await linkPermissions();
  if (!perms.people && !perms.equipment)
    return { ok: false as const, error: 'No tenés permiso para gestionar links de carga' };
  const companyId = await getActiveCompanyId();
  const result = await prisma.external_upload_links.updateMany({
    where: { id, company_id: companyId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
  return result.count === 1 ? { ok: true as const } : { ok: false as const, error: 'El link ya estaba revocado' };
}
