'use server';

import { getInboxDecisionCount, getInboxForUser } from '../lib/registry.server';
import type { InboxData } from '../lib/types';

/** Bandeja del usuario (cada proveedor aplica sus propios permisos en el servidor). */
export async function getInbox(type?: string): Promise<InboxData> {
  return getInboxForUser(type);
}

/** Contador de decisiones del ícono del header. `null` = no se pudo calcular. */
export async function getInboxCount(): Promise<number | null> {
  return getInboxDecisionCount();
}
