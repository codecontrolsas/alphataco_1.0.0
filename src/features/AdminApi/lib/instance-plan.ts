import type { BannerState, InstanceEditableState } from '@/shared/lib/instance-controls-core';
import type { InstanceField, InstanceUpdateRequest } from '../schemas/instance';

/**
 * Cálculo puro de un cambio de controles de instancia (`PUT /api/admin/v1/instance`): mezcla el pedido parcial con el
 * estado vigente, valida el estado RESULTANTE (no solo el pedido) y lista los campos que cambian, para la auditoría.
 * La validación contra las empresas existentes necesita la base: va en `instance.server.ts`, con el lock tomado.
 */

export interface InstanceChange {
  field: InstanceField;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
}

export type InstancePlan =
  | { ok: true; next: InstanceEditableState; changes: InstanceChange[] }
  | { ok: false; code: 'INVALID_STATE'; message: string };

const SLOTS = ['login', 'dashboard'] as const;

function mergeBanner(current: BannerState, patch: Partial<BannerState> | undefined): BannerState {
  return {
    enabled: patch?.enabled ?? current.enabled,
    message: patch?.message ?? current.message,
    severity: patch?.severity ?? current.severity,
  };
}

export function computeInstancePlan(
  current: InstanceEditableState,
  request: InstanceUpdateRequest,
  now: Date
): InstancePlan {
  const pauseActive = request.pause?.active ?? current.pause.active;
  const next: InstanceEditableState = {
    maxCompanies: request.max_companies ?? current.maxCompanies,
    pause: {
      active: pauseActive,
      message: request.pause?.message ?? current.pause.message,
      // `since`: se fija al activar, se conserva mientras siga activa (aunque cambie el mensaje) y se borra al reanudar.
      since: !pauseActive ? null : current.pause.active ? current.pause.since ?? now.toISOString() : now.toISOString(),
    },
    banners: {
      login: mergeBanner(current.banners.login, request.banners?.login),
      dashboard: mergeBanner(current.banners.dashboard, request.banners?.dashboard),
    },
  };

  for (const slot of SLOTS) {
    if (next.banners[slot].enabled && next.banners[slot].message === '') {
      return { ok: false, code: 'INVALID_STATE', message: `El banner «${slot}» no se puede encender sin mensaje` };
    }
  }

  const changes: InstanceChange[] = [];
  const push = (field: InstanceField, from: InstanceChange['from'], to: InstanceChange['to']) => {
    if (from !== to) changes.push({ field, from, to });
  };
  push('max_companies', current.maxCompanies, next.maxCompanies);
  push('pause.active', current.pause.active, next.pause.active);
  push('pause.message', current.pause.message, next.pause.message);
  for (const slot of SLOTS) {
    push(`banners.${slot}.enabled`, current.banners[slot].enabled, next.banners[slot].enabled);
    push(`banners.${slot}.message`, current.banners[slot].message, next.banners[slot].message);
    push(`banners.${slot}.severity`, current.banners[slot].severity, next.banners[slot].severity);
  }
  return { ok: true, next, changes };
}

/** El límite no puede quedar por debajo de las empresas que ya existen (borrarlas es una acción aparte de soporte). */
export function isBelowExistingCompanies(maxCompanies: number, companiesTotal: number): boolean {
  return maxCompanies < companiesTotal;
}
