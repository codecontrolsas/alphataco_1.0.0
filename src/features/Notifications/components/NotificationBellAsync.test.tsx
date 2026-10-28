import { describe, expect, it, vi } from 'vitest';

/**
 * La campanita vive en el header de todo el dashboard. Sin empresa activa (el usuario que el proxy manda a
 * `/dashboard/configuration/companies/new` en su primer ingreso) no se muestra: antes lanzaba y rompía la página.
 */
const state = vi.hoisted(() => ({ companyId: null as string | null }));

// Sin `importOriginal`: el módulo real arrastra el cliente de Prisma. La clase la comparten el mock y el componente.
vi.mock('@/shared/lib/tenant', () => {
  class NoActiveCompanyError extends Error {}
  return {
    NoActiveCompanyError,
    getActiveCompanyId: async () => {
      if (!state.companyId) throw new NoActiveCompanyError('No hay empresa activa para este usuario');
      return state.companyId;
    },
  };
});
vi.mock('../actions/notifications.server', () => ({ getUnreadNotificationsCount: async () => 0 }));
vi.mock('./NotificationBell', () => ({ NotificationBell: () => null }));

describe('NotificationBellAsync', () => {
  it('sin empresa activa no muestra la campanita (y no rompe el layout)', async () => {
    state.companyId = null;
    const { NotificationBellAsync } = await import('./NotificationBellAsync');
    await expect(NotificationBellAsync()).resolves.toBeNull();
  });

  it('con empresa activa la muestra con esa empresa', async () => {
    state.companyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const { NotificationBellAsync } = await import('./NotificationBellAsync');
    await expect(NotificationBellAsync()).resolves.toMatchObject({
      props: { companyId: state.companyId, initialUnread: 0 },
    });
  });
});
