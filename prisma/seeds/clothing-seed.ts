/**
 * Seed script for the Clothing/EPP module.
 * Run with: npx tsx prisma/seeds/clothing-seed.ts
 *
 * Idempotent: uses upsert / skipDuplicates so it can run multiple times safely.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { PrismaClient } from '../../src/generated/prisma/client';
import { clothing_delivery_type } from '../../src/generated/prisma/enums';
import { prismaPgConfig } from '../../src/shared/lib/prisma-pg-config';

// ---------------------------------------------------------------------------
// Client setup (standalone — not the Next.js singleton)
// ---------------------------------------------------------------------------
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined in the environment variables');
  }
  const adapter = new PrismaPg(prismaPgConfig(connectionString));
  return new PrismaClient({ adapter });
}

const prisma = createClient();

// ---------------------------------------------------------------------------
// Seed data definitions
// ---------------------------------------------------------------------------

const BRAND_NAMES = [
  'Ombu',
  'Pampero',
  'Grafa',
  '3M',
  'MSA',
  'Ansell',
  'Funcional',
  'DuPont',
  'Seguridad Total',
  'Redline',
];

const SIZE_NAMES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '36', '38', '40', '42', '44', '46', 'Único'];

const ITEMS_DATA = [
  { name: 'Camisa de trabajo', code: 'CAM-001' },
  { name: 'Pantalón de trabajo', code: 'PAN-001' },
  { name: 'Botín de seguridad', code: 'BOT-001' },
  { name: 'Casco de seguridad', code: 'CAS-001' },
  { name: 'Guantes de seguridad', code: 'GUA-001' },
  { name: 'Chaleco reflectivo', code: 'CHA-001' },
  { name: 'Protector auditivo', code: 'PRO-001' },
  { name: 'Lentes de seguridad', code: 'LEN-001' },
  { name: 'Mameluco', code: 'MAM-001' },
  { name: 'Campera de trabajo', code: 'CAMP-001' },
  { name: 'Zapato de seguridad', code: 'ZAP-001' },
  { name: 'Arnés de seguridad', code: 'ARN-001' },
];

// Item → [ { brand, sizes[] } ] combinations
const ITEM_BRAND_SIZE_CONFIG: Record<string, { brand: string; sizes: string[] }[]> = {
  'Camisa de trabajo': [
    { brand: 'Ombu', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
    { brand: 'Pampero', sizes: ['38', '40', '42', '44', '46'] },
    { brand: 'Grafa', sizes: ['S', 'M', 'L', 'XL'] },
  ],
  'Pantalón de trabajo': [
    { brand: 'Ombu', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
    { brand: 'Grafa', sizes: ['38', '40', '42', '44', '46'] },
  ],
  'Botín de seguridad': [
    { brand: 'Funcional', sizes: ['36', '38', '40', '42', '44', '46'] },
    { brand: 'Redline', sizes: ['36', '38', '40', '42', '44'] },
  ],
  'Casco de seguridad': [
    { brand: '3M', sizes: ['Único'] },
    { brand: 'MSA', sizes: ['Único'] },
  ],
  'Guantes de seguridad': [
    { brand: 'Ansell', sizes: ['S', 'M', 'L', 'XL'] },
    { brand: 'DuPont', sizes: ['M', 'L', 'XL'] },
  ],
  'Chaleco reflectivo': [{ brand: 'Seguridad Total', sizes: ['S', 'M', 'L', 'XL', 'XXL'] }],
  'Protector auditivo': [{ brand: '3M', sizes: ['Único'] }],
  'Lentes de seguridad': [
    { brand: '3M', sizes: ['Único'] },
    { brand: 'MSA', sizes: ['Único'] },
  ],
  Mameluco: [
    { brand: 'Grafa', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
    { brand: 'Ombu', sizes: ['38', '40', '42', '44', '46'] },
  ],
  'Campera de trabajo': [
    { brand: 'Pampero', sizes: ['S', 'M', 'L', 'XL'] },
    { brand: 'Ombu', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  ],
  'Zapato de seguridad': [{ brand: 'Funcional', sizes: ['36', '38', '40', '42', '44', '46'] }],
  'Arnés de seguridad': [
    { brand: 'DuPont', sizes: ['Único'] },
    { brand: 'MSA', sizes: ['Único'] },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a Date N days ago from now */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main() {
  console.log('========================================');
  console.log('  Clothing/EPP Module — Seed Script');
  console.log('========================================\n');

  // ── 1. Find the best active company (prefer the one with most employees) ──
  console.log('1. Looking for an active company...');

  // Pick the company with the most employees (most likely the real production company)
  const companiesWithCounts = await prisma.company.findMany({
    where: { is_active: true },
    select: {
      id: true,
      company_name: true,
      _count: { select: { employees: true } },
    },
  });

  if (companiesWithCounts.length === 0) {
    throw new Error('No active company found. Cannot proceed with seed.');
  }

  // Sort by employee count descending, pick first
  companiesWithCounts.sort((a, b) => b._count.employees - a._count.employees);
  const company = companiesWithCounts[0];

  if (!company) {
    throw new Error('No active company found. Cannot proceed with seed.');
  }
  console.log(`   Found: "${company.company_name}" (${company.id}) — ${company._count.employees} employees\n`);

  const companyId = company.id;

  // ── 2. Find active employees from that company ─────────────────────────────
  // NOTE: la empresa de un empleado es employees.company_id.
  console.log('2. Looking for active employees...');
  let employees = await prisma.employees.findMany({
    where: {
      company_id: companyId,
      is_active: true,
    },
    select: { id: true, firstname: true, lastname: true, file: true },
    take: 3,
    orderBy: { date_of_admission: 'asc' },
  });

  // Fallback: si no hay activos, tomar empleados de la empresa sin filtrar por is_active.
  // (La pivote companies_employees ya no se escribe ni se lee: la empresa es employees.company_id.)
  if (employees.length === 0) {
    employees = await prisma.employees.findMany({
      where: { company_id: companyId },
      select: { id: true, firstname: true, lastname: true, file: true },
      take: 3,
      orderBy: { date_of_admission: 'asc' },
    });
  }

  console.log(`   Found ${employees.length} employee(s).`);
  employees.forEach((e) => console.log(`   - [${e.file ?? '?'}] ${e.lastname} ${e.firstname}`));
  console.log();

  const canSeedDeliveries = employees.length >= 2;
  if (!canSeedDeliveries) {
    console.log('   WARNING: Need at least 2 employees to seed deliveries. Skipping delivery seed.\n');
  }

  // ── 3. Seed Brands ─────────────────────────────────────────────────────────
  console.log('3. Seeding clothing brands...');
  const brandMap = new Map<string, string>(); // name → id

  for (const name of BRAND_NAMES) {
    const brand = await prisma.clothing_brands.upsert({
      where: { name_company_id: { name, company_id: companyId } },
      create: { name, company_id: companyId, is_active: true },
      update: { is_active: true },
      select: { id: true, name: true },
    });
    brandMap.set(brand.name, brand.id);
  }
  console.log(`   Upserted ${brandMap.size} brands.\n`);

  // ── 4. Seed Sizes ──────────────────────────────────────────────────────────
  console.log('4. Seeding clothing sizes...');
  const sizeMap = new Map<string, string>(); // name → id

  for (const name of SIZE_NAMES) {
    const size = await prisma.clothing_sizes.upsert({
      where: { name_company_id: { name, company_id: companyId } },
      create: { name, company_id: companyId, is_active: true },
      update: { is_active: true },
      select: { id: true, name: true },
    });
    sizeMap.set(size.name, size.id);
  }
  console.log(`   Upserted ${sizeMap.size} sizes.\n`);

  // ── 5. Seed Items ──────────────────────────────────────────────────────────
  console.log('5. Seeding clothing items...');
  const itemMap = new Map<string, string>(); // name → id

  for (const item of ITEMS_DATA) {
    const created = await prisma.clothing_items.upsert({
      where: { name_company_id: { name: item.name, company_id: companyId } },
      create: {
        name: item.name,
        code: item.code,
        company_id: companyId,
        is_active: true,
      },
      update: { code: item.code, is_active: true },
      select: { id: true, name: true },
    });
    itemMap.set(created.name, created.id);
  }
  console.log(`   Upserted ${itemMap.size} items.\n`);

  // ── 6. Seed Item-Brand-Size combinations ───────────────────────────────────
  console.log('6. Seeding item-brand-size combinations...');
  let ibsCount = 0;

  for (const [itemName, brandSizes] of Object.entries(ITEM_BRAND_SIZE_CONFIG)) {
    const itemId = itemMap.get(itemName);
    if (!itemId) {
      console.log(`   WARNING: Item "${itemName}" not found in itemMap, skipping.`);
      continue;
    }

    for (const { brand: brandName, sizes } of brandSizes) {
      const brandId = brandMap.get(brandName);
      if (!brandId) {
        console.log(`   WARNING: Brand "${brandName}" not found in brandMap, skipping.`);
        continue;
      }

      for (const sizeName of sizes) {
        const sizeId = sizeMap.get(sizeName);
        if (!sizeId) {
          console.log(`   WARNING: Size "${sizeName}" not found in sizeMap, skipping.`);
          continue;
        }

        // Use createMany with skipDuplicates leveraging the unique constraint
        await prisma.clothing_item_brand_sizes.createMany({
          data: [{ clothing_item_id: itemId, clothing_brand_id: brandId, clothing_size_id: sizeId }],
          skipDuplicates: true,
        });
        ibsCount++;
      }
    }
  }
  console.log(`   Created/skipped ${ibsCount} item-brand-size combinations.\n`);

  // ── 7. Seed Deliveries ─────────────────────────────────────────────────────
  if (!canSeedDeliveries) {
    console.log('7. Skipping deliveries (not enough employees).\n');
  } else {
    console.log('7. Seeding clothing deliveries...');

    const [emp1, emp2, emp3] = employees;
    const deliveredBy = emp2; // Employee 2 acts as the person who delivers

    // Helper to get item/brand/size IDs safely
    const itemId = (name: string) => itemMap.get(name)!;
    const brandId = (name: string) => brandMap.get(name)!;
    const sizeId = (name: string) => sizeMap.get(name)!;

    // Define 9 deliveries with varied data
    const deliveryDefs = [
      {
        employee_id: emp1.id,
        delivered_by_id: deliveredBy.id,
        delivery_type: clothing_delivery_type.PLANNED_CCT,
        delivered_at: daysAgo(85),
        notes: 'Entrega inicial de uniformes CCT para ingreso.',
        items: [
          { item: 'Camisa de trabajo', brand: 'Ombu', size: 'L', quantity: 2 },
          { item: 'Pantalón de trabajo', brand: 'Ombu', size: 'L', quantity: 2 },
          { item: 'Botín de seguridad', brand: 'Funcional', size: '42', quantity: 1 },
        ],
      },
      {
        employee_id: emp1.id,
        delivered_by_id: deliveredBy.id,
        delivery_type: clothing_delivery_type.PLANNED_EPP,
        delivered_at: daysAgo(80),
        notes: 'Dotación de EPP obligatorio.',
        items: [
          { item: 'Casco de seguridad', brand: '3M', size: 'Único', quantity: 1 },
          { item: 'Guantes de seguridad', brand: 'Ansell', size: 'L', quantity: 2 },
          { item: 'Lentes de seguridad', brand: '3M', size: 'Único', quantity: 1 },
          { item: 'Protector auditivo', brand: '3M', size: 'Único', quantity: 2 },
        ],
      },
      {
        employee_id: emp2.id,
        delivered_by_id: deliveredBy.id,
        delivery_type: clothing_delivery_type.PLANNED_CCT,
        delivered_at: daysAgo(70),
        notes: null,
        items: [
          { item: 'Camisa de trabajo', brand: 'Grafa', size: 'XL', quantity: 2 },
          { item: 'Pantalón de trabajo', brand: 'Grafa', size: '44', quantity: 2 },
          { item: 'Mameluco', brand: 'Grafa', size: 'XL', quantity: 1 },
        ],
      },
      {
        employee_id: emp2.id,
        delivered_by_id: deliveredBy.id,
        delivery_type: clothing_delivery_type.REPLACEMENT,
        delivered_at: daysAgo(50),
        notes: 'Reposición por desgaste de botas en campo.',
        items: [{ item: 'Botín de seguridad', brand: 'Redline', size: '44', quantity: 1 }],
      },
      {
        employee_id: emp1.id,
        delivered_by_id: deliveredBy.id,
        delivery_type: clothing_delivery_type.REPLACEMENT,
        delivered_at: daysAgo(45),
        notes: 'Reposición de guantes por rotura.',
        items: [
          { item: 'Guantes de seguridad', brand: 'DuPont', size: 'L', quantity: 2 },
          { item: 'Chaleco reflectivo', brand: 'Seguridad Total', size: 'L', quantity: 1 },
        ],
      },
      {
        employee_id: emp3 ? emp3.id : emp1.id,
        delivered_by_id: deliveredBy.id,
        delivery_type: clothing_delivery_type.PLANNED_CCT,
        delivered_at: daysAgo(35),
        notes: null,
        items: [
          { item: 'Camisa de trabajo', brand: 'Pampero', size: '40', quantity: 3 },
          { item: 'Pantalón de trabajo', brand: 'Ombu', size: 'M', quantity: 3 },
          { item: 'Campera de trabajo', brand: 'Pampero', size: 'M', quantity: 1 },
        ],
      },
      {
        employee_id: emp3 ? emp3.id : emp2.id,
        delivered_by_id: deliveredBy.id,
        delivery_type: clothing_delivery_type.PLANNED_EPP,
        delivered_at: daysAgo(28),
        notes: 'Dotación completa de EPP para sector campo.',
        items: [
          { item: 'Casco de seguridad', brand: 'MSA', size: 'Único', quantity: 1 },
          { item: 'Arnés de seguridad', brand: 'MSA', size: 'Único', quantity: 1 },
          { item: 'Lentes de seguridad', brand: 'MSA', size: 'Único', quantity: 1 },
        ],
      },
      {
        employee_id: emp1.id,
        delivered_by_id: deliveredBy.id,
        delivery_type: clothing_delivery_type.PLANNED_CCT,
        delivered_at: daysAgo(14),
        notes: null,
        items: [
          { item: 'Mameluco', brand: 'Ombu', size: '40', quantity: 2 },
          { item: 'Zapato de seguridad', brand: 'Funcional', size: '42', quantity: 1 },
        ],
      },
      {
        employee_id: emp2.id,
        delivered_by_id: deliveredBy.id,
        delivery_type: clothing_delivery_type.REPLACEMENT,
        delivered_at: daysAgo(5),
        notes: 'Reposición urgente de arnés por vencimiento de certificación.',
        items: [
          { item: 'Arnés de seguridad', brand: 'DuPont', size: 'Único', quantity: 1 },
          { item: 'Chaleco reflectivo', brand: 'Seguridad Total', size: 'XL', quantity: 1 },
        ],
      },
    ];

    let deliveryCount = 0;

    for (const def of deliveryDefs) {
      await prisma.$transaction(async (tx) => {
        const delivery = await tx.clothing_deliveries.create({
          data: {
            employee_id: def.employee_id,
            delivered_by_id: def.delivered_by_id,
            delivery_type: def.delivery_type,
            delivered_at: def.delivered_at,
            notes: def.notes,
            company_id: companyId,
          },
          select: { id: true },
        });

        await tx.clothing_delivery_items.createMany({
          data: def.items.map((i) => ({
            clothing_delivery_id: delivery.id,
            clothing_item_id: itemId(i.item),
            clothing_brand_id: brandId(i.brand),
            clothing_size_id: sizeId(i.size),
            quantity: i.quantity,
          })),
        });

        deliveryCount++;
        console.log(
          `   [${deliveryCount}] ${def.delivery_type} — employee ${def.employee_id.slice(0, 8)}... — ${def.items.length} item(s)`
        );
      });
    }

    console.log(`\n   Created ${deliveryCount} deliveries.\n`);
  }

  // ── 8. Summary ─────────────────────────────────────────────────────────────
  console.log('========================================');
  console.log('  Seed completed successfully!');
  console.log('========================================');
  console.log(`  Brands:    ${brandMap.size}`);
  console.log(`  Sizes:     ${sizeMap.size}`);
  console.log(`  Items:     ${itemMap.size}`);
  console.log(`  Deliveries: ${canSeedDeliveries ? 9 : 0}`);
  console.log('========================================\n');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
