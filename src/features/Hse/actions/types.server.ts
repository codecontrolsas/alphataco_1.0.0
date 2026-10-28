'use server';

import { fail, ok, type ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { getServerAuthProfile } from '@/shared/actions/auth.actions';
import { withActor } from '@/shared/lib/actor';
import { UUID_RE } from '@/shared/lib/storage-buckets';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { isHseEnabled } from '../lib/feature-gate';
import { hseDocumentTypeSchema, type HseDocumentTypeValues } from '../schemas/documents';

/** Tipos de documento HSE (Configuración). Un tipo en uso no se borra: se desactiva. */

const logger = new Logger('features/Hse/types');

async function requireSettings(action: 'create' | 'update' | 'delete') {
  if (!(await isHseEnabled())) return null;
  if (!(await checkPermissionServer('hse', 'configuracion-hse', action))) return null;
  const [profile, companyId] = await Promise.all([getServerAuthProfile(), getActiveCompanyId()]);
  return profile ? { companyId, credentialId: profile.credentialId } : null;
}

const DUPLICATE = 'Ya existe un tipo con ese nombre';
const isDuplicate = (error: unknown) => (error as { code?: string })?.code === 'P2002';

export async function createHseDocumentType(input: HseDocumentTypeValues): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSettings('create');
  if (!auth) return fail('No tenés permiso para hacer esto');
  const parsed = hseDocumentTypeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá los datos');
  try {
    const created = await withActor(auth.credentialId, (tx) =>
      tx.hse_document_types.create({
        data: { company_id: auth.companyId, name: parsed.data.name, description: parsed.data.description || null },
        select: { id: true },
      })
    );
    revalidatePath('/dashboard/hse');
    return ok(created);
  } catch (error) {
    if (isDuplicate(error)) return fail(DUPLICATE);
    logger.error('Error al crear el tipo de documento HSE', { data: { error } });
    return fail('No se pudo crear el tipo');
  }
}

export async function updateHseDocumentType(
  typeId: string,
  input: HseDocumentTypeValues & { isActive: boolean }
): Promise<ActionResult<null>> {
  const auth = await requireSettings('update');
  if (!auth) return fail('No tenés permiso para hacer esto');
  if (!UUID_RE.test(typeId)) return fail('El tipo no existe');
  const parsed = hseDocumentTypeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Revisá los datos');
  try {
    const updated = await withActor(auth.credentialId, (tx) =>
      tx.hse_document_types.updateMany({
        where: { id: typeId, company_id: auth.companyId },
        data: {
          name: parsed.data.name,
          description: parsed.data.description || null,
          is_active: input.isActive === true,
          updated_at: new Date(),
        },
      })
    );
    if (updated.count !== 1) return fail('El tipo no existe');
    revalidatePath('/dashboard/hse');
    return ok(null);
  } catch (error) {
    if (isDuplicate(error)) return fail(DUPLICATE);
    logger.error('Error al editar el tipo de documento HSE', { data: { error, typeId } });
    return fail('No se pudo guardar el tipo');
  }
}

export async function deleteHseDocumentType(typeId: string): Promise<ActionResult<null>> {
  const auth = await requireSettings('delete');
  if (!auth) return fail('No tenés permiso para hacer esto');
  if (!UUID_RE.test(typeId)) return fail('El tipo no existe');
  try {
    const result = await withActor(auth.credentialId, async (tx) => {
      const inUse = await tx.hse_documents.count({ where: { type_id: typeId, company_id: auth.companyId } });
      if (inUse > 0) return 'in-use' as const;
      const deleted = await tx.hse_document_types.deleteMany({ where: { id: typeId, company_id: auth.companyId } });
      return deleted.count === 1 ? ('ok' as const) : ('missing' as const);
    });
    if (result === 'in-use') return fail('El tipo tiene documentos: desactivalo en vez de borrarlo');
    if (result === 'missing') return fail('El tipo no existe');
    revalidatePath('/dashboard/hse');
    return ok(null);
  } catch (error) {
    // FK RESTRICT: aunque el conteo no los vea (permisos), un tipo con documentos no se borra.
    if ((error as { code?: string })?.code === 'P2003')
      return fail('El tipo tiene documentos: desactivalo en vez de borrarlo');
    logger.error('Error al borrar el tipo de documento HSE', { data: { error, typeId } });
    return fail('No se pudo borrar el tipo');
  }
}
