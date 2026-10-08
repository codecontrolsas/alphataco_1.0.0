import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Materiales de la matriz de Ropa (Almacenes etapa 5) contra el Postgres del compose:
 * `npm run test:warehouses`. Se ejercitan las actions reales del catalogo de Ropa.
 */

const COMPANY = 'c6000000-0000-4000-8000-000000000001';
const ITEM = 'c6000000-0000-4000-8000-000000000010';
const BRAND = 'c6000000-0000-4000-8000-000000000020';
const BRAND_SAME_PREFIX = 'c6000000-0000-4000-8000-000000000021';
const SIZE = 'c6000000-0000-4000-8000-000000000030';

vi.mock('@/shared/lib/tenant', () => ({ getActiveCompanyId: async () => COMPANY }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const RUN = Boolean(process.env.DATABASE_URL);

async function db() {
  return (await import('@/shared/lib/prisma')).prisma;
}

async function cleanup() {
  const prisma = await db();
  const company_id = COMPANY;
  await prisma.clothing_item_materials.deleteMany({ where: { company_id } });
  await prisma.materials.deleteMany({ where: { company_id } });
  await prisma.clothing_item_brand_sizes.deleteMany({ where: { clothing_items: { company_id } } });
  await prisma.clothing_items.deleteMany({ where: { company_id } });
  await prisma.clothing_brands.deleteMany({ where: { company_id } });
  await prisma.clothing_sizes.deleteMany({ where: { company_id } });
  await prisma.material_categories.deleteMany({ where: { company_id } });
  await prisma.measurement_units.deleteMany({ where: { company_id } });
  await prisma.company.deleteMany({ where: { id: company_id } });
}

async function linkedMaterial(brandId = BRAND) {
  const prisma = await db();
  const link = await prisma.clothing_item_materials.findUnique({
    where: { clothing_item_id_clothing_brand_id_clothing_size_id: { clothing_item_id: ITEM, clothing_brand_id: brandId, clothing_size_id: SIZE } },
    include: { material: { include: { category: true, unit: true } } },
  });
  return link?.material ?? null;
}

describe.skipIf(!RUN)('materiales de la matriz de Ropa (integracion)', () => {
  beforeAll(async () => {
    await cleanup();
    const prisma = await db();
    const city = await prisma.cities.findFirstOrThrow({ select: { id: true } });
    await prisma.company.create({
      data: {
        id: COMPANY,
        company_name: 'Ropa materiales test',
        description: 'empresa de prueba',
        contact_email: 'ropa-materiales@alphataco.local',
        contact_phone: '+542991234567',
        address: 'Calle 123',
        city: city.id,
        country: 'argentina',
        industry: 'Petroleo',
        company_cuit: '30999999993',
      },
    });
    await prisma.clothing_items.create({ data: { id: ITEM, company_id: COMPANY, name: 'Camisa de trabajo', code: 'IND-001' } });
    await prisma.clothing_brands.createMany({
      data: [
        { id: BRAND, company_id: COMPANY, name: 'Ombú' },
        { id: BRAND_SAME_PREFIX, company_id: COMPANY, name: 'Ombudsman' },
      ],
    });
    await prisma.clothing_sizes.create({ data: { id: SIZE, company_id: COMPANY, name: '42' } });
  }, 30_000);

  afterAll(async () => {
    await cleanup();
  }, 30_000);

  it('habilitar una combinacion crea su material (categoria Ropa, unidad u)', async () => {
    const { setItemBrandSizes } = await import('@/features/Clothing/actions/catalog.server');
    await setItemBrandSizes(ITEM, { add: [{ brandId: BRAND, sizeId: SIZE }], remove: [] });
    const material = await linkedMaterial();
    expect(material).toMatchObject({ code: 'IND-001-OMB-42', name: 'Camisa de trabajo · Ombú · 42', is_active: true });
    expect(material?.category?.name).toBe('Ropa');
    expect(material?.unit.abbreviation).toBe('u');
  });

  it('dos marcas con la misma abreviatura reciben codigos distintos', async () => {
    const { setItemBrandSizes } = await import('@/features/Clothing/actions/catalog.server');
    await setItemBrandSizes(ITEM, { add: [{ brandId: BRAND_SAME_PREFIX, sizeId: SIZE }], remove: [] });
    expect((await linkedMaterial(BRAND_SAME_PREFIX))?.code).toBe('IND-001-OMB-42-2');
  });

  it('renombrar la marca renombra el material sin cambiar su codigo', async () => {
    const { updateClothingBrand } = await import('@/features/Clothing/actions/catalog.server');
    await updateClothingBrand(BRAND, 'Ombú Pro');
    const material = await linkedMaterial();
    expect(material).toMatchObject({ code: 'IND-001-OMB-42', name: 'Camisa de trabajo · Ombú Pro · 42' });
  });

  it('quitar la combinacion desactiva el material y volver a habilitarla recupera el mismo', async () => {
    const { setItemBrandSizes } = await import('@/features/Clothing/actions/catalog.server');
    const before = await linkedMaterial();
    await setItemBrandSizes(ITEM, { add: [], remove: [{ brandId: BRAND, sizeId: SIZE }] });
    expect((await linkedMaterial())?.is_active).toBe(false);
    // La otra combinacion no se toca: la ausencia de un par no lo borra.
    expect((await linkedMaterial(BRAND_SAME_PREFIX))?.is_active).toBe(true);

    await setItemBrandSizes(ITEM, { add: [{ brandId: BRAND, sizeId: SIZE }], remove: [] });
    const after = await linkedMaterial();
    expect(after?.id).toBe(before?.id);
    expect(after?.is_active).toBe(true);
  });

  it('desactivar el articulo desactiva sus materiales', async () => {
    const { toggleClothingItemActive } = await import('@/features/Clothing/actions/catalog.server');
    await toggleClothingItemActive(ITEM, false);
    expect((await linkedMaterial())?.is_active).toBe(false);
    expect((await linkedMaterial(BRAND_SAME_PREFIX))?.is_active).toBe(false);
    await toggleClothingItemActive(ITEM, true);
    expect((await linkedMaterial())?.is_active).toBe(true);
  });
});
