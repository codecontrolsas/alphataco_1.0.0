'use client';

import {
  DASHBOARD_NAV_TAB_BY_TEMPLATE,
  findActiveBoardIndex,
  templateBoardName,
} from '@/features/Dashboard/lib/board-nav';
import { isActiveBoardTemplate, templateKeyFromLegacyParams } from '@/features/Dashboard/lib/widget-registry';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { getUserDashboardNavBoards } from '../actions/boards.server';
import { BOARD_PARAM, templateKeyFromBoardId } from '../lib/board-layout';

/** Clave de la lista de tableros que usan el sidebar y la miga de pan. Se invalida al cambiar tableros. */
export const DASHBOARD_NAV_BOARDS_QUERY_KEY = ['dashboard-nav-boards'] as const;

export interface ActiveDashboardBoard {
  /** Nombre del tablero (null mientras no se sabe cuál es). */
  name: string | null;
  /** `tabSlug` del acceso del sidebar que lo representa (null: tablero personalizado o todavía desconocido). */
  navTab: string | null;
}

/**
 * Tablero que muestra el Dashboard para la URL actual, con la misma regla que `DashboardComponent`
 * (`findActiveBoardIndex`). Devuelve `undefined` fuera del Dashboard.
 *
 * Mientras llega la lista, deduce lo que la URL permite (`tpl-<clave>` o un `?tab=` viejo); un
 * `?tablero=<uuid>` queda sin marcar hasta tener la lista, para no mostrar una sección equivocada.
 */
export function useActiveDashboardBoard(enabled: boolean): ActiveDashboardBoard | undefined {
  const searchParams = useSearchParams();
  const params = {
    board: searchParams.get(BOARD_PARAM),
    tab: searchParams.get('tab'),
    subtab: searchParams.get('subtab'),
  };

  const { data } = useQuery({
    queryKey: DASHBOARD_NAV_BOARDS_QUERY_KEY,
    queryFn: () => getUserDashboardNavBoards(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  if (!enabled) return undefined;

  if (data && data.length > 0) {
    const board = data[findActiveBoardIndex(data, params)];
    return { name: board.name, navTab: board.template ? DASHBOARD_NAV_TAB_BY_TEMPLATE[board.template] : null };
  }

  const key = params.board
    ? templateKeyFromBoardId(params.board)
    : templateKeyFromLegacyParams(params.tab ?? undefined, params.subtab ?? undefined);
  // #802: un link a un tablero predefinido oculto cae en el primero de la lista (no se anuncia su nombre).
  if (key && isActiveBoardTemplate(key))
    return { name: templateBoardName(key), navTab: DASHBOARD_NAV_TAB_BY_TEMPLATE[key] };
  // Sin parámetros (o lista vacía): el primer acceso, como hasta ahora.
  if (!params.board) return undefined;
  return { name: null, navTab: null };
}
