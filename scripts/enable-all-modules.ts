/**
 * Enciende TODOS los módulos (F3) en la instancia y borra los apagados por empresa. Antes sincroniza la pertenencia
 * pestaña → clave, así el resultado no depende de en qué orden corrieron el seed y el sync.
 *
 * Para dev, CI y e2e: una base recién migrada no tiene filas de estado y «sin fila = apagado», así que sin esto el
 * sidebar queda vacío y las suites que usan permisos se ponen rojas. Es idempotente.
 *
 * NO es para la instancia de un cliente (lo contratado se enciende por la API de administración): con
 * NODE_ENV=production se rechaza salvo `--allow-production`. El reset de la demo NO usa este CLI: llama a la librería
 * dentro de su propia transacción.
 *
 * Uso: node scripts/enable-all-modules.ts [--allow-production]
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { prismaPgConfig } from '../src/shared/lib/prisma-pg-config.ts';
import { enableAllModulesTx, moduleControlDatabaseUrl, syncModuleCatalogTx } from './lib/module-control.ts';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--allow-production')) {
    throw new Error(
      'NODE_ENV=production: este script enciende todo y es para dev, CI y e2e. Usar la API de administración, o --allow-production.'
    );
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg(prismaPgConfig(moduleControlDatabaseUrl())) });
  try {
    const { sync, enabled } = await prisma.$transaction(
      async (tx) => ({
        sync: await syncModuleCatalogTx(tx),
        enabled: await enableAllModulesTx(tx, {
          actor: 'script:enable-all-modules',
          reason: 'Todos los módulos encendidos para desarrollo, CI o e2e',
        }),
      }),
      { timeout: 60_000 }
    );
    console.log(
      `Módulos OK - encendidos: ${enabled.changed} | apagados por empresa borrados: ${enabled.companyRowsRemoved} | pestañas con dueño: ${sync.tabsOwned}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Error en enable-all-modules:', error);
  process.exit(1);
});
