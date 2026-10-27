'use server';

import { logger } from '@/lib/logger';
import type { TablePreferences } from '@/shared/components/common/DataTable/helpers';
import type { SortItem } from '@/shared/components/common/DataTable/types';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import moment from 'moment';

type TablePref = TablePreferences;

/**
 * Mergea un patch sobre las preferencias guardadas de la tabla, conservando el resto.
 * Centraliza el read-modify-write para que cada preferencia no pise a las demás.
 */
async function mergeTablePreferences(tableId: string, patch: TablePref): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;

  const key = `${userId}:${tableId}`;
  const existing = await prisma.user_table_preferences.findUnique({
    where: { user_id: key },
    select: { preferences: true },
  });

  const currentPrefs = (existing?.preferences as TablePref) ?? {};
  const updatedPrefs: TablePref = { ...currentPrefs, ...patch };

  await prisma.user_table_preferences.upsert({
    where: { user_id: key },
    create: { user_id: key, preferences: updatedPrefs },
    // `updated_at` a mano: la columna solo tiene DEFAULT (sin trigger), así que el upsert dejaba la fecha del alta.
    update: { preferences: updatedPrefs, updated_at: moment().toDate() },
  });
}

export async function getTablePreferences(tableId: string): Promise<TablePref> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return {};

    const pref = await prisma.user_table_preferences.findUnique({
      where: { user_id: tableId ? `${userId}:${tableId}` : userId },
      select: { preferences: true },
    });

    if (!pref?.preferences) return {};
    return pref.preferences as TablePref;
  } catch (error) {
    logger.error('Error getting table preferences', { data: { error, tableId } });
    return {};
  }
}

export async function saveTableColumnVisibility(
  tableId: string,
  columnVisibility: Record<string, boolean>
): Promise<void> {
  try {
    await mergeTablePreferences(tableId, { columnVisibility });
  } catch (error) {
    logger.error('Error saving column visibility', { data: { error, tableId } });
  }
}

export async function saveTableFilterVisibility(
  tableId: string,
  filterVisibility: Record<string, boolean>
): Promise<void> {
  try {
    await mergeTablePreferences(tableId, { filterVisibility });
  } catch (error) {
    logger.error('Error saving filter visibility', { data: { error, tableId } });
  }
}

/**
 * Persiste la vista de la tabla (filas por página y ordenamiento) para el usuario actual.
 * Se guarda para que al volver a entrar la tabla se vea igual que la última vez,
 * sin depender de que la URL conserve los params.
 */
export async function saveTableViewPreferences(
  tableId: string,
  view: { pageSize: number; sorting: SortItem[] }
): Promise<void> {
  try {
    await mergeTablePreferences(tableId, { pageSize: view.pageSize, sorting: view.sorting });
  } catch (error) {
    logger.error('Error saving table view preferences', { data: { error, tableId } });
  }
}

/**
 * Persiste el orden de las columnas (ids de izquierda a derecha) para el usuario actual.
 */
export async function saveTableColumnOrder(tableId: string, columnOrder: string[]): Promise<void> {
  try {
    await mergeTablePreferences(tableId, { columnOrder });
  } catch (error) {
    logger.error('Error saving column order', { data: { error, tableId } });
  }
}
