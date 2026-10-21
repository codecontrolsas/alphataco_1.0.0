/**
 * Empresa y catalogos: datos globales (paises, unidades, tipos de vehiculo), la estructura de
 * RRHH, los catalogos de equipos y los tipos de documento.
 *
 * Los tipos de documento van ANTES que empleados y vehiculos: los triggers de alta de cada
 * recurso generan sus documentos pendientes segun los tipos obligatorios que existan.
 */
import {
  APTITUDES,
  BRANDS,
  CATEGORIES,
  CITIES,
  COMPANY_PROFILE,
  CONTRACT_TYPES,
  COST_CENTERS,
  COUNTRIES,
  COVENANTS,
  DIAGRAM_TYPES,
  DOC_TYPES,
  EQUIPMENT_OWNERS,
  EQUIPMENT_TYPES,
  GUILDS,
  HIERARCHY,
  MEASURE_UNITS,
  OTHER_EQUIPMENT_TYPES,
  POSITIONS,
  PROVINCES,
  SUB_TYPES,
  TYPE_OPERATIVE,
  VEHICLE_KINDS,
  WORK_DIAGRAMS,
} from '../data/catalog.ts';
import { syncSequences, type Ctx } from '../lib/ctx.ts';
import { demoId } from '../lib/ids.ts';

export const NEUQUEN_PROVINCE = 2;
export const NEUQUEN_CITY = 2;

export function brandId(key: string): number {
  return BRANDS.findIndex((b) => b.key === key) + 1;
}

export function modelId(brandKey: string, modelKey: string): number {
  let id = 0;
  for (const brand of BRANDS) {
    for (const model of brand.models) {
      id++;
      if (brand.key === brandKey && model.key === modelKey) return id;
    }
  }
  throw new Error(`modelo desconocido ${brandKey}/${modelKey}`);
}

export function equipmentTypeId(key: string): string {
  const def = EQUIPMENT_TYPES.find((t) => t.key === key);
  if (def && 'id' in def) return def.id;
  return demoId('type', key);
}

