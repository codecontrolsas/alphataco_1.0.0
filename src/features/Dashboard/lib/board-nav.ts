import { BOARD_TEMPLATES, templateKeyFromLegacyParams, type BoardTemplateKey } from './widget-registry';

/**
 * Qué tablero muestra el Dashboard para una URL, y a qué acceso del sidebar corresponde.
 *
 * Módulo puro (sin directiva ni dependencias de servidor): lo usa `DashboardComponent` para elegir
 * el tablero y el sidebar/header para marcar el ítem activo y la miga de pan con LA MISMA regla.
 */

/** Lo mínimo de un tablero que necesita la navegación. */
export interface BoardNavEntry {
  id: string;
  name: string;
  template: BoardTemplateKey | null;
}

export interface BoardUrlParams {
  /** `?tablero=` */
  board: string | null | undefined;
  /** `?tab=` / `?subtab=` de los links viejos y de los accesos del sidebar. */
  tab: string | null | undefined;
  subtab: string | null | undefined;
}

/**
 * Índice del tablero activo: el de `?tablero=`; si no, el equivalente de `?tab=`/`?subtab=`;
 * si no (o si no existe), el primero.
 */
export function findActiveBoardIndex(
  boards: readonly Pick<BoardNavEntry, 'id' | 'template'>[],
  params: BoardUrlParams
): number {
  const requestedId = params.board || null;
  const legacyKey = templateKeyFromLegacyParams(params.tab ?? undefined, params.subtab ?? undefined);
  return Math.max(
    0,
    boards.findIndex((board) =>
      requestedId ? board.id === requestedId : legacyKey !== null && board.template === legacyKey
    )
  );
}

/**
 * Acceso del sidebar (`tabSlug` del ítem del Dashboard) que representa a cada tablero por defecto.
 * Los tableros personalizados (sin `template`) no marcan ningún acceso.
 */
export const DASHBOARD_NAV_TAB_BY_TEMPLATE: Record<BoardTemplateKey, string> = {
  resumen: 'principal',
  vencimientos: 'documentacion',
  operacion: 'estadisticas',
  flota: 'estadisticas',
  personal: 'estadisticas',
  desvios: 'estadisticas',
  indicadores: 'estadisticas',
};

/** Nombre por defecto de un tablero de plantilla (antes de conocer el nombre guardado). */
export function templateBoardName(key: BoardTemplateKey): string {
  return BOARD_TEMPLATES.find((template) => template.key === key)?.name ?? key;
}
