import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Bandeja «Para atender» (#784): orden por urgencia, permisos por fuente, y que un error nunca se
 * dibuje como «nada pendiente».
 */
const state = vi.hoisted(() => ({
  sections: {} as Record<string, { status: 'ok'; count: number } | { status: 'forbidden' } | { status: 'error' }>,
  docs: {
    employees: { status: 'ok', series: { overdue: 0, byDay: [] } } as unknown,
    vehicles: { status: 'forbidden' } as unknown,
  },
  canCertifications: true,
  certifications: [] as { status: string; _count: { _all: number } }[],
  certificationsFail: false,
}));

vi.mock('react', async (importActual) => ({
  ...(await importActual<typeof import('react')>()),
  // Sin request de React no hay memo: cada llamada recalcula.
  cache: <T>(fn: T) => fn,
}));
vi.mock('@/features/Layout/sidebar/lib/section-count-loaders', () => ({
  SECTION_COUNT_LOADERS: {
    compras: { solicitudes: null, pagos: null },
    almacenes: { prestamos: null },
    tesoreria: { conciliacion: null },
  },
  loadSectionCountResult: async (module: string, tab: string) =>
    state.sections[`${module}:${tab}`] ?? { status: 'forbidden' },
  hasPermissionCached: async () => state.canCertifications,
}));
vi.mock('@/features/Dashboard/Documentacion/lib/expiring-overview.server', () => ({
  loadExpiringOverview: async () => ({ today: '2026-10-20', ...state.docs }),
}));
vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => 'company-1' }));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    certifications: {
      groupBy: async () => {
        if (state.certificationsFail) throw new Error('base caída');
        return state.certifications;
      },
    },
  },
}));

async function load() {
  const { loadAttentionInbox } = await import('./attention.server');
  return loadAttentionInbox();
}

describe('loadAttentionInbox', () => {
  beforeEach(() => {
    state.sections = {};
    state.docs = { employees: { status: 'ok', series: { overdue: 0, byDay: [] } }, vehicles: { status: 'forbidden' } };
    state.canCertifications = true;
    state.certifications = [];
    state.certificationsFail = false;
  });

  it('ordena de lo vencido a lo que solo está en curso y, dentro de cada grupo, por cantidad', async () => {
    state.sections = {
      'compras:solicitudes': { status: 'ok', count: 2 },
      'compras:pagos': { status: 'ok', count: 1 },
      'almacenes:prestamos': { status: 'ok', count: 9 },
    };
    state.docs.employees = { status: 'ok', series: { overdue: 40, byDay: [] } };
    state.certifications = [{ status: 'borrador', _count: { _all: 5 } }];

    const { items, checked, failed } = await load();

    expect(items.map((item) => [item.key, item.tone, item.count])).toEqual([
      ['documentacion:empleados', 'danger', 40],
      ['compras:pagos', 'danger', 1],
      ['comercial:certificaciones-borrador', 'warn', 5],
      ['compras:solicitudes', 'warn', 2],
      ['almacenes:prestamos', 'info', 9],
    ]);
    // Certificaciones confirmadas en 0: se revisó (cuenta) pero no se muestra.
    expect(checked).toBe(6);
    expect(failed).toBe(0);
  });

  it('cada fila lleva a la sección del menú donde se resuelve', async () => {
    state.sections = { 'compras:solicitudes': { status: 'ok', count: 1 } };
    const { items } = await load();
    expect(items[0]).toMatchObject({ module: 'Compras', href: '/dashboard/purchases?tab=solicitudes' });
  });

  it('lo que el usuario no puede ver no aparece ni cuenta en el denominador', async () => {
    state.canCertifications = false;
    state.docs.employees = { status: 'forbidden' };
    const { items, checked, failed } = await load();
    expect(items).toEqual([]);
    expect(checked).toBe(0);
    expect(failed).toBe(0);
  });

  it('un error se cuenta como fallido, nunca como «nada pendiente»', async () => {
    state.sections = { 'tesoreria:conciliacion': { status: 'error' } };
    state.certificationsFail = true;
    const { items, checked, failed } = await load();
    expect(items).toEqual([]);
    // documentos de personal se revisaron (0 vencidos); conciliación y las dos de certificaciones fallaron.
    expect(checked).toBe(1);
    expect(failed).toBe(3);
  });
});
