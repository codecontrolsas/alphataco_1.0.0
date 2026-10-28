import type { PrismaClient } from '@/generated/prisma/client';
import type { TenantContext } from '@/shared/lib/tenant-context';
import { ensureCity } from '@/test/db-fixtures';
import { RUN_RLS, assertAppRoleConnection, connectAsAppRoles, createTestCompany } from '@/test/rls-roles';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TemplateFormValues } from './lib/template-schema';

/**
 * Editor de plantillas de checklist (ticket 805) bajo el rol REAL de la app, con dos empresas: cada una crea y edita
 * las suyas y no ve ni toca las de la otra, aunque mande los ids a mano. Los permisos de la web se dan por buenos;
 * el módulo Checklists se lee de verdad (la suite corre con todo encendido).
 *
 * Corre con `scripts/test-rls.sh`.
 */
const state = vi.hoisted(() => ({ ctx: null as TenantContext | null }));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('next/cache', () => ({
  cacheTag: () => undefined,
  cacheLife: () => undefined,
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
  updateTag: () => undefined,
}));
vi.mock('@/shared/lib/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/session')>()),
  getSessionUserId: async () => state.ctx?.userId ?? null,
}));
vi.mock('@/shared/lib/tenant-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant-db')>()),
  getTenantContextOrNull: async () => state.ctx,
}));
vi.mock('@/shared/lib/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/tenant')>()),
  getActiveCompanyId: async () => {
    if (!state.ctx) throw new Error('sin empresa activa');
    return state.ctx.companyId;
  },
}));
vi.mock('@/features/Permissions/actions/permissions.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/Permissions/actions/permissions.server')>()),
  checkPermissionServer: async () => true,
}));

const COMPANY_A = '7c805000-0000-4000-8000-00000000000a';
const COMPANY_B = '7c805000-0000-4000-8000-00000000000b';

let owner: PrismaClient;

const values = (name: string, sections: TemplateFormValues['sections']): TemplateFormValues => ({
  name,
  description: '',
  is_active: false,
  sections,
});
const bm = (label: string) => ({ label, kind: 'bm' as const, options: '', is_critical: false, double_side: false });

async function as<T>(companyId: string, fn: (actions: typeof import('./actions.server')) => Promise<T>): Promise<T> {
  state.ctx = { companyId, userId: null, kind: 'user' };
  return fn(await import('./actions.server'));
}

async function cleanup(): Promise<void> {
  await owner.checklist_templates.deleteMany({ where: { company_id: { in: [COMPANY_A, COMPANY_B] } } });
  await owner.company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
}

describe.skipIf(!RUN_RLS)('plantillas de checklist por empresa bajo RLS (rol alphataco_app)', () => {
  let templateA = '';
  let templateB = '';

  beforeAll(async () => {
    owner = connectAsAppRoles();
    await assertAppRoleConnection();
    await cleanup();
    const city = await ensureCity(owner);
    await createTestCompany(owner, { id: COMPANY_A, name: '__rls_805_A__', cuit: 'RLS-805-A', cityId: city.id });
    await createTestCompany(owner, { id: COMPANY_B, name: '__rls_805_B__', cuit: 'RLS-805-B', cityId: city.id });
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await owner.$disconnect();
  });

  it('cada empresa crea la suya, con el mismo nombre y código, y la estructura queda en su empresa', async () => {
    const a = await as(COMPANY_A, (x) =>
      x.createChecklistTemplate(values('Checklist diario', [{ name: 'Luces', items: [bm('Freno'), bm('Giro')] }]))
    );
    const b = await as(COMPANY_B, (x) =>
      x.createChecklistTemplate(values('Checklist diario', [{ name: 'Cabina', items: [bm('Cinturón')] }]))
    );
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    templateA = a.data.id;
    templateB = b.data.id;

    const rows = await owner.checklist_templates.findMany({
      where: { id: { in: [templateA, templateB] } },
      select: { id: true, company_id: true, code: true, is_active: true },
    });
    expect(rows.map((r) => r.code)).toEqual(['CHECKLIST-DIARIO', 'CHECKLIST-DIARIO']);
    expect(rows.every((r) => r.is_active === false)).toBe(true);
    const items = await owner.checklist_template_items.findMany({
      where: { template_id: templateA },
      select: { company_id: true, code: true },
      orderBy: { order_index: 'asc' },
    });
    expect(items).toEqual([
      { company_id: COMPANY_A, code: 'freno' },
      { company_id: COMPANY_A, code: 'giro' },
    ]);
  });

  it('la otra empresa no la ve, no la edita, no la duplica ni la borra', async () => {
    expect(await as(COMPANY_B, (x) => x.getChecklistTemplateForEditor(templateA))).toBeNull();
    const edit = await as(COMPANY_B, (x) =>
      x.updateChecklistTemplate(templateA, values('Hackeada', [{ name: 'X', items: [bm('Y')] }]))
    );
    expect(edit).toEqual({ ok: false, error: 'No se encontró la plantilla' });
    expect((await as(COMPANY_B, (x) => x.duplicateChecklistTemplate(templateA))).ok).toBe(false);
    expect((await as(COMPANY_B, (x) => x.deleteChecklistTemplate(templateA))).ok).toBe(false);

    const still = await owner.checklist_templates.findUnique({ where: { id: templateA }, select: { name: true } });
    expect(still?.name).toBe('Checklist diario');
  });

  it('editar la propia no acepta secciones de la otra empresa', async () => {
    const editorB = await as(COMPANY_B, (x) => x.getChecklistTemplateForEditor(templateB));
    const foreignSection = editorB?.values.sections[0];
    expect(foreignSection?.id).toBeTruthy();

    const result = await as(COMPANY_A, (x) =>
      x.updateChecklistTemplate(templateA, values('Checklist diario', [{ ...foreignSection!, items: [bm('Z')] }]))
    );
    expect(result.ok).toBe(false);
    const sectionB = await owner.checklist_template_sections.findUnique({
      where: { id: foreignSection!.id! },
      select: { template_id: true, name: true },
    });
    expect(sectionB).toEqual({ template_id: templateB, name: 'Cabina' });
  });

  it('la empresa edita la suya (renombra, agrega, quita) y duplica una copia inactiva', async () => {
    const editor = await as(COMPANY_A, (x) => x.getChecklistTemplateForEditor(templateA));
    expect(editor).not.toBeNull();
    const [section] = editor!.values.sections;
    const saved = await as(COMPANY_A, (x) =>
      x.updateChecklistTemplate(
        templateA,
        values('Checklist diario v2', [
          {
            ...section,
            name: 'Luces y señales',
            items: [{ ...section.items[0], label: 'Freno trasero' }, bm('Balizas')],
          },
        ])
      )
    );
    expect(saved.ok).toBe(true);
    const items = await owner.checklist_template_items.findMany({
      where: { template_id: templateA },
      select: { code: true, label: true },
      orderBy: { order_index: 'asc' },
    });
    expect(items).toEqual([
      { code: 'freno', label: 'Freno trasero' },
      { code: 'balizas', label: 'Balizas' },
    ]);

    const copy = await as(COMPANY_A, (x) => x.duplicateChecklistTemplate(templateA));
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    const copied = await owner.checklist_templates.findUnique({
      where: { id: copy.data.id },
      select: { company_id: true, is_active: true, _count: { select: { checklist_template_items: true } } },
    });
    expect(copied).toEqual({ company_id: COMPANY_A, is_active: false, _count: { checklist_template_items: 2 } });
  });
});
