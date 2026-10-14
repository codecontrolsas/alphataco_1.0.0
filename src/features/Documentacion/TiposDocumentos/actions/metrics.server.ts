import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import type { Prisma } from '@/generated/prisma/client';
import type { document_applies } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { documentTypeCompanyScope } from '../lib/document-type-scope';

const logger = new Logger('features/TiposDocumentos/metrics');

/** Mismo mapeo que `buildWhereClause` en `queries.server.ts`: tab que otorga `view_private` por alcance. */
const PRIVATE_PERMISSION_TAB: Record<string, string> = {
  Persona: 'tipos-docs-personas',
  Equipos: 'tipos-docs-equipos',
  Empresa: 'tipos-docs-empresa',
};

/**
 * Tarjetas de un listado de tipos de documento. Mismo universo y alcance que la tabla
 * (`buildWhereClause`): tipos globales y propios de la empresa activa, del alcance `applies`
 * (Personas/Equipos/Empresa) y respetando el permiso de tipos privados; sin filtros del usuario.
 * Todas cuentan solo tipos activos (los que están en uso hoy).
 */
export async function getDocTypeMetrics(applies: document_applies) {
  const companyId = await getActiveCompanyId();

  try {
    const tabSlug = PRIVATE_PERMISSION_TAB[applies];
    const canViewPrivate = tabSlug ? await checkPermissionServer('documentacion', tabSlug, 'view_private') : true;

    const universe: Prisma.document_typesWhereInput = {
      applies,
      AND: [documentTypeCompanyScope(companyId)],
      ...(!canViewPrivate && { private: { not: true } }),
    };
    const active: Prisma.document_typesWhereInput = { ...universe, is_active: true };

    const [activeCount, mandatory, conditional, monthly] = await Promise.all([
      prisma.document_types.count({ where: active }),
      prisma.document_types.count({ where: { ...active, mandatory: true } }),
      prisma.document_types.count({ where: { ...active, special: true } }),
      prisma.document_types.count({ where: { ...active, is_it_montlhy: true } }),
    ]);

    return { active: activeCount, mandatory, conditional, monthly };
  } catch (error) {
    logger.error('Error al obtener las métricas de tipos de documento', { data: { error, applies } });
    throw error;
  }
}
