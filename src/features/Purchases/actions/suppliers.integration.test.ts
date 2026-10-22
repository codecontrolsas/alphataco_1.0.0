import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Proveedores de Compras (etapa 1) contra el Postgres del compose: `npm run test:purchases`.
 * Se simulan la sesion, la empresa activa, los permisos y el storage (el job de CI no levanta
 * RustFS).
 */

const COMPANY = 'd1000000-0000-4000-8000-000000000001';
const OTHER_COMPANY = 'd1000000-0000-4000-8000-000000000002';
const PROFILE = 'd1000000-0000-4000-8000-000000000003';

let activeCompany = COMPANY;

vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => activeCompany }));
vi.mock('@/features/Permissions/actions/permissions.server', () => ({ checkPermissionServer: async () => true }));
vi.mock('@/shared/actions/auth.actions', () => {
  const profile = { id: PROFILE, credentialId: PROFILE, fullname: 'Compras Test', email: null };
  return { getServerAuthProfile: async () => profile, requireServerAuthProfile: async () => profile };
});
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
const { storageUpload, storageRemove } = vi.hoisted(() => ({
  storageUpload: vi.fn(async (_bucket: string, path: string) => ({ ok: true as const, data: { path } })),
  storageRemove: vi.fn(async () => ({ ok: true as const, data: null })),
}));
vi.mock('@/shared/lib/storage', () => ({ storageUpload, storageRemove }));

const RUN = Boolean(process.env.DATABASE_URL);

/** CUIT valido a partir de 10 digitos (calcula el verificador). */
function cuitFrom(prefix10: string): string {
  const coefficients = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = coefficients.reduce((acc, c, i) => acc + c * Number(prefix10[i]), 0);
  const check = (11 - (sum % 11)) % 11;
  if (check === 10) throw new Error(`prefijo sin CUIT valido: ${prefix10}`);
  return `${prefix10}${check}`;
}

const CUIT_A = cuitFrom('3071234567');
const CUIT_B = cuitFrom('3070000001');

async function db() {
  return (await import('@/shared/lib/prisma')).prisma;
}

async function cleanup() {
  const prisma = await db();
  const company_id = { in: [COMPANY, OTHER_COMPANY] };
  await prisma.purchase_request_lines.deleteMany({ where: { request: { company_id } } });
  await prisma.purchase_requests.deleteMany({ where: { company_id } });
  await prisma.supplier_documents.updateMany({ where: { supplier: { company_id } }, data: { replaced_by_id: null } });
  await prisma.suppliers.deleteMany({ where: { company_id } });
  await prisma.supplier_categories.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.profile.deleteMany({ where: { id: PROFILE } });
  await prisma.company.deleteMany({ where: { id: company_id } });
}

const baseValues = (overrides: Record<string, unknown> = {}) => ({
  name: 'Repuestos del Sur SRL',
  tradeName: '',
  cuit: `${CUIT_A.slice(0, 2)}-${CUIT_A.slice(2, 10)}-${CUIT_A.slice(10)}`,
  vatConditionId: '1',
  street: '',
  city: 'Neuquén',
  province: '',
  postalCode: '',
  paymentTermDays: '30',
  bankCbu: '',
  bankAlias: '',
  notes: '',
  contacts: [{ id: '', name: 'Ana', email: 'ana@repuestos.test', phone: '', role: 'Ventas', isPrimary: true }],
  categoryIds: [] as string[],
  ...overrides,
});

function expectOk<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`Se esperaba ok y vino: ${result.error}`);
  return result.data;
}

