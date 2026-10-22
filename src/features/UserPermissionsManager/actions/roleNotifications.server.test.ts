import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Avisos por rol (#786): altas y bajas explícitas, validación de claves y permiso de edición. */
const state = vi.hoisted(() => ({
  allowed: true,
  roleExists: true,
  created: [] as unknown[],
  deletedWhere: null as unknown,
}));

vi.mock('@/features/Permissions/actions/permissions.server', () => ({ checkPermissionServer: async () => state.allowed }));
vi.mock('@/shared/lib/prisma', () => {
  const tx = {
    roles: { findUnique: async () => (state.roleExists ? { id: BigInt(7) } : null) },
    role_notifications: {
      createMany: async ({ data }: { data: unknown[] }) => {
        state.created = data;
        return { count: data.length };
      },
      deleteMany: async ({ where }: { where: unknown }) => {
        state.deletedWhere = where;
        return { count: 1 };
      },
    },
  };
  return {
    prisma: {
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      role_notifications: { findMany: async () => [{ event_key: 'purchases.order_decided', channel: 'email' }] },
    },
  };
});

async function actions() {
  return import('./roleNotifications.server');
}

describe('avisos por rol', () => {
  beforeEach(() => {
    state.allowed = true;
    state.roleExists = true;
    state.created = [];
    state.deletedWhere = null;
  });

  it('aplica solo las altas y bajas enviadas y devuelve lo que cambió', async () => {
    const { updateRoleNotifications } = await actions();
    const result = await updateRoleNotifications(7, {
      add: [{ eventKey: 'purchases.request_submitted', channel: 'in_app' }],
      remove: [{ eventKey: 'warehouses.batch_expiry', channel: 'email' }],
    });
    expect(result).toEqual({ added: 1, removed: 1 });
    expect(state.created).toEqual([
      { role_id: BigInt(7), event_key: 'purchases.request_submitted', channel: 'in_app' },
    ]);
    expect(state.deletedWhere).toEqual({
      role_id: BigInt(7),
      OR: [{ event_key: 'warehouses.batch_expiry', channel: 'email' }],
    });
  });

  it('rechaza claves que no están en el catálogo', async () => {
    const { updateRoleNotifications } = await actions();
    await expect(
      updateRoleNotifications(7, { add: [{ eventKey: 'compras.inventado', channel: 'in_app' }], remove: [] })
    ).rejects.toThrow('Los avisos enviados no son válidos');
  });

  it('no deja activar y desactivar lo mismo a la vez', async () => {
    const { updateRoleNotifications } = await actions();
    const pair = { eventKey: 'purchases.order_decided', channel: 'email' } as const;
    await expect(updateRoleNotifications(7, { add: [pair], remove: [pair] })).rejects.toThrow('a la vez');
  });

  it('sin permiso de edición de roles no cambia nada', async () => {
    state.allowed = false;
    const { updateRoleNotifications } = await actions();
    await expect(
      updateRoleNotifications(7, { add: [{ eventKey: 'purchases.order_decided', channel: 'in_app' }], remove: [] })
    ).rejects.toThrow('No tienes permisos');
    expect(state.created).toEqual([]);
  });

  it('sin cambios no toca la base', async () => {
    const { updateRoleNotifications } = await actions();
    expect(await updateRoleNotifications(7, { add: [], remove: [] })).toEqual({ added: 0, removed: 0 });
  });

  it('un rol inexistente es un error explícito', async () => {
    state.roleExists = false;
    const { updateRoleNotifications } = await actions();
    await expect(
      updateRoleNotifications(7, { add: [{ eventKey: 'purchases.order_decided', channel: 'in_app' }], remove: [] })
    ).rejects.toThrow('El rol no existe');
  });

  it('el baseline del editor exige poder ver los roles', async () => {
    const { getRoleNotificationSettings } = await actions();
    expect(await getRoleNotificationSettings(7)).toEqual([{ eventKey: 'purchases.order_decided', channel: 'email' }]);
    state.allowed = false;
    await expect(getRoleNotificationSettings(7)).rejects.toThrow('No tienes permisos');
  });
});
