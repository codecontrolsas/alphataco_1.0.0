/**
 * Borrado de los datos de negocio de la demo.
 *
 * La base de la demo tiene UNA sola empresa (lo exige `assertDemoDatabase`), asi que el
 * borrado es por tabla y no por `company_id`: se vacian todas las tablas del esquema salvo
 * las de la lista `KEEP` (permisos, empresa, usuarios y sus membresias, y lo que no es de
 * negocio). Una tabla nueva que agregue una migracion entra sola en el borrado.
 *
 * Se hace con `session_replication_role = replica`: sin triggers ni chequeos de FK, porque
 * los triggers de borrado escriben historial que se borraria igual. Antes se ponen en NULL
 * las referencias de las tablas que quedan hacia las que se vacian (ej. `profile.employee_id`),
 * para no dejar punteros colgados.
 */
import { withoutTriggers, type Tx } from './ctx.ts';

/** Tablas que el reset NO toca. */
const KEEP = new Set([
  '_prisma_migrations',
  // catalogo de permisos (lo mantiene seed-company)
  'actions',
  'modules',
  'tabs',
  'roles',
  'role_permissions',
  // empresa, usuarios y membresias
  'company',
  'profile',
  'auth_user',
  'auth_account',
  'auth_session',
  'auth_verification',
  'user_roles',
  'user_permissions',
  'share_company_users',
  'notification_settings',
  // la empresa apunta a estas (company.city / province_id)
  'provinces',
  'cities',
  // no es de negocio
  'external_api_clients',
  'external_api_access_logs',
  'support_ticket_views',
  'user_table_preferences',
  // control de módulos (F3): estado por instancia y empresa, su auditoría y la pertenencia de pestañas. Si se vaciaran,
  // la demo amanecería con todo apagado («sin fila = apagado»). `company_modules` apunta a `company`, que se conserva.
  'instance_modules',
  'company_modules',
  'module_change_log',
  'module_tab_owners',
  // auditoría de los controles de instancia (pausa, banners, límite de empresas): no es de negocio.
  'instance_change_log',
]);

interface FkRow {
  table_name: string;
  column_name: string;
  ref_table: string;
  is_nullable: string;
}

/**
 * Aborta si la base no es la de la demo: tiene que haber UNA sola empresa, con el id esperado y
 * con el nombre de la demo (o el que le pone seed-company antes del primer reset).
 */
export async function assertDemoDatabase(tx: Tx, companyId: string, allowedNames: string[]): Promise<void> {
  const companies = await tx.company.findMany({ select: { id: true, company_name: true } });
  if (companies.length !== 1 || companies[0].id !== companyId) {
    throw new Error(
      `La base no es una demo: se esperaba una sola empresa ${companyId} y hay ${companies.length}. No se borra nada.`
    );
  }
  if (!allowedNames.includes(companies[0].company_name)) {
    throw new Error(`La empresa se llama "${companies[0].company_name}", no es la demo. No se borra nada.`);
  }
}

export async function wipeBusinessData(tx: Tx, log: (m: string) => void): Promise<void> {
  const tables = await tx.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
  const wipe = tables.map((t) => t.table_name).filter((t) => !KEEP.has(t));

  // Referencias de tablas que quedan hacia tablas que se vacian.
  const fks = await tx.$queryRaw<FkRow[]>`
    SELECT kcu.table_name, kcu.column_name, ccu.table_name AS ref_table, c.is_nullable
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.columns c
      ON c.table_schema = kcu.table_schema AND c.table_name = kcu.table_name AND c.column_name = kcu.column_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`;
  for (const fk of fks) {
    if (!KEEP.has(fk.table_name) || KEEP.has(fk.ref_table)) continue;
    if (fk.is_nullable !== 'YES') {
      throw new Error(`${fk.table_name}.${fk.column_name} (NOT NULL) apunta a ${fk.ref_table}, que se vacia`);
    }
    await tx.$executeRawUnsafe(
      `UPDATE "${fk.table_name}" SET "${fk.column_name}" = NULL WHERE "${fk.column_name}" IS NOT NULL`
    );
  }

  await withoutTriggers(tx, async () => {
    for (const table of wipe) {
      await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
    }
  });
  log(`borradas ${wipe.length} tablas de negocio`);
}