describe.skipIf(!RUN)('proveedores de Compras (integracion)', () => {
  let categoryA = '';
  let categoryB = '';
  let supplierId = '';

  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    for (const [id, cuit] of [
      [COMPANY, '30999999987'],
      [OTHER_COMPANY, '30999999988'],
    ] as const) {
      await prisma.company.create({
        data: {
          id,
          company_name: `Compras test ${cuit}`,
          description: 'empresa de prueba',
          contact_email: 'compras-test@alphataco.local',
          contact_phone: '+542991234567',
          address: 'Calle 123',
          city: city.id,
          country: 'argentina',
          industry: 'Petroleo',
          company_cuit: cuit,
        },
      });
    }
    await prisma.profile.create({ data: { id: PROFILE, credential_id: PROFILE, email: 'compras-test@alphataco.local' } });
    const { createSupplierCategory } = await import('./categories.server');
    categoryA = expectOk(await createSupplierCategory({ name: 'Repuestos' })).id;
    categoryB = expectOk(await createSupplierCategory({ name: 'Lubricantes' })).id;
  }, 60_000);

  afterAll(async () => {
    activeCompany = COMPANY;
    await cleanup();
  }, 60_000);

  it('el alta normaliza el CUIT con guiones y carga contacto y rubros', async () => {
    const { createSupplier } = await import('./suppliers.server');
    supplierId = expectOk(await createSupplier(baseValues(), [categoryA])).id;
    const prisma = await db();
    const supplier = await prisma.suppliers.findUniqueOrThrow({
      where: { id: supplierId },
      include: { contacts: true, category_links: true },
    });
    expect(supplier.cuit.toString()).toBe(CUIT_A);
    expect(supplier.contacts).toHaveLength(1);
    expect(supplier.category_links.map((l) => l.category_id)).toEqual([categoryA]);
  });

  it('rechaza un CUIT invalido y uno repetido en la empresa; en otra empresa se permite', async () => {
    const { createSupplier } = await import('./suppliers.server');
    expect(await createSupplier(baseValues({ cuit: '30-71234567-0' }), [])).toEqual({ ok: false, error: 'CUIT inválido' });
    expect(await createSupplier(baseValues({ name: 'Otro' }), [])).toEqual({
      ok: false,
      error: `Ya existe el proveedor Repuestos del Sur SRL con el CUIT ${CUIT_A.slice(0, 2)}-${CUIT_A.slice(2, 10)}-${CUIT_A.slice(10)}`,
    });
    activeCompany = OTHER_COMPANY;
    expectOk(await createSupplier(baseValues(), []));
    activeCompany = COMPANY;
  });

  it('dos contactos principales se rechazan con mensaje', async () => {
    const { createSupplier } = await import('./suppliers.server');
    const contact = { id: '', name: 'X', email: '', phone: '', role: '', isPrimary: true };
    expect(await createSupplier(baseValues({ cuit: CUIT_B, contacts: [contact, { ...contact, name: 'Y' }] }), [])).toEqual({
      ok: false,
      error: 'Solo puede haber un contacto principal',
    });
  });

  it('editar: cambia el principal, agrega un contacto y borra solo los indicados', async () => {
    const { updateSupplier, getSupplierDetail } = await import('./suppliers.server');
    const before = await getSupplierDetail(supplierId);
    const ana = before!.contacts[0]!;
    const result = await updateSupplier(
      supplierId,
      baseValues({
        contacts: [
          { id: ana.id, name: 'Ana', email: 'ana@repuestos.test', phone: '', role: 'Ventas', isPrimary: false },
          { id: '', name: 'Bruno', email: '', phone: '299 555', role: 'Cobranzas', isPrimary: true },
        ],
      }),
      { removedContactIds: [], categories: { add: [categoryB], remove: [] } }
    );
    expectOk(result);
    const after = await getSupplierDetail(supplierId);
    expect(after!.contacts.map((c) => [c.name, c.is_primary])).toEqual([
      ['Bruno', true],
      ['Ana', false],
    ]);
    // Lo que no viene en `remove` no se borra: el rubro A sigue.
    expect(after!.categories.map((c) => c.id).sort()).toEqual([categoryA, categoryB].sort());

    // Un contacto que no se manda NO se borra; solo los de `removedContactIds`.
    expectOk(
      await updateSupplier(supplierId, baseValues({ contacts: [] }), {
        removedContactIds: [ana.id],
        categories: { add: [], remove: [categoryB] },
      })
    );
    const final = await getSupplierDetail(supplierId);
    expect(final!.contacts.map((c) => c.name)).toEqual(['Bruno']);
    expect(final!.categories.map((c) => c.id)).toEqual([categoryA]);
  });

  it('un proveedor de otra empresa no se edita', async () => {
    const { updateSupplier } = await import('./suppliers.server');
    activeCompany = OTHER_COMPANY;
    expect(
      await updateSupplier(supplierId, baseValues(), { removedContactIds: [], categories: { add: [], remove: [] } })
    ).toEqual({ ok: false, error: 'El proveedor no existe' });
    activeCompany = COMPANY;
  });

  it('documentos: reemplazar conserva el anterior; con documentos el proveedor se desactiva', async () => {
    const { uploadSupplierDocument, getSupplierDetail, removeSupplier } = await import('./suppliers.server');
    const form = (fields: Record<string, string>) => {
      const fd = new FormData();
      fd.set('file', new File(['%PDF-1.4'], 'constancia arca.pdf', { type: 'application/pdf' }));
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      return fd;
    };
    const first = expectOk(await uploadSupplierDocument(supplierId, form({ name: 'Constancia ARCA', expiresAt: '2026-01-31' })));
    const second = expectOk(
      await uploadSupplierDocument(supplierId, form({ name: 'Constancia ARCA', expiresAt: '2027-01-31', replacesId: first.id }))
    );
    const detail = await getSupplierDetail(supplierId);
    const old = detail!.documents.find((d) => d.id === first.id)!;
    expect(old.replaced_by_id).toBe(second.id);
    expect(detail!.documents).toHaveLength(2);
    expect(storageUpload.mock.calls.at(-1)?.[1]).toMatch(new RegExp(`^${COMPANY}/${supplierId}/\\d+-constancia_arca\\.pdf$`));

    // Reemplazar uno ya reemplazado: rechazado, y el archivo subido se borra.
    const removedBefore = storageRemove.mock.calls.length;
    expect(await uploadSupplierDocument(supplierId, form({ name: 'Constancia ARCA', replacesId: first.id }))).toEqual({
      ok: false,
      error: 'El documento que querés reemplazar ya no está vigente',
    });
    expect(storageRemove.mock.calls.length).toBe(removedBefore + 1);

    expect(expectOk(await removeSupplier(supplierId)).mode).toBe('deactivate');
  });

  it('un proveedor sin uso se borra', async () => {
    const { createSupplier, removeSupplier } = await import('./suppliers.server');
    const id = expectOk(await createSupplier(baseValues({ cuit: CUIT_B, name: 'Sin uso' }), [])).id;
    expect(expectOk(await removeSupplier(id)).mode).toBe('delete');
  });
});
