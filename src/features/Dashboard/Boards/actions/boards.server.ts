'use server';

import type { BoardNavEntry } from '@/features/Dashboard/lib/board-nav';
import {
  BOARD_TEMPLATES,
  clampWidgetSize,
  getWidgetDefinition,
  type WidgetId,
} from '@/features/Dashboard/lib/widget-registry';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import moment from 'moment';
import { z } from 'zod';
import {
  MAX_BOARDS,
  boardIdSchema,
  boardLayoutSchema,
  boardNameSchema,
  templateKeyFromBoardId,
  type BoardActionResult,
  type BoardLayout,
} from '../lib/board-layout';
import { buildDefaultBoards, getBoardOwner, getUserBoards, getVisibleWidgetIds } from '../lib/boards.server';

const logger = new Logger('features/Dashboard/Boards/actions');

/**
 * Tableros personales del Dashboard. Todo se acota al usuario y la empresa de la SESIÓN (nunca
 * se aceptan del cliente). Mientras el usuario no guardó nada, ve los tableros por defecto; la
 * primera acción que escribe los guarda a todos (`materializeDefaults`) y después se aplica.
 */

type Owner = { userId: string; companyId: string };
type Tx = Prisma.TransactionClient;

const DUPLICATE_NAME_ERROR = 'Ya tenés un tablero con ese nombre';
const NOT_FOUND_ERROR = 'El tablero ya no existe. Recargá la página.';
const NO_SESSION_ERROR = 'La sesión expiró. Volvé a ingresar.';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function requireOwner(): Promise<Owner | null> {
  try {
    return await getBoardOwner();
  } catch (error) {
    logger.warn('Sin empresa activa para los tableros', { data: { error } });
    return null;
  }
}

/** Si el usuario no tiene tableros guardados, guarda los tableros por defecto (lo que hoy ve). */
async function materializeDefaults(tx: Tx, owner: Owner, visible: ReadonlySet<WidgetId>): Promise<void> {
  const count = await tx.user_dashboards.count({ where: { user_id: owner.userId, company_id: owner.companyId } });
  if (count > 0) return;
  const defaults = buildDefaultBoards(visible);
  if (defaults.length === 0) return;
  await tx.user_dashboards.createMany({
    data: defaults.map((board, index) => ({
      user_id: owner.userId,
      company_id: owner.companyId,
      name: board.name,
      position: index,
      template: board.template,
      layout: board.layout,
    })),
  });
}

/** Resuelve el id recibido (uuid o `tpl-<clave>`) a una fila del usuario. */
async function findOwnedBoard(tx: Tx, owner: Owner, boardId: string) {
  const templateKey = templateKeyFromBoardId(boardId);
  return tx.user_dashboards.findFirst({
    where: {
      user_id: owner.userId,
      company_id: owner.companyId,
      ...(templateKey ? { template: templateKey } : { id: boardId }),
    },
    orderBy: { position: 'asc' },
    select: { id: true, position: true },
  });
}

/**
 * Valida el layout contra el registro y los permisos del usuario: todo widget debe existir y ser
 * visible; los tamaños se llevan al rango del widget.
 */
function validateLayout(layout: BoardLayout, visible: ReadonlySet<WidgetId>): BoardActionResult<BoardLayout> {
  const clean: BoardLayout = [];
  for (const item of layout) {
    const widget = getWidgetDefinition(item.widgetId);
    if (!widget) return { ok: false, error: 'El tablero tiene un widget que ya no existe. Recargá la página.' };
    if (!visible.has(widget.id as WidgetId)) {
      return { ok: false, error: `No tenés permiso para ver «${widget.title}».` };
    }
    clean.push({ widgetId: widget.id, size: clampWidgetSize(widget, item.size) });
  }
  return { ok: true, data: clean };
}

// ============================================================================
// ACCIONES
// ============================================================================

