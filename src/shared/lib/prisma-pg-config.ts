/**
 * Configuración del pool de `PrismaPg`. La sesión va en UTC porque el adaptador de Prisma lo asume:
 * al leer un `timestamptz` reemplaza el offset por +00:00 y al escribir un Date manda la hora UTC sin
 * offset. Con la sesión en hora argentina (la zona de la base del compose), lo escrito desde JS
 * quedaba 3 horas en el futuro y lo que escribe Postgres (`NOW()`, triggers) se leía 3 horas atrasado.
 *
 * El "hoy" argentino de las funciones SQL no cambia: cada una fija su zona (`SET TimeZone`, ver
 * `prisma/sql/timezone.sql`). En TypeScript, "hoy" sale de `treasuryToday()` / `argentinaDate()`.
 * Todo `new PrismaPg(...)` del repo (app, seeds, demo) pasa por acá.
 */
export function prismaPgConfig(connectionString: string | undefined) {
  return { connectionString, options: '-c TimeZone=UTC' };
}
