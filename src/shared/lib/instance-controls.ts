import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { connection } from 'next/server';
import { cache } from 'react';
import {
  DEFAULT_INSTANCE_CONTROLS,
  INSTANCE_CONTROL_KEYS,
  controlsFromSettings,
  type InstanceControls,
} from './instance-controls-core';
import { prismaSystem } from './prisma-system';

/**
 * Lectura de los controles de instancia (pausa y banners) con caché en memoria del proceso.
 *
 * Cada request de página o de API pasa por el proxy, que consulta la pausa: ir a la base cada vez sumaría una ida y
 * vuelta por request. El valor se guarda `CONTROLS_TTL_MS` en memoria (costo de lectura: un acceso a un objeto) y se
 * invalida en el proceso que aplica el cambio; los demás procesos (la API móvil, otra réplica) lo ven a más tardar al
 * vencer el TTL. Si la base falla se sigue con el último valor conocido o, si no hay, con todo apagado (falla abierta:
 * un problema de lectura no debe dejar el sistema en pausa).
 */

const logger = new Logger('shared/lib/instance-controls');

/** Vida del valor en memoria. Es también la demora máxima con que otro proceso ve un cambio. */
export const CONTROLS_TTL_MS = 5_000;

const CONTROL_KEYS = Object.values(INSTANCE_CONTROL_KEYS);

type SettingsReader = Pick<Prisma.TransactionClient, 'instance_settings'>;

/** Lee los controles con el cliente dado (dentro de una transacción, el `tx`). */
export async function readInstanceControls(db: SettingsReader): Promise<InstanceControls> {
  const rows = await db.instance_settings.findMany({
    where: { key: { in: CONTROL_KEYS } },
    select: { key: true, value: true },
  });
  return controlsFromSettings(rows);
}

let memo: { at: number; value: InstanceControls } | null = null;
let inflight: Promise<InstanceControls> | null = null;

/**
 * Controles vigentes, con caché de proceso. Apto para el proxy y los route handlers (no llama a `connection()`).
 * Las lecturas simultáneas comparten la misma consulta.
 */
export async function getInstanceControlsCached(): Promise<InstanceControls> {
  if (memo && Date.now() - memo.at < CONTROLS_TTL_MS) return memo.value;
  if (inflight) return inflight;
  inflight = readInstanceControls(prismaSystem)
    .then((value) => {
      memo = { at: Date.now(), value };
      return value;
    })
    .catch((error: unknown) => {
      logger.error('No se pudieron leer los controles de la instancia', { data: { error } });
      return memo?.value ?? DEFAULT_INSTANCE_CONTROLS;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Descarta el valor en memoria de este proceso (después de aplicar un cambio). */
export function invalidateInstanceControls(): void {
  memo = null;
}

/** Controles para Server Components (por request). Dato dinámico: con `cacheComponents` va dentro de un Suspense. */
export const getInstanceControls = cache(async (): Promise<InstanceControls> => {
  await connection();
  return getInstanceControlsCached();
});
