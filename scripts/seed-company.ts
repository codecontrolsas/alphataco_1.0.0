/**
 * Seed idempotente de una empresa: crea/actualiza `company` y el catalogo GLOBAL
 * de permisos (`modules`, `tabs`, `actions`, los 3 roles de sistema y sus
 * `role_permissions`) a partir de src/features/Permissions/permissions-map.ts,
 * mas el rol `User` (default de `profile.role`, FK a `roles.name`) sin permisos.
 *
 * `modules`/`tabs`/`actions`/`roles`/`role_permissions` NO tienen `company_id`
 * en el schema (prisma/schema.prisma) — son catalogo global del sistema, no por
 * empresa. Por eso este seed los upsertea siempre igual, sin importar --name/--id.
 *
 * `company` SI requiere varias columnas NOT NULL que este CLI no recibe
 * (description, contact_email, contact_phone, address, city (FK a `cities`,
 * a su vez FK a `provinces`), country, industry, company_cuit unique). Se
 * completan con placeholders deterministicos documentados en el reporte de la
 * tarea — no son datos de negocio reales, son necesarios solo para que la fila
 * exista en el entorno local.
 *
 * Uso: node scripts/seed-company.ts --name "Empresa Demo" [--id <uuid>]
 * Requiere DATABASE_URL=postgresql://... en el entorno.
 */
import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { ACTIONS, PERMISSIONS } from '../src/features/Permissions/permissions-map.ts';
import { DEFAULT_MEASUREMENT_UNITS } from '../src/features/Warehouses/lib/default-units.ts';
import { buildPermissionRows, SYSTEM_ROLE_SLUGS } from './seed/permission-rows.ts';

/** Namespace fijo para derivar UUIDs v5 deterministicos en este seed. No cambiar entre corridas. */
const SEED_NAMESPACE = 'b6f5a6b0-6b42-4f7e-9a9d-2b8a9d9c9c10';

const SYSTEM_ROLE_NAMES: Record<(typeof SYSTEM_ROLE_SLUGS)[number], string> = {
  admin: 'Admin',
  administrador: 'Administrador',
  'full-access-provisional': 'Full Access Provisional',
};

/**
 * Rol por defecto de `profile.role` (`String? @default("User")`, FK a `roles.name`).
 * Sin el, cualquier alta de perfil que no fije `role` falla por FK. No es uno de
 * los 3 roles de acceso total: no recibe `role_permissions`.
 */
const DEFAULT_PROFILE_ROLE = { name: 'User', slug: 'user' } as const;

/** UUID v5 (RFC 4122) via crypto.createHash('sha1') — sin dependencias externas. */
function uuidV5(name: string, namespace: string): string {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(name, 'utf8');
  const hash = createHash('sha1')
    .update(Buffer.concat([namespaceBytes, nameBytes]))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC 4122
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return slug || 'empresa';
}

function parseArgs(argv: string[]): { name: string; id?: string } {
  let name: string | undefined;
  let id: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--name') {
      name = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--id') {
      id = argv[i + 1];
      i += 1;
    }
  }
  if (!name) {
    throw new Error('Falta --name "<nombre de la empresa>" (obligatorio)');
  }
  return { name, id };
}

