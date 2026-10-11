import { describe, expect, it } from 'vitest';

const RUN = Boolean(process.env.DATABASE_URL);

/**
 * El adaptador de Prisma para Postgres asume una sesión en UTC: al leer un `timestamptz` reemplaza el
 * offset por +00:00 y al escribir un Date manda la hora UTC sin offset. La base del compose corre en
 * hora argentina, así que sin la sesión en UTC lo escrito desde JS quedaba 3 horas en el futuro y lo
 * escrito por Postgres (`NOW()`, triggers) se leía 3 horas atrasado.
 */
describe.skipIf(!RUN)('zona horaria de la conexión de Prisma (integración)', () => {
  it('un Date escrito desde JS es el mismo instante que NOW() de la base', async () => {
    const { prisma } = await import('./prisma');
    const js = new Date();
    const [row] = await prisma.$queryRaw<{ seconds: number }[]>`
      SELECT abs(extract(epoch FROM (${js}::timestamptz - NOW())))::float8 AS seconds`;
    expect(row?.seconds).toBeLessThan(60);
  });

  it('un timestamptz que genera la base se lee como el mismo instante', async () => {
    const { prisma } = await import('./prisma');
    const [row] = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() AS now`;
    expect(Math.abs((row?.now.getTime() ?? 0) - Date.now())).toBeLessThan(60_000);
  });

  it('las funciones de la base siguen calculando "hoy" en hora argentina', async () => {
    const { prisma } = await import('./prisma');
    const { treasuryToday } = await import('@/features/Treasury/lib/today');
    const [row] = await prisma.$queryRaw<{ today: string }[]>`
      SELECT (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS today`;
    expect(row?.today).toBe(treasuryToday());
  });
});
