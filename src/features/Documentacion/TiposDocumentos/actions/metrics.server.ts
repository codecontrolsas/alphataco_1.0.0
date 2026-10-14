import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import type { document_applies } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { hasDocTypePermission } from '../lib/document-type-permissions';
import { documentTypeCompanyScope } from '../lib/document-type-scope';

const logger = new Logger('features/TiposDocumentos/metrics');

/**
 * Tarjetas de un listado de tipos de documento. Mismo universo y alcance que la tabla
 * (`buildWhereClause`): tipos globales y propios de la empresa activa, del alcance `applies`
 * (Personas/Equipos/Empresa) y respetando el permiso de tipos privados; sin filtros del usuario.
 * Todas cuentan solo tipos activos (los que están en uso hoy).
 */
export async function getDocTypeMetrics(applies: document_applies) {
  const companyId = await getActiveCompanyId();

  try {
    if (!(await hasDocTypePermission(applies, 'view'))) return { active: 0, mandatory: 0, conditional: 0, monthly: 0 };
    const canViewPrivate = await hasDocTypePermission(applies, 'view_private');

    const universe: Prisma.document_typesWhereInput = {
      applies,
      AND: [documentTypeCompanyScope(companyId)],
      ...(!canViewPrivate && { OR: [{ private: false }, { private: null }] }),
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