/**
 * Tableros del usuario para la navegación (sidebar y miga de pan): id, nombre y plantilla, en el
 * orden del selector. Sin sesión o sin empresa activa devuelve una lista vacía (no hay tablero
 * que marcar).
 */
export async function getUserDashboardNavBoards(): Promise<BoardNavEntry[]> {
  try {
    const boards = await getUserBoards();
    return boards.map((board) => ({ id: board.id, name: board.name, template: board.template }));
  } catch (error) {
    logger.warn('No se pudieron leer los tableros para la navegación', { data: { error } });
    return [];
  }
}

const createInputSchema = z.object({ name: boardNameSchema });

/** Crea un tablero vacío al final de la lista. */
export async function createUserBoard(
  input: z.input<typeof createInputSchema>
): Promise<BoardActionResult<{ id: string }>> {
  const parsed = createInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  const owner = await requireOwner();
  if (!owner) return { ok: false, error: NO_SESSION_ERROR };
  const visible = await getVisibleWidgetIds();

  try {
    const result = await prisma.$transaction(async (tx) => {
      await materializeDefaults(tx, owner, visible);
      const where = { user_id: owner.userId, company_id: owner.companyId };
      const [count, last] = await Promise.all([
        tx.user_dashboards.count({ where }),
        tx.user_dashboards.findFirst({ where, orderBy: { position: 'desc' }, select: { position: true } }),
      ]);
      if (count >= MAX_BOARDS) return null;
      return tx.user_dashboards.create({
        data: { ...where, name: parsed.data.name, position: (last?.position ?? -1) + 1, layout: [] },
        select: { id: true },
      });
    });
    if (!result) return { ok: false, error: `Se admiten hasta ${MAX_BOARDS} tableros` };
    logger.info('Tablero creado', { data: { id: result.id } });
    return { ok: true, data: { id: result.id } };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: DUPLICATE_NAME_ERROR };
    logger.error('Error al crear el tablero', { data: { error } });
    throw error;
  }
}

const renameInputSchema = z.object({ boardId: boardIdSchema, name: boardNameSchema });

export async function renameUserBoard(
  input: z.input<typeof renameInputSchema>
): Promise<BoardActionResult<{ id: string }>> {
  const parsed = renameInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  const owner = await requireOwner();
  if (!owner) return { ok: false, error: NO_SESSION_ERROR };
  const visible = await getVisibleWidgetIds();

  try {
    const id = await prisma.$transaction(async (tx) => {
      await materializeDefaults(tx, owner, visible);
      const board = await findOwnedBoard(tx, owner, parsed.data.boardId);
      if (!board) return null;
      await tx.user_dashboards.update({
        where: { id: board.id },
        data: { name: parsed.data.name, updated_at: moment().toDate() },
      });
      return board.id;
    });
    if (!id) return { ok: false, error: NOT_FOUND_ERROR };
    return { ok: true, data: { id } };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: DUPLICATE_NAME_ERROR };
    logger.error('Error al renombrar el tablero', { data: { error } });
    throw error;
  }
}

const deleteInputSchema = z.object({ boardId: boardIdSchema });

/** Borra el tablero. Si era el último, el usuario vuelve a ver los tableros por defecto. */
export async function deleteUserBoard(input: z.input<typeof deleteInputSchema>): Promise<BoardActionResult> {
  const parsed = deleteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Tablero inexistente' };

  const owner = await requireOwner();
  if (!owner) return { ok: false, error: NO_SESSION_ERROR };
  const visible = await getVisibleWidgetIds();

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      await materializeDefaults(tx, owner, visible);
      const board = await findOwnedBoard(tx, owner, parsed.data.boardId);
      if (!board) return false;
      await tx.user_dashboards.delete({ where: { id: board.id } });
      return true;
    });
    if (!deleted) return { ok: false, error: NOT_FOUND_ERROR };
    logger.info('Tablero eliminado', { data: { boardId: parsed.data.boardId } });
    return { ok: true, data: null };
  } catch (error) {
    logger.error('Error al eliminar el tablero', { data: { error } });
    throw error;
  }
}