async function main(): Promise<void> {
  const { name, id: idArg } = parseArgs(process.argv.slice(2));
  const companyId = idArg ?? uuidV5(name, SEED_NAMESPACE);
  const slug = slugify(name);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no esta definida en las variables de entorno');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    // 1. Ubicacion placeholder — company.city es NOT NULL y este CLI no recibe direccion real.
    const province = await prisma.provinces.upsert({
      where: { id: BigInt(1) },
      update: {},
      create: { id: BigInt(1), name: 'Sin especificar' },
    });
    const city = await prisma.cities.upsert({
      where: { id: BigInt(1) },
      update: {},
      create: { id: BigInt(1), name: 'Sin especificar', province_id: province.id },
    });

    // 2. Company — placeholders deterministicos para las columnas NOT NULL que
    //    el CLI no recibe (ver comentario del encabezado).
    const company = await prisma.company.upsert({
      where: { id: companyId },
      update: { company_name: name },
      create: {
        id: companyId,
        company_name: name,
        description: `Empresa creada por seed (${name})`,
        contact_email: `contacto@${slug}.local`,
        contact_phone: '0000000000',
        address: 'Sin especificar',
        city: city.id,
        country: 'Argentina',
        industry: 'Sin especificar',
        company_cuit: `SEED-${companyId.slice(0, 8)}`,
      },
    });

    // 2b. Destinatarios de los correos automaticos (P5), POR EMPRESA. Sin fila el job
    //     registra la empresa como salteada y no manda nada. El default es el correo de
    //     contacto de la propia empresa: es el unico destinatario que el modelo conoce, y
    //     deliberadamente NO hay fallback por variable de entorno (una lista global
    //     recibiria los datos de todas las empresas). `update: {}` para no pisar una lista
    //     que alguien ya haya editado.
    for (const kind of ['documents_expiry', 'daily_report_deviations', 'stock_batch_expiry'] as const) {
      await prisma.notification_settings.upsert({
        where: { company_id_kind: { company_id: company.id, kind } },
        update: {},
        create: { company_id: company.id, kind, recipients: [company.contact_email] },
      });
    }

    // 2c. Unidades de medida de Almacenes, POR EMPRESA. `update: {}` para no pisar una
    //     unidad que la empresa ya haya renombrado o desactivado.
    for (const unit of DEFAULT_MEASUREMENT_UNITS) {
      await prisma.measurement_units.upsert({
        where: { company_id_abbreviation: { company_id: company.id, abbreviation: unit.abbreviation } },
        update: {},
        create: { company_id: company.id, name: unit.name, abbreviation: unit.abbreviation },
      });
    }

    // 3. Catalogo de permisos — GLOBAL, no depende de la empresa creada arriba.
    const actionNames = Object.fromEntries(Object.values(ACTIONS).map((a) => [a.slug, a.name]));
    const { modules, tabs, actions, rolePermissions } = buildPermissionRows(PERMISSIONS, actionNames);

    for (const moduleRow of modules) {
      await prisma.modules.upsert({
        where: { id: moduleRow.id },
        update: { name: moduleRow.name, slug: moduleRow.slug },
        create: {
          id: moduleRow.id,
          name: moduleRow.name,
          slug: moduleRow.slug,
          price: 0,
          description: moduleRow.name,
        },
      });
    }

    // Secuencial (no Promise.all): los tabs padre deben existir antes que sus
    // subtabs por la FK parent_tab_id. buildPermissionRows ya emite el array
    // en orden padre-antes-que-hijo (recorrido en profundidad).
    for (const tabRow of tabs) {
      await prisma.tabs.upsert({
        where: { id: tabRow.id },
        update: {
          module_id: tabRow.moduleId,
          parent_tab_id: tabRow.parentTabId,
          slug: tabRow.slug,
          name: tabRow.name,
          order_index: tabRow.orderIndex,
        },
        create: {
          id: tabRow.id,
          module_id: tabRow.moduleId,
          parent_tab_id: tabRow.parentTabId,
          slug: tabRow.slug,
          name: tabRow.name,
          order_index: tabRow.orderIndex,
        },
      });
    }

    const actionIdBySlug = new Map<string, string>();
    for (const actionRow of actions) {
      const upserted = await prisma.actions.upsert({
        where: { slug: actionRow.slug },
        update: { name: actionRow.name },
        create: { slug: actionRow.slug, name: actionRow.name },
      });
      actionIdBySlug.set(actionRow.slug, upserted.id);
    }

    const roleIdBySlug = new Map<string, bigint>();
    for (const roleSlug of SYSTEM_ROLE_SLUGS) {
      const upserted = await prisma.roles.upsert({
        where: { slug: roleSlug },
        update: { is_system: true, is_active: true },
        create: {
          name: SYSTEM_ROLE_NAMES[roleSlug],
          slug: roleSlug,
          is_system: true,
          is_active: true,
        },
      });
      roleIdBySlug.set(roleSlug, upserted.id);
    }

    // Se upsertea por `name` (la clave que usa la FK de profile.role), no por slug.
    await prisma.roles.upsert({
      where: { name: DEFAULT_PROFILE_ROLE.name },
      update: { is_system: true, is_active: true },
      create: {
        name: DEFAULT_PROFILE_ROLE.name,
        slug: DEFAULT_PROFILE_ROLE.slug,
        is_system: true,
        is_active: true,
      },
    });

    let rolePermissionCount = 0;
    for (const rp of rolePermissions) {
      const roleId = roleIdBySlug.get(rp.roleSlug);
      const actionId = actionIdBySlug.get(rp.actionSlug);
      if (roleId === undefined || actionId === undefined) continue;
      await prisma.role_permissions.upsert({
        where: {
          role_id_tab_id_action_id: { role_id: roleId, tab_id: rp.tabId, action_id: actionId },
        },
        update: {},
        create: { role_id: roleId, tab_id: rp.tabId, action_id: actionId },
      });
      rolePermissionCount += 1;
    }

    console.log(
      `Seed OK - company: ${company.company_name} (${company.id}) | modules: ${modules.length} | tabs: ${tabs.length} | actions: ${actions.length} | roles: ${roleIdBySlug.size + 1} | role_permissions: ${rolePermissionCount}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Error en seed-company:', error);
  process.exit(1);
});
