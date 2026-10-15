import {
  findActionsWithoutView,
  pairFromKey,
  permissionKey,
  type PermissionIndex,
} from '@/features/UserPermissionsManager/lib/permission-rules';
import { z } from 'zod';

/**
 * Validación de escrituras de permisos (roles y ajustes de usuario). Módulo puro, sin directiva:
 * lo usan las server actions de `actions/roles.server.ts` dentro de sus transacciones.
 */

export const permissionPairSchema = z.object({
  tab_id: z.string().uuid('Pestaña inválida'),
  action_id: z.string().uuid('Acción inválida'),
});

const rolePermissionDeltaSchema = z.object({
  add: z.array(permissionPairSchema).max(5000),
  remove: z.array(permissionPairSchema).max(5000),
});

export const roleUpdateSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1, 'El nombre del rol es obligatorio'),
  description: z.string().optional(),
  color: z.string().optional(),
  permissions: rolePermissionDeltaSchema,
});

export const userPermissionChangesSchema = z.object({
  set: z.array(permissionPairSchema.extend({ is_granted: z.boolean() })).max(5000),
  remove: z.array(permissionPairSchema).max(5000),
});

export type UserPermissionChanges = z.infer<typeof userPermissionChangesSchema>;

type Pair = { tab_id: string; action_id: string };

const keyOf = (pair: Pair) => permissionKey(pair.tab_id, pair.action_id);

function describeKey(index: PermissionIndex, key: string): string {
  const { tabId, actionId } = pairFromKey(key);
  const tab = index.tabs.get(tabId)?.tab;
  const action = tab?.actions.find((a) => a.id === actionId);
  return `${action?.name ?? 'acción'} en "${tab?.name ?? 'pestaña desconocida'}"`;
}

/** Cada par a conceder debe existir en el catálogo (pestaña del mapa + acción permitida en ella). */
export function assertPairsInCatalog(index: PermissionIndex, pairs: Pair[]): void {
  const unknown = pairs.find((pair) => !index.allKeys.has(keyOf(pair)));
  if (unknown) throw new Error('Se intentó guardar un permiso que no existe en el catálogo');
}

/** Un mismo par no puede estar a la vez en lo que se agrega y en lo que se quita. */
export function assertNoOverlap(toAdd: Pair[], toRemove: Pair[]): void {
  const removing = new Set(toRemove.map(keyOf));
  if (toAdd.some((pair) => removing.has(keyOf(pair)))) {
    throw new Error('La petición agrega y quita el mismo permiso');
  }
}

/**
 * Rechaza si el conjunto final deja una acción sin el "Ver" de su pestaña que antes no estaba
 * huérfana. Las inconsistencias ya guardadas no bloquean ediciones ajenas: solo se rechaza lo que
 * este guardado introduce.
 */
export function assertNoNewActionsWithoutView(
  index: PermissionIndex,
  before: ReadonlySet<string>,
  after: ReadonlySet<string>
): void {
  const previous = new Set(findActionsWithoutView(before, index));
  const introduced = findActionsWithoutView(after, index).filter((key) => !previous.has(key));
  if (introduced.length > 0) {
    const shown = introduced.slice(0, 3).map((key) => describeKey(index, key));
    const rest = introduced.length > shown.length ? ` y ${introduced.length - shown.length} más` : '';
    throw new Error(`Cada acción exige poder ver su pestaña. Falta "Ver" para: ${shown.join(', ')}${rest}`);
  }
}
