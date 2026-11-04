import 'server-only';

import { loadExpiringOverview } from '@/features/Dashboard/Documentacion/lib/expiring-overview.server';
import {
  SECTION_COUNTER_LABELS,
  navigationLinks,
  subLinkHref,
  subLinkKey,
} from '@/features/Layout/sidebar/constants/navigation';
import {
  SECTION_COUNT_LOADERS,
  hasPermissionCached,
  loadSectionCountResult,
} from '@/features/Layout/sidebar/lib/section-count-loaders';
import type { certification_status } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';

import {
  ERROR,
  FORBIDDEN,
  TONE_ORDER,
  overdueDocumentSources,
  toneFor,
  type AttentionItem,
  type AttentionTone,
  type Source,
} from './attention-items';

export type { AttentionItem, AttentionTone };

const logger = new Logger('features/Dashboard/Resumen/attention');

export interface AttentionInbox {
  /** Pendientes con al menos un caso, ya ordenados. */
  items: AttentionItem[];
  /** Fuentes que el usuario puede ver y se pudieron calcular (con o sin pendientes): el denominador del vacío. */
  checked: number;
  /** Fuentes que el usuario puede ver pero fallaron: se avisa, nunca se cuentan como «nada pendiente». */
  failed: number;
}

/** Href y nombre del módulo salen del mismo menú lateral: la bandeja lleva exactamente a la sección del badge. */
function sectionLink(moduleSlug: string, tabSlug: string): { module: string; href: string } | null {
  const link = navigationLinks.find((item) => item.moduleSlug === moduleSlug);
  const sub = link?.items?.find((item) => subLinkKey(item) === tabSlug);
  if (!link || !sub) return null;
  return { module: link.name, href: subLinkHref(link.href, sub) };
}

/** Contadores de las secciones del menú (los mismos números que los badges del sidebar). */
async function loadSectionItems(): Promise<Source[]> {
  const pairs = Object.entries(SECTION_COUNT_LOADERS).flatMap(([moduleSlug, loaders]) =>
    Object.keys(loaders).map((tabSlug) => ({ moduleSlug, tabSlug }))
  );
  return Promise.all(
    pairs.map(async ({ moduleSlug, tabSlug }) => {
      const key = `${moduleSlug}:${tabSlug}`;
      const link = sectionLink(moduleSlug, tabSlug);
      const label = SECTION_COUNTER_LABELS[key];
      if (!link || !label) return FORBIDDEN;
      const result = await loadSectionCountResult(moduleSlug, tabSlug);
      if (result.status !== 'ok') return result;
      return {
        status: 'ok' as const,
        item: { key, module: link.module, label, count: result.count, href: link.href, tone: toneFor(key) },
      };
    })
  );
}

/** Documentos ya vencidos de personal y de equipos (misma carga que los widgets de Vencimientos). */
async function loadOverdueDocumentItems(): Promise<Source[]> {
  return overdueDocumentSources(await loadExpiringOverview());
}

/** Certificaciones que todavía no se emitieron y confirmadas que falta facturar. */
async function loadCertificationItems(): Promise<Source[]> {
  if (!(await hasPermissionCached('comercial', 'certificaciones', 'view'))) return [FORBIDDEN, FORBIDDEN];
  try {
    const companyId = await getActiveCompanyId();
    const rows = await prisma.certifications.groupBy({
      by: ['status'],
      where: { company_id: companyId, status: { in: ['borrador', 'confirmada'] } },
      _count: { _all: true },
    });
    const countOf = (status: certification_status) => rows.find((row) => row.status === status)?._count._all ?? 0;
    const href = '/dashboard/comercial?tab=comerce&subtab=certificaciones';
    const item = (value: AttentionItem): Source => ({ status: 'ok', item: value });
    return [
      item({
        key: 'comercial:certificaciones-borrador',
        module: 'Comercial',
        label: 'certificaciones en borrador',
        count: countOf('borrador'),
        href,
        tone: toneFor('comercial:certificaciones-borrador'),
      }),
      item({
        key: 'comercial:certificaciones-por-facturar',
        module: 'Comercial',
        label: 'certificaciones confirmadas sin facturar',
        count: countOf('confirmada'),
        href,
        tone: toneFor('comercial:certificaciones-por-facturar'),
      }),
    ];
  } catch (error) {
    logger.error('Error al contar certificaciones pendientes', { data: { error } });
    return [ERROR, ERROR];
  }
}

/**
 * Bandeja «Para atender»: todo lo que espera a alguien en los módulos que el usuario puede ver. Cada
 * fuente exige su propio permiso; las que no ve o no se pudieron calcular no cuentan ni en el denominador.
 */
export const loadAttentionInbox = cache(async (): Promise<AttentionInbox> => {
  const groups = await Promise.all([loadOverdueDocumentItems(), loadCertificationItems(), loadSectionItems()]);
  const sources = groups.flat();
  const available = sources.flatMap((source) => (source.status === 'ok' ? [source.item] : []));
  const items = available
    .filter((item) => item.count > 0)
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.count - a.count);
  return {
    items,
    checked: available.length,
    failed: sources.filter((source) => source.status === 'error').length,
  };
});
