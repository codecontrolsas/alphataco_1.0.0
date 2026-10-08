import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import { StockError } from './stock-errors';
import { tireMaterialCode, tireMaterialName } from './tire-material-code';

/**
 * Materiales de stock de las cubiertas (Almacenes etapa 6): uno SERIAL por combinacion tipo +
 * marca de Gomeria, vinculados en `tire_materials` (que nunca se borra). Cada cubierta es una
 * unidad de su material.
 *
 * La llama el catalogo de Gomeria dentro de su transaccion cada vez que se crea, edita o
 * (des)activa un tipo o una marca. No toca stock: el motor sigue siendo el unico escritor de
 * saldos y costo promedio.
 */

type Tx = Prisma.TransactionClient;

const CATEGORY_NAME = 'Cubiertas';

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

/**
 * Crea el material de cada combinacion tipo x marca de la empresa que no lo tenga, y deja nombre
 * y estado al dia en los existentes: activo si el tipo y la marca lo estan. Nunca borra.
 */
export async function syncTireMaterials(tx: Tx, companyId: string): Promise<void> {
  const [types, brands, links] = await Promise.all([
    tx.tire_types.findMany({
      where: { company_id: companyId },
      select: { id: true, size: true, tread_type: true, is_active: true },
      orderBy: [{ size: 'asc' }, { tread_type: 'asc' }],
    }),
    tx.tire_brands.findMany({
      where: { company_id: companyId },
      select: { id: true, name: true, is_active: true },
      orderBy: { name: 'asc' },
    }),
    tx.tire_materials.findMany({
      where: { company_id: companyId },
      select: { tire_type_id: true, tire_brand_id: true, material: { select: { id: true, name: true, is_active: true } } },
    }),
  ]);
  const linked = new Map(links.map((l) => [`${l.tire_type_id}|${l.tire_brand_id}`, l.material]));

  let lookups: { categoryId: string; unitId: string } | null = null;
  let taken: Set<string> | null = null;

  for (const type of types) {
    for (const brand of brands) {
      const combination = { size: type.size, treadType: type.tread_type, brandName: brand.name };
      const name = tireMaterialName(combination);
      const active = type.is_active && brand.is_active;
      const material = linked.get(`${type.id}|${brand.id}`);

      if (material) {
        if (material.name !== name || material.is_active !== active) {
          await tx.materials.update({ where: { id: material.id }, data: { name, is_active: active } });
        }
        continue;
      }

      lookups ??= await ensureCategoryAndUnit(tx, companyId);
      taken ??= new Set(
        (await tx.materials.findMany({ where: { company_id: companyId }, select: { code: true } })).map((m) => m.code)
      );
      const code = tireMaterialCode(combination, taken);
      taken.add(code);
      const created = await tx.materials.create({
        data: {
          company_id: companyId,
          code,
          name,
          category_id: lookups.categoryId,
          unit_id: lookups.unitId,
          tracking_type: 'SERIAL',
          is_active: active,
        },
        select: { id: true },
      });
      await tx.tire_materials.create({
        data: { company_id: companyId, tire_type_id: type.id, tire_brand_id: brand.id, material_id: created.id },
      });
    }
  }
}

/** Material de una combinacion tipo + marca. Lo crea si falta (tipos o marcas sin sincronizar). */
export async function tireMaterialFor(tx: Tx, companyId: string, tireTypeId: string, brandId: string): Promise<string> {
  const find = () =>
    tx.tire_materials.findFirst({
      where: { company_id: companyId, tire_type_id: tireTypeId, tire_brand_id: brandId },
      select: { material_id: true },
    });
  const link = (await find()) ?? (await syncTireMaterials(tx, companyId), await find());
  if (!link) throw new StockError('NOT_FOUND', 'El tipo o la marca de la cubierta no son de la empresa');
  return link.material_id;
}
