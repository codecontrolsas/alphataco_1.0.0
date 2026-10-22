import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';

/**
 * Selects, tipos y mapeos compartidos del módulo Operaciones.
 *
 * Vive en un módulo SIN directiva: un archivo `'use server'` solo puede exportar funciones
 * async, así que estas constantes y los mappers sincrónicos no pueden salir de las actions.
 */

/**
 * Tipo de un registro de activity_log tal como lo retorna Prisma con el select ACTIVITY_LOG_SELECT.
 * Permite tipar correctamente los resultados antes del mapeo a "performer".
 */
export type RawActivityLogEntry = {
  id: string;
  maintenance_request_id: string | null;
  maintenance_order_id: string | null;
  work_order_id: string | null;
  action_type: string;
  performed_by: string | null;
  performed_at: Date;
  previous_status: string | null;
  new_status: string | null;
  notes: string | null;
  rejection_reason: string | null;
  metadata: unknown;
  created_at: Date;
  profile: { id: string; fullname: string | null; email: string | null } | null;
};

/**
 * Tipo del activity_log con "performer" como alias de "profile".
 * Usado en el código del cliente para compatibilidad.
 */
export type MappedActivityLogEntry = Omit<RawActivityLogEntry, 'profile'> & {
  performer: { id: string; fullname: string | null; email: string | null } | null;
};

// ─── Helpers de select reutilizables ──────────────────────────────────────────

/**
 * Select de maintenance_activity_log.
 * En Supabase se usaba alias "performer" con la FK; en Prisma la relacion se llama "profile".
 * Mapeamos el resultado para exponer "performer" en lugar de "profile".
 */
export const ACTIVITY_LOG_SELECT = {
  id: true,
  maintenance_request_id: true,
  maintenance_order_id: true,
  work_order_id: true,
  action_type: true,
  performed_by: true,
  performed_at: true,
  previous_status: true,
  new_status: true,
  notes: true,
  rejection_reason: true,
  metadata: true,
  created_at: true,
  profile: {
    select: { id: true, fullname: true, email: true },
  },
} as const;

/**
 * Mapea un registro de activity_log para exponer "performer" en lugar de "profile".
 * Mantiene compatibilidad con el código que accede a entry.performer.
 */
export function mapActivityLogEntry(entry: RawActivityLogEntry): MappedActivityLogEntry {
  const { profile, ...rest } = entry;
  return { ...rest, performer: profile };
}

// ─── Comentarios cargados sobre los items del pedido (ticket 649) ─────────────

/**
 * Select de los items de una solicitud con sus tres comentarios.
 *
 * No viajan por `maintenance_activity_log` (se escriben directo en la fila del
 * item, sin generar un evento), así que el historial no los veía: hay que
 * leerlos de la tabla.
 */
export const REQUEST_ITEM_COMMENTS_SELECT = {
  id: true,
  description: true,
  free_text: true,
  driver_comment: true,
  supervisor_comment: true,
  validator_comment: true,
  checklist_deviations: {
    select: { item_label: true },
  },
  profile_maintenance_request_items_driver_comment_byToprofile: {
    select: { id: true, fullname: true, email: true },
  },
  profile_maintenance_request_items_supervisor_comment_byToprofile: {
    select: { id: true, fullname: true, email: true },
  },
  profile_maintenance_request_items_validator_comment_byToprofile: {
    select: { id: true, fullname: true, email: true },
  },
} as const;

export type RawRequestItemComment = Prisma.maintenance_request_itemsGetPayload<{
  select: typeof REQUEST_ITEM_COMMENTS_SELECT;
}>;

/** Un comentario suelto, ya resuelto a quién lo escribió y con qué rol */
export type RequestItemComment = {
  itemId: string;
  /** Cómo se llama el item en pantalla (desvío del checklist, o el texto cargado a mano) */
  itemLabel: string;
  author: 'driver' | 'supervisor' | 'validator';
  comment: string;
  authorName: string | null;
};

export const COMMENT_AUTHOR_ORDER: RequestItemComment['author'][] = ['driver', 'supervisor', 'validator'];

/**
 * Nombre visible del item: el desvío del checklist, o lo que se escribió a mano.
 *
 * `section_code` queda afuera a propósito: se guarda en snake_case crudo
 * (`semi_remolque_vacio`) y no hay mapa a texto legible, así que anteponerlo
 * ensucia la línea sin agregar nada — `item_label` ya viene redactado.
 */
export function getRequestItemLabel(item: RawRequestItemComment): string {
  return (
    item.checklist_deviations?.item_label?.trim() ||
    item.description?.trim() ||
    item.free_text?.trim() ||
    'Item del pedido'
  );
}

/**
 * Aplana los items a una lista de comentarios: un item con comentario del chofer
 * y del supervisor produce dos entradas. Los items sin ningún comentario no
 * aparecen — el ticket pide mostrar los que tienen algo escrito.
 *
 * Deduplica por item con el mismo criterio que `getItemComments` (driverInfo.ts):
 * en estos datos los tres campos suelen repetir el mismo texto, y sin este filtro
 * el historial mostraba la misma frase hasta tres veces. Gana el primer autor del
 * orden chofer → supervisor → validación, que es el orden en que se escriben.
 */
export function mapRequestItemComments(items: RawRequestItemComment[]): RequestItemComment[] {
  const comments: RequestItemComment[] = [];

  for (const item of items) {
    const itemLabel = getRequestItemLabel(item);
    const byAuthor = {
      driver: { text: item.driver_comment, profile: item.profile_maintenance_request_items_driver_comment_byToprofile },
      supervisor: {
        text: item.supervisor_comment,
        profile: item.profile_maintenance_request_items_supervisor_comment_byToprofile,
      },
      validator: {
        text: item.validator_comment,
        profile: item.profile_maintenance_request_items_validator_comment_byToprofile,
      },
    };

    const seenTexts = new Set<string>();

    for (const author of COMMENT_AUTHOR_ORDER) {
      const { text, profile } = byAuthor[author];
      const comment = text?.trim();
      if (!comment) continue;

      const normalized = comment.toLowerCase();
      if (seenTexts.has(normalized)) continue;
      seenTexts.add(normalized);

      comments.push({
        itemId: item.id,
        itemLabel,
        author,
        comment,
        authorName: profile?.fullname ?? profile?.email ?? null,
      });
    }
  }

  return comments;
}

/** Los comentarios de los items de una solicitud, listos para el historial */
export async function getRequestItemComments(maintenanceRequestId: string | null | undefined) {
  if (!maintenanceRequestId) return [];
  const items = await prisma.maintenance_request_items.findMany({
    where: { maintenance_request_id: maintenanceRequestId },
    select: REQUEST_ITEM_COMMENTS_SELECT,
    orderBy: { created_at: 'asc' },
  });
  return mapRequestItemComments(items);
}

// ─── READs ────────────────────────────────────────────────────────────────────

/**
 * Obtiene las operaciones planificadas (pedidos con status 'scheduled')
 *
 * FILTRO DE SUPERVISOR:
 * - Usuarios con rol de sistema: ven TODAS las operaciones
 * - Usuarios sin rol de sistema: solo ven operaciones cuya solicitud tiene supervisor_id = su user_id
 */
