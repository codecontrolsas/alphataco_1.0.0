/**
 * Sincroniza `module_tab_owners` (pertenencia pestaña → clave del catálogo de módulos, F3) con el código.
 *
 * Lo corre el entrypoint del contenedor en CADA arranque, justo después de `prisma migrate deploy`: si falla, el
 * arranque se corta (`set -e`) y el deploy no queda sano con una pertenencia vieja. También lo llaman el seed de
 * empresa (al final) y la preparación de los tests de integración. Idempotente y tolerante a una base sin pestañas.
 *
 * Uso: node scripts/sync-module-catalog.ts
 * Conecta con SYSTEM_DATABASE_URL (o MIGRATE_DATABASE_URL, o DATABASE_URL): nunca con el rol de la app.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { prismaPgConfig } from '../src/shared/lib/prisma-pg-config.ts';
import { moduleControlDatabaseUrl, syncModuleCatalog } from './lib/module-control.ts';

async function main(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg(prismaPgConfig(moduleControlDatabaseUrl())) });
  try {
    const result = await syncModuleCatalog(prisma);
    console.log(
      `Sync de módulos OK - pestañas con dueño: ${result.tabsOwned} | filas: ${result.rows} | sin dueño: ${result.tabsMissingOwner}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Error en sync-module-catalog:', error);
  process.exit(1);
});