const moveInputSchema = z.object({ boardId: boardIdSchema, direction: z.enum(['up', 'down']) });

/** Mueve el tablero un lugar antes o después en la lista (reordenar tableros). */
export async function moveUserBoard(
  input: z.input<typeof moveInputSchema>
): Promise<BoardActionResult<{ id: string }>> {
  const parsed = moveInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Datos inválidos' };

  const owner = await requireOwner();
  if (!owner) return { ok: false, error: NO_SESSION_ERROR };
  const visible = await getVisibleWidgetIds();

  try {
    const id = await prisma.$transaction(async (tx) => {
      await materializeDefaults(tx, owner, visible);
      const board = await findOwnedBoard(tx, owner, parsed.data.boardId);
      if (!board) return null;
      const rows = await tx.user_dashboards.findMany({
        where: { user_id: owner.userId, company_id: owner.companyId },
        orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
        select: { id: true },
      });
      const from = rows.findIndex((row) => row.id === board.id);
      const to = parsed.data.direction === 'up' ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= rows.length) return board.id;
      const ordered = [...rows];
      const [moved] = ordered.splice(from, 1);
      ordered.splice(to, 0, moved);
      // Se renumera la lista entera: corrige de paso posiciones repetidas.
      await Promise.all(
        ordered.map((row, position) => tx.user_dashboards.update({ where: { id: row.id }, data: { position } }))
      );
      return board.id;
    });
    if (!id) return { ok: false, error: NOT_FOUND_ERROR };
    return { ok: true, data: { id } };
  } catch (error) {
    logger.error('Error al reordenar los tableros', { data: { error } });
    throw error;
  }
}

const saveLayoutInputSchema = z.object({ boardId: boardIdSchema, layout: boardLayoutSchema });

/** Guarda orden, tamaños y widgets del tablero. Devuelve el id real (cambia si era uno por defecto). */
export async function saveUserBoardLayout(
  input: z.input<typeof saveLayoutInputSchema>
): Promise<BoardActionResult<{ id: string; widgets: number }>> {
  const parsed = saveLayoutInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  const owner = await requireOwner();
  if (!owner) return { ok: false, error: NO_SESSION_ERROR };
  const visible = await getVisibleWidgetIds();

  const validated = validateLayout(parsed.data.layout, visible);
  if (!validated.ok) return validated;

  try {
    const id = await prisma.$transaction(async (tx) => {
      await materializeDefaults(tx, owner, visible);
      const board = await findOwnedBoard(tx, owner, parsed.data.boardId);
      if (!board) return null;
      await tx.user_dashboards.update({
        where: { id: board.id },
        data: { layout: validated.data, updated_at: moment().toDate() },
      });
      return board.id;
    });
    if (!id) return { ok: false, error: NOT_FOUND_ERROR };
    logger.info('Layout del tablero guardado', { data: { id, widgets: validated.data.length } });
    return { ok: true, data: { id, widgets: validated.data.length } };
  } catch (error) {
    logger.error('Error al guardar el tablero', { data: { error } });
    throw error;
  }
}

/** Borra los tableros propios: el usuario vuelve a ver los tableros por defecto. */
export async function resetUserBoards(): Promise<BoardActionResult<{ removed: number }>> {
  const owner = await requireOwner();
  if (!owner) return { ok: false, error: NO_SESSION_ERROR };
  try {
    const { count } = await prisma.user_dashboards.deleteMany({
      where: { user_id: owner.userId, company_id: owner.companyId },
    });
    logger.info('Tableros restablecidos', { data: { removed: count, templates: BOARD_TEMPLATES.length } });
    return { ok: true, data: { removed: count } };
  } catch (error) {
    logger.error('Error al restablecer los tableros', { data: { error } });
    throw error;
  }
}
