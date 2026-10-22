import 'server-only';

import {
  ALL_WIDGET_PERMISSION_KEYS,
  BOARD_TEMPLATES,
  WIDGETS,
  getWidgetDefinition,
  isWidgetGranted,
  type BoardTemplateKey,
  type WidgetId,
} from '@/features/Dashboard/lib/widget-registry';
import { checkMultiplePermissionsServer } from '@/features/Permissions/actions/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { parseStoredLayout, templateBoardId, type BoardLayout } from './board-layout';

const logger = new Logger('features/Dashboard/Boards');

/**
 * Widgets que el usuario de sesión puede ver: los que tienen concedidas TODAS sus claves
 * (`requires`) y, si declaran `requiresAny`, algún grupo completo (`isWidgetGranted`). Una sola consulta (`check_multiple_permissions`) por request para todo el catálogo.
 */
export const getVisibleWidgetIds = cache(async (): Promise<ReadonlySet<WidgetId>> => {
  const keys = ALL_WIDGET_PERMISSION_KEYS;
  const result = await checkMultiplePermissionsServer(
    keys.map((key) => {
      const [moduleSlug, tabSlug, actionSlug] = key.split(':');
      return { moduleSlug, tabSlug, actionSlug };
    })
  );
  const granted = new Set(keys.filter((key) => result.get(key) === true));
  return new Set(WIDGETS.filter((widget) => isWidgetGranted(widget, granted)).map((widget) => widget.id));
});

export interface DashboardBoard {
  /** uuid de la base, o `tpl-<clave>` si es un tablero por defecto sin guardar. */
  id: string;
  name: string;
  description: string | null;
  template: BoardTemplateKey | null;
  /** Layout guardado, ya saneado (sin widgets inexistentes ni repetidos). */
  layout: BoardLayout;
  persisted: boolean;
}

function templateLayout(widgets: readonly WidgetId[], visible: ReadonlySet<WidgetId>): BoardLayout {
  return widgets
    .filter((id) => visible.has(id))
    .flatMap((id) => {
      const widget = getWidgetDefinition(id);
      return widget ? [{ widgetId: widget.id, size: widget.defaultSize }] : [];
    });
}

/** Tableros por defecto con lo que el usuario puede ver (los que quedan vacíos no se ofrecen). */
export function buildDefaultBoards(visible: ReadonlySet<WidgetId>): DashboardBoard[] {
  return BOARD_TEMPLATES.flatMap((template) => {
    const layout = templateLayout(template.widgets, visible);
    if (layout.length === 0) return [];
    return [
      {
        id: templateBoardId(template.key),
        name: template.name,
        description: template.description,
        template: template.key,
        layout,
        persisted: false,
      },
    ];
  });
}

function asTemplateKey(value: string | null): BoardTemplateKey | null {
  return BOARD_TEMPLATES.find((template) => template.key === value)?.key ?? null;
}

/** `user_id` + `company_id` de la sesión, o null si falta alguno. */
export const getBoardOwner = cache(async (): Promise<{ userId: string; companyId: string } | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const companyId = await getActiveCompanyId();
  return { userId, companyId };
});

/**
 * Tableros del usuario en la empresa activa. Sin tableros guardados devuelve los tableros por
 * defecto (sin escribir nada): la primera personalización los guarda.
 */
export const getUserBoards = cache(async (): Promise<DashboardBoard[]> => {
  const [owner, visible] = await Promise.all([getBoardOwner(), getVisibleWidgetIds()]);
  if (!owner) return [];

  try {
    const rows = await prisma.user_dashboards.findMany({
      where: { user_id: owner.userId, company_id: owner.companyId },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
      select: { id: true, name: true, template: true, layout: true },
    });

    if (rows.length === 0) return buildDefaultBoards(visible);

    return rows.map((row) => {
      const template = asTemplateKey(row.template);
      return {
        id: row.id,
        name: row.name,
        description: BOARD_TEMPLATES.find((item) => item.key === template)?.description ?? null,
        template,
        layout: parseStoredLayout(row.layout),
        persisted: true,
      };
    });
  } catch (error) {
    logger.error('Error al obtener los tableros del usuario', { data: { error } });
    throw error;
  }
});
