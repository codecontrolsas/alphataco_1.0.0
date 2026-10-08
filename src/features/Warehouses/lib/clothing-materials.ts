import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { clothingMaterialCode, clothingMaterialName } from './clothing-material-code';

/**
 * Materiales de stock de la ropa (Almacenes etapa 5): uno por combinacion articulo + marca +
 * talle de la matriz de Ropa, vinculados en `clothing_item_materials` (que nunca se borra).
 *
 * La llama el catalogo de Ropa dentro de su transaccion cada vez que cambia la matriz o el
 * nombre/estado de un articulo, marca o talle. No toca stock: el motor sigue siendo el unico
 * escritor de saldos y costo promedio.
 */

type Tx = Prisma.TransactionClient;

/** Que combinaciones revisar: las de un articulo, una marca, un talle, o todas las de la empresa. */
export type ClothingSyncScope = { itemId: string } | { brandId: string } | { sizeId: string } | 'all';

const CATEGORY_NAME = 'Ropa';

/** Categoria "Ropa" y unidad "u" de la empresa; las crea si faltan. */
async function ensureCategoryAndUnit(tx: Tx, companyId: string) {
  const category = await tx.material_categories.upsert({
    where: { company_id_name: { company_id: companyId, name: CATEGORY_NAME } },
    create: { company_id: companyId, name: CATEGORY_NAME },
    update: {},
    select: { id: true },
  });
  const unit =
    (await tx.measurement_units.findFirst({ where: { company_id: companyId, abbreviation: 'u' }, select: { id: true } })) ??
    (await tx.measurement_units.findFirst({ where: { company_id: companyId, name: 'Unidad' }, select: { id: true } })) ??
    (await tx.measurement_units.create({
      data: { company_id: companyId, name: 'Unidad', abbreviation: 'u' },
      select: { id: true },
    }));
  return { categoryId: category.id, unitId: unit.id };
}

const COMBO_SELECT = {
  clothing_item_id: true,
  clothing_brand_id: true,
  clothing_size_id: true,
  clothing_items: { select: { code: true, name: true, is_active: true } },
  clothing_brands: { select: { name: true, is_active: true } },
  clothing_sizes: { select: { name: true, is_active: true } },
} as const;

const comboKey = (c: { clothing_item_id: string; clothing_brand_id: string; clothing_size_id: string }) =>
  `${c.clothing_item_id}|${c.clothing_brand_id}|${c.clothing_size_id}`;

function scopeWhere(scope: ClothingSyncScope) {
  if (scope === 'all') return {};
  if ('itemId' in scope) return { clothing_item_id: scope.itemId };
  if ('brandId' in scope) return { clothing_brand_id: scope.brandId };
  return { clothing_size_id: scope.sizeId };
}

/**
 * Crea los materiales que faltan y sincroniza nombre y estado de los existentes del alcance.
 * Un material esta activo si su combinacion sigue en la matriz y el articulo, la marca y el talle
 * estan activos. Nunca se borra un material.
 */
export async function syncClothingMaterials(tx: Tx, companyId: string, scope: ClothingSyncScope): Promise<void> {
  const where = scopeWhere(scope);
  const [combos, links] = await Promise.all([
    tx.clothing_item_brand_sizes.findMany({
      where: { ...where, clothing_items: { company_id: companyId } },
      select: COMBO_SELECT,
    }),
    tx.clothing_item_materials.findMany({
      where: { ...where, company_id: companyId },
      select: {
        ...COMBO_SELECT,
        material: { select: { id: true, name: true, is_active: true } },
      },
    }),
  ]);
  const linked = new Map(links.map((l) => [comboKey(l), l]));
  const inMatrix = new Set(combos.map(comboKey));

  // Altas: combinaciones de la matriz sin material.
  const missing = combos.filter((c) => !linked.has(comboKey(c)));
  if (missing.length > 0) {
    const { categoryId, unitId } = await ensureCategoryAndUnit(tx, companyId);
    const taken = new Set(
      (await tx.materials.findMany({ where: { company_id: companyId }, select: { code: true } })).map((m) => m.code)
    );
    for (const c of missing) {
      const combination = {
        itemCode: c.clothing_items.code,
        itemName: c.clothing_items.name,
        brandName: c.clothing_brands.name,
        sizeName: c.clothing_sizes.name,
      };
      const code = clothingMaterialCode(combination, taken);
      taken.add(code);
      const material = await tx.materials.create({
        data: {
          company_id: companyId,
          code,
          name: clothingMaterialName(combination),
          category_id: categoryId,
          unit_id: unitId,
          tracking_type: 'QUANTITY',
          is_active: c.clothing_items.is_active && c.clothing_brands.is_active && c.clothing_sizes.is_active,
        },
        select: { id: true },
      });
      await tx.clothing_item_materials.create({
        data: {
          company_id: companyId,
          clothing_item_id: c.clothing_item_id,
          clothing_brand_id: c.clothing_brand_id,
          clothing_size_id: c.clothing_size_id,
          material_id: material.id,
        },
      });
    }
  }

  // Existentes: nombre y estado al dia (incluye los que salieron de la matriz -> inactivos).
  for (const link of links) {
    const name = clothingMaterialName({
      itemName: link.clothing_items.name,
      brandName: link.clothing_brands.name,
      sizeName: link.clothing_sizes.name,
    });
    const active =
      inMatrix.has(comboKey(link)) &&
      link.clothing_items.is_active &&
      link.clothing_brands.is_active &&
      link.clothing_sizes.is_active;
    if (link.material.name !== name || link.material.is_active !== active) {
      await tx.materials.update({ where: { id: link.material.id }, data: { name, is_active: active } });
    }
  }
}
