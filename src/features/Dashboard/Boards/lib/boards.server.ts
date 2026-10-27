import 'server-only';

import {
  ACTIVE_BOARD_TEMPLATES,
  ACTIVE_WIDGET_SECTIONS,
  ALL_WIDGET_PERMISSION_KEYS,
  BOARD_TEMPLATES,
  WIDGETS,
  getWidgetDefinition,
  isActiveBoardTemplate,
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
  // #802: los widgets de las secciones ocultas no se ven aunque el usuario tenga el permiso.
  return new Set(
    WIDGETS.filter((widget) => ACTIVE_WIDGET_SECTIONS.includes(widget.section) && isWidgetGranted(widget, granted)).map(
      (widget) => widget.id
    )
  );
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
  /** El usuario de la sesión es el dueño del preset (solo el dueño lo modifica). Los por defecto son propios. */
  isOwner: boolean;
  /** Nombre del dueño, para los presets compartidos por otro usuario. */
  ownerName: string | null;
  visibility: BoardVisibility;
  /** Usuarios con los que se comparte (solo se informa al dueño y con alcance `users`). */
  sharedUserIds: string[];
}

export const BOARD_VISIBILITIES = ['private', 'company', 'users'] as const;
export type BoardVisibility = (typeof BOARD_VISIBILITIES)[number];

function asVisibility(value: string): BoardVisibility {
  return BOARD_VISIBILITIES.find((item) => item === value) ?? 'private';
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
  // #802: solo los predefinidos activos (Resumen y Vencimientos).
  return ACTIVE_BOARD_TEMPLATES.flatMap((template) => {
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
        isOwner: true,
        ownerName: null,
        visibility: 'private' as const,
        sharedUserIds: [],
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
 * Presets del Dashboard que ve el usuario en la empresa activa: los propios (en su orden) y, después, los que otros
 * compartieron con toda la organización o con él. Sin presets propios se ofrecen los predefinidos activos (sin escribir
 * nada: la primera personalización los guarda). Los tableros guardados de un predefinido que hoy está oculto (#802) no
 * se listan (los datos no se borran).
 */
export const getUserBoards = cache(async (): Promise<DashboardBoard[]> => {
  const [owner, visible] = await Promise.all([getBoardOwner(), getVisibleWidgetIds()]);
  if (!owner) return [];

  try {
    const rows = await prisma.user_dashboards.findMany({
      where: {
        company_id: owner.companyId,
        OR: [
          { user_id: owner.userId },
          { visibility: 'company' },
          { visibility: 'users', shares: { some: { user_id: owner.userId } } },
        ],
      },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true,
        user_id: true,
        name: true,
        template: true,
        layout: true,
        visibility: true,
        shares: { select: { user_id: true } },
      },
    });

    const shown = rows.filter((row) => row.template === null || isActiveBoardTemplate(row.template));
    const own = shown.filter((row) => row.user_id === owner.userId);
    const shared = shown.filter((row) => row.user_id !== owner.userId);

    // Nombre de los dueños de los compartidos (una consulta; el perfil comparte id con el usuario).
    const ownerIds = [...new Set(shared.map((row) => row.user_id))];
    const profiles = ownerIds.length
      ? await prisma.profile.findMany({
          where: { credential_id: { in: ownerIds } },
          select: { credential_id: true, fullname: true },
        })
      : [];
    const ownerNames = new Map(profiles.map((profile) => [profile.credential_id, profile.fullname]));

    const toBoard = (row: (typeof rows)[number]): DashboardBoard => {
      const template = asTemplateKey(row.template);
      const isOwner = row.user_id === owner.userId;
      const visibility = asVisibility(row.visibility);
      return {
        id: row.id,
        name: row.name,
        description: BOARD_TEMPLATES.find((item) => item.key === template)?.description ?? null,
        template,
        layout: parseStoredLayout(row.layout),
        persisted: true,
        isOwner,
        ownerName: isOwner ? null : ownerNames.get(row.user_id) ?? 'Otro usuario',
        visibility,
        sharedUserIds: isOwner && visibility === 'users' ? row.shares.map((share) => share.user_id) : [],
      };
    };

    const sharedBoards = shared.map(toBoard).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (own.length === 0) return [...buildDefaultBoards(visible), ...sharedBoards];
    return [...own.map(toBoard), ...sharedBoards];
  } catch (error) {
    logger.error('Error al obtener los tableros del usuario', { data: { error } });
    throw error;
  }
});
