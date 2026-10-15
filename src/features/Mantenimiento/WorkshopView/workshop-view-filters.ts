/**
 * Criterios compartidos de la Vista Taller.
 *
 * Vive en un módulo sin directiva porque lo comparten dos archivos `'use server'`
 * (los conteos del acordeón y la tabla de cada sector) y esos sólo pueden
 * exportar funciones async.
 */

import type { work_order_status } from '@/generated/prisma/enums';

/**
 * Estados terminales de una orden de trabajo.
 *
 * La Vista Taller es la pantalla del trabajo pendiente: una OT que ya terminó
 * no se muestra (ticket 650).
 */
export const CLOSED_WORK_ORDER_STATUSES = ['completed', 'completed_partial', 'cancelled'] as const;

/**
 * Estados de OT que la Vista Taller sí muestra (el complemento de los cerrados).
 *
 * Se usa también para las opciones del filtro "Estado OT": ofrecer los cerrados
 * sería ofrecer filtros que siempre devuelven cero.
 */
export const OPEN_WORK_ORDER_STATUSES: work_order_status[] = ['pending', 'in_progress', 'paused'];

/**
 * Condición Prisma sobre `work_orders` que deja sólo el trabajo abierto.
 */
export const OPEN_WORK_ORDERS_ONLY = {
  status: { notIn: [...CLOSED_WORK_ORDER_STATUSES] },
};

/**
 * Estados de OT que ocupan un cupo del sector (ticket 678).
 *
 * Criterio de Fabricio: el cupo cuenta **unidades dentro del taller**, y una OT
 * pendiente todavía no entró ("la que está pendiente no cuenta como cupo porque
 * se supone que no está dentro del taller"). Una OT pausada sí: alguien la
 * inició, así que la unidad está adentro — es además el criterio que ya usa
 * `getSectorOccupancy` de Planificación, del que sólo se saca `pending`.
 *
 * Cada OT es una unidad (la BD garantiza que apunta a un vehículo O a un
 * equipamiento), así que contar OT es contar patentes.
 */
export const OCCUPYING_WORK_ORDER_STATUSES: work_order_status[] = ['in_progress', 'paused'];

/**
 * Parámetro de la URL con el sector elegido en la grilla de tarjetas (`?tab=workshop_view&sector=<id>`).
 * Lo lee el Server Component de la Vista Taller para armar la tabla de ESE sector y lo escribe la grilla al
 * tocar una tarjeta. No lleva el prefijo de ninguna tabla: los parámetros de cada tabla van namespaced.
 */
export const WORKSHOP_SECTOR_PARAM = 'sector';
