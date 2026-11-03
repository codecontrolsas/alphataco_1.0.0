import 'server-only';

import { getEnabledModulesFor } from '@/features/Modules/server/modules.server';
import type { TenantContext } from '@/shared/lib/tenant-context';
import { z } from 'zod';
import { documentResourceParamSchema, type DocumentResource } from '../contracts/documents';
import { loadDocumentAccess } from '../lib/access.server';
import { mobileError } from '../lib/http';
import { RESOURCE_MODULE, type DocumentAccess } from './access';
import { DocumentNotFoundError, DocumentQueryError } from './queries.server';

export const NOT_FOUND_DOCUMENT = 'El documento no existe, no pertenece a la empresa activa o ya no está vigente.';

/** `true` si el módulo propio de la clase de recurso (`empleados` / `equipos`) está encendido para la empresa. */
export async function isResourceModuleEnabled(companyId: string, resource: DocumentResource): Promise<boolean> {
  const required = RESOURCE_MODULE[resource];
  return !required || (await getEnabledModulesFor(companyId)).has(required);
}

/**
 * Ruta de un documento por id (`/documents/{resource}/{documentId}[/...]`): mismo orden de chequeos en todas — clase e
 * id válidos (422), módulo de la clase encendido (404 `MODULE_DISABLED`), permisos (403) y existencia (404).
 */
export async function withDocumentParams(
  ctx: TenantContext,
  params: { resource: string; documentId: string },
  run: (resource: DocumentResource, documentId: string, access: DocumentAccess) => Promise<Response>
): Promise<Response> {
  const resource = documentResourceParamSchema.safeParse(params.resource);
  if (!resource.success || !z.string().uuid().safeParse(params.documentId).success) {
    return mobileError(422, 'INVALID_INPUT', 'Clase de recurso o id de documento inválido.');
  }
  if (!(await isResourceModuleEnabled(ctx.companyId, resource.data))) {
    return mobileError(404, 'MODULE_DISABLED', 'Esta función no está habilitada.');
  }
  const access = await loadDocumentAccess(ctx);
  try {
    return await run(resource.data, params.documentId, access);
  } catch (error) {
    if (error instanceof DocumentQueryError) {
      return error.status === 403
        ? mobileError(403, 'FORBIDDEN', error.message)
        : mobileError(422, 'INVALID_INPUT', error.message);
    }
    if (error instanceof DocumentNotFoundError) return mobileError(404, 'NOT_FOUND', NOT_FOUND_DOCUMENT);
    throw error;
  }
}
