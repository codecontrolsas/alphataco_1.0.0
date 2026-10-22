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
import { PrismaPg } from '@prisma/adapter-pg';
import { NOTIFICATION_EVENTS, NOTIFICATION_EVENT_KEYS } from '../src/features/Notifications/notification-catalog.ts';
import { ACTION_DESCRIPTIONS, TAB_DESCRIPTIONS } from '../src/features/Permissions/permission-catalog.ts';
import { ACTIONS, PERMISSIONS } from '../src/features/Permissions/permissions-map.ts';
import { DEFAULT_MEASUREMENT_UNITS } from '../src/features/Warehouses/lib/default-units.ts';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { prismaPgConfig } from '../src/shared/lib/prisma-pg-config.ts';
import { uuidV5 } from './lib/uuid-v5.ts';
import { SYSTEM_ROLE_SLUGS, buildPermissionRows } from './seed/permission-rows.ts';

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

  const connectionString = process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no esta definida en las variables de entorno');
  }

  const adapter = new PrismaPg(prismaPgConfig(connectionString));
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
    const { modules, tabs, actions, rolePermissions } = buildPermissionRows(PERMISSIONS, actionNames, {
      tabs: TAB_DESCRIPTIONS,
      actions: ACTION_DESCRIPTIONS,
    });

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
          ...(tabRow.description ? { description: tabRow.description } : {}),
        },
        create: {
          id: tabRow.id,
          module_id: tabRow.moduleId,
          parent_tab_id: tabRow.parentTabId,
          slug: tabRow.slug,
          name: tabRow.name,
          order_index: tabRow.orderIndex,
          description: tabRow.description ?? null,
        },
      });
    }

    const actionIdBySlug = new Map<string, string>();
    for (const actionRow of actions) {
      const upserted = await prisma.actions.upsert({
        where: { slug: actionRow.slug },
        update: { name: actionRow.name, ...(actionRow.description ? { description: actionRow.description } : {}) },
        create: { slug: actionRow.slug, name: actionRow.name, description: actionRow.description ?? null },
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
    const defaultProfileRole = await prisma.roles.upsert({
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

    // Avisos por defecto (#786), los mismos que carga la migración 20261024110000_role_notifications: en una
    // base nueva esa migración corre antes de que existan los roles. Solo si el rol no tiene NINGUNO, así
    // volver a correr el seed no reactiva lo que un admin apagó.
    const personalEvents = NOTIFICATION_EVENT_KEYS.filter((key) => NOTIFICATION_EVENTS[key].audience === 'actor');
    const defaultsByRole: [bigint, readonly string[]][] = [
      ...[...roleIdBySlug.values()].map((roleId): [bigint, readonly string[]] => [roleId, NOTIFICATION_EVENT_KEYS]),
      [defaultProfileRole.id, personalEvents],
    ];
    let roleNotificationCount = 0;
    for (const [roleId, events] of defaultsByRole) {
      if ((await prisma.role_notifications.count({ where: { role_id: roleId } })) > 0) continue;
      const rows = events.flatMap((eventKey) => {
        const def = NOTIFICATION_EVENTS[eventKey as keyof typeof NOTIFICATION_EVENTS];
        return def.defaultChannels.map((channel) => ({ role_id: roleId, event_key: eventKey, channel }));
      });
      const created = await prisma.role_notifications.createMany({ data: rows, skipDuplicates: true });
      roleNotificationCount += created.count;
    }

    console.log(
      `Seed OK - company: ${company.company_name} (${company.id}) | modules: ${modules.length} | tabs: ${tabs.length} | actions: ${actions.length} | roles: ${roleIdBySlug.size + 1} | role_permissions: ${rolePermissionCount} | role_notifications: ${roleNotificationCount}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Error en seed-company:', error);
  process.exit(1);
});