export async function seedCatalogs(ctx: Ctx): Promise<void> {
  const { tx, company } = ctx;

  // ── Globales que conserva el reset (upsert) ─────────────────────────────────
  for (const p of PROVINCES) {
    await tx.provinces.upsert({
      where: { id: BigInt(p.id) },
      update: { name: p.name },
      create: { id: BigInt(p.id), name: p.name },
    });
  }
  for (const c of CITIES) {
    await tx.cities.upsert({
      where: { id: BigInt(c.id) },
      update: { name: c.name, province_id: BigInt(c.province) },
      create: { id: BigInt(c.id), name: c.name, province_id: BigInt(c.province) },
    });
  }
  await syncSequences(tx, ['provinces', 'cities']);

  await tx.company.update({
    where: { id: company.id },
    data: {
      company_name: COMPANY_PROFILE.name,
      company_cuit: COMPANY_PROFILE.cuit,
      description: COMPANY_PROFILE.description,
      contact_email: COMPANY_PROFILE.email,
      contact_phone: COMPANY_PROFILE.phone,
      address: COMPANY_PROFILE.address,
      industry: COMPANY_PROFILE.industry,
      website: COMPANY_PROFILE.website,
      country: 'Argentina',
      city: BigInt(NEUQUEN_CITY),
      province_id: BigInt(NEUQUEN_PROVINCE),
      is_active: true,
    },
  });

  // ── Globales que se recrean ─────────────────────────────────────────────────
  await tx.countries.createMany({ data: COUNTRIES.map((name) => ({ id: demoId('country', name), name })) });
  await tx.measure_units.createMany({ data: MEASURE_UNITS.map((u) => ({ ...u, company_id: company.id })) });
  await tx.types_of_vehicles.createMany({ data: VEHICLE_KINDS.map((k) => ({ id: BigInt(k.id), name: k.name })) });
  await tx.type_operative.createMany({
    data: TYPE_OPERATIVE.map((t) => ({ id: demoId('type_operative', t.key), name: t.name })),
  });
  await tx.industry_type.createMany({
    data: ['Petróleo y gas', 'Transporte', 'Construcción', 'Minería'].map((name, i) => ({ id: BigInt(i + 1), name })),
  });

  // ── RRHH ────────────────────────────────────────────────────────────────────
  const companyId = company.id;
  await tx.hierarchy.createMany({
    data: HIERARCHY.map((h) => ({ id: demoId('hierarchy', h.key), name: h.name, company_id: companyId })),
  });
  await tx.company_positions.createMany({
    data: POSITIONS.map((p) => ({
      id: demoId('position', p.key),
      name: p.name,
      is_active: true,
      hierarchical_position_id: p.hierarchy.map((h) => demoId('hierarchy', h)),
      company_id: companyId,
    })),
  });
  await tx.cost_center.createMany({
    data: COST_CENTERS.map((c) => ({ id: demoId('cost_center', c.key), name: c.name, company_id: companyId })),
  });
  await tx.guild.createMany({
    data: GUILDS.map((g) => ({ id: demoId('guild', g.key), name: g.name, company_id: companyId })),
  });
  await tx.covenant.createMany({
    data: COVENANTS.map((c) => ({
      id: demoId('covenant', c.key),
      name: c.name,
      guild_id: demoId('guild', c.guild),
      company_id: companyId,
    })),
  });
  await tx.category.createMany({
    data: CATEGORIES.map((c) => ({
      id: demoId('category', c.key),
      name: c.name,
      covenant_id: demoId('covenant', c.covenant),
    })),
  });
  await tx.types_of_contract.createMany({
    data: CONTRACT_TYPES.map((c) => ({ id: demoId('contract_type', c.key), name: c.name, company_id: companyId })),
  });
  await tx.diagram_type.createMany({
    data: DIAGRAM_TYPES.map((d) => ({
      id: demoId('diagram_type', d.key),
      name: d.name,
      short_description: d.short,
      color: d.color,
      work_active: d.work,
      computes_absenteeism: d.absent,
      company_id: companyId,
    })),
  });
  await tx.work_diagram.createMany({
    data: WORK_DIAGRAMS.map((w) => ({
      id: demoId('work_diagram', w.key),
      name: w.name,
      active_working_days: w.on,
      inactive_working_days: w.off,
      inactive_novelty: demoId('diagram_type', 'franco'),
      company_id: companyId,
    })),
  });
  await tx.work_diagram_active_novelties.createMany({
    data: WORK_DIAGRAMS.map((w) => ({
      work_diagram_id: demoId('work_diagram', w.key),
      diagram_type_id: demoId('diagram_type', 'trabajando'),
      company_id: companyId,
    })),
  });
  await tx.aptitudes_tecnicas.createMany({
    data: APTITUDES.map((a) => ({ id: demoId('aptitud', a.key), nombre: a.name, company_id: companyId })),
  });
  await tx.aptitudes_tecnicas_puestos.createMany({
    data: APTITUDES.flatMap((a) =>
      a.positions.map((p) => ({ aptitud_id: demoId('aptitud', a.key), puesto_id: demoId('position', p) }))
    ),
  });

  // ── Equipos ─────────────────────────────────────────────────────────────────
  await tx.brand_vehicles.createMany({
    data: BRANDS.map((b) => ({ id: brandId(b.key), name: b.name, company_id: companyId })),
  });
  await tx.model_vehicles.createMany({
    data: BRANDS.flatMap((b) =>
      b.models.map((m) => ({ id: modelId(b.key, m.key), name: m.name, brand: brandId(b.key), company_id: companyId }))
    ),
  });
  await syncSequences(tx, ['measure_units', 'types_of_vehicles', 'industry_type', 'brand_vehicles', 'model_vehicles']);

  await tx.type.createMany({
    data: [
      ...EQUIPMENT_TYPES.map((t) => ({
        id: equipmentTypeId(t.key),
        name: t.name,
        company_id: companyId,
        has_hitch: t.hitch,
        is_tractor_unit: t.tractor,
        is_operative: t.operative,
        applies_to: 'vehicle',
        generates_qr: true,
      })),
      ...OTHER_EQUIPMENT_TYPES.map((t) => ({
        id: demoId('type', t.key),
        name: t.name,
        company_id: companyId,
        applies_to: 'other_equipment',
        generates_qr: true,
      })),
    ],
  });
  await tx.type_hitch_types.createMany({
    data: [
      {
        type_id: equipmentTypeId('tractor'),
        compatible_type_id: equipmentTypeId('semirremolque'),
        company_id: companyId,
      },
    ],
  });
  await tx.sub_type.createMany({
    data: SUB_TYPES.map((s) => ({
      id: demoId('sub_type', s.key),
      name: s.name,
      type: equipmentTypeId(s.type),
      company_id: companyId,
    })),
  });
  await tx.equipment_owners.createMany({
    data: EQUIPMENT_OWNERS.map((o) => ({
      id: demoId('owner', o.key),
      name: o.name,
      cuit: o.cuit,
      contract_type: o.type,
      company_id: companyId,
    })),
  });
  await tx.equipment_owner_contract_types.createMany({
    data: EQUIPMENT_OWNERS.map((o) => ({ equipment_owner_id: demoId('owner', o.key), contract_type: o.type })),
  });

  // ── Tipos de documento ──────────────────────────────────────────────────────
  await tx.document_types.createMany({
    data: DOC_TYPES.map((d) => ({
      id: demoId('doc_type', d.key),
      name: d.name,
      applies: d.applies,
      multiresource: false,
      mandatory: d.mandatory,
      explired: d.expires,
      special: false,
      is_active: true,
      description: d.description,
      company_id: companyId,
      is_it_montlhy: d.monthly ?? false,
      private: d.private ?? false,
      down_document: false,
      has_policy_number: d.policy ?? false,
      available_for_pre_file: d.preFile ?? false,
    })),
  });

  ctx.log('catalogos listos');
}
