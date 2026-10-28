import { AsyncLocalStorage } from 'node:async_hooks';

import type { Prisma, PrismaClient } from '@/generated/prisma/client';

/**
 * Contexto de la transacción que leen las funciones SQL y, más adelante, las políticas RLS
 * (`app_current_company_id()`, `app_current_user_id()`, `app_current_actor_kind()`; ver `prisma/sql/tenant.sql`).
 *
 * Parte pura, sin Next ni sesión: la usan `tenant-db.ts` (request) y, más adelante, los jobs y los scripts.
 */
export type TenantActorKind = 'user' | 'operator' | 'employee' | 'guest' | 'api' | 'job';

export interface TenantContext {
  companyId: string;
  /** `profile.credential_id` del usuario; null para jobs y accesos sin sesión. */
  userId: string | null;
  kind: TenantActorKind;
  /**
   * Legajo vinculado a la sesión (`profile.employee_id`) cuando es de la empresa activa. Lo lee la capa RLS por empleado
   * (`app_current_employee_id()`, ver `app_enable_employee_self` en `prisma/sql/tenant.sql`): sin él, las tablas del
   * portal no devuelven filas propias. Lo resuelve SIEMPRE el servidor, nunca un dato del cliente.
   */
  employeeId?: string | null;
}

/**
 * Sesión autenticada SIN empresa activa (primer ingreso: el proxy la manda a crear su empresa, o tiene membresías y
 * todavía no eligió ninguna). Solo fija el usuario: con `app.company_id` vacío, la RLS le muestra su propio perfil,
 * sus membresías y las empresas a las que pertenece, y ninguna fila de negocio (todas exigen empresa activa).
 */
export interface ActorOnlyContext {
  companyId: null;
  userId: string;
  kind: 'user';
}

/** Lo que puede fijarse en una transacción: el contexto completo de empresa o solo el actor de la sesión. */
export type TransactionContext = TenantContext | ActorOnlyContext;

export type TenantTx = Prisma.TransactionClient;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertContext(ctx: TransactionContext): void {
  if (ctx.companyId === null) {
    // Sin empresa el usuario es lo único que identifica el contexto: tiene que estar y ser un uuid.
    if (ctx.userId === null || !UUID_RE.test(ctx.userId)) throw new Error('userId debe ser un uuid');
    return;
  }
  if (!UUID_RE.test(ctx.companyId)) throw new Error('companyId debe ser un uuid');
  if (ctx.userId !== null && !UUID_RE.test(ctx.userId)) throw new Error('userId debe ser un uuid');
  if (ctx.employeeId != null && !UUID_RE.test(ctx.employeeId)) throw new Error('employeeId debe ser un uuid');
}

/**
 * Fija el contexto con `set_config(..., true)`: vive solo hasta el final de la transacción en curso.
 * Nunca un `SET` de sesión: con un pool se filtraría a la próxima persona que use la conexión.
 */
export function setTenantContext(tx: Pick<TenantTx, '$executeRaw'>, ctx: TransactionContext) {
  assertContext(ctx);
  // Solo actor: la empresa va vacía a propósito (`app_current_company_id()` la lee como NULL).
  if (ctx.companyId === null) {
    return tx.$executeRaw`SELECT set_config('app.company_id', '', true),
      set_config('app.user_id', ${ctx.userId}, true),
      set_config('app.actor_kind', ${ctx.kind}, true)`;
  }
  // El legajo va solo cuando hay: cada contexto se fija al principio de su propia transacción, así que sin el
  // `set_config` el valor queda NULL (no hereda nada de otra persona) y las demás sesiones no pagan un parámetro más.
  if (ctx.employeeId) {
    return tx.$executeRaw`SELECT set_config('app.company_id', ${ctx.companyId}, true),
      set_config('app.user_id', ${ctx.userId ?? ''}, true),
      set_config('app.actor_kind', ${ctx.kind}, true),
      set_config('app.employee_id', ${ctx.employeeId}, true)`;
  }
  return tx.$executeRaw`SELECT set_config('app.company_id', ${ctx.companyId}, true),
    set_config('app.user_id', ${ctx.userId ?? ''}, true),
    set_config('app.actor_kind', ${ctx.kind}, true)`;
}

/** Opciones de la transacción interactiva (por defecto Prisma corta a los 5 s). */
export interface TenantTransactionOptions {
  timeout?: number;
  maxWait?: number;
}

/**
 * Transacción interactiva con el contexto ya fijado. Usa SIEMPRE el cliente base, sin extensión: con el cliente
 * extendido cada operación abre su propia transacción y las escrituras escapan de la interactiva (se confirman
 * sin revertirse si algo falla después).
 */
export function runWithTenantContext<T>(
  base: Pick<PrismaClient, '$transaction'>,
  ctx: TransactionContext,
  fn: (tx: TenantTx) => Promise<T>,
  options?: TenantTransactionOptions
): Promise<T> {
  assertContext(ctx);
  return base.$transaction(async (tx) => {
    await setTenantContext(tx, ctx);
    return fn(tx);
  }, options);
}

/**
 * Cliente que fija el contexto en cada operación suelta: cada consulta corre en un lote
 * `[set_config, consulta]` dentro de una transacción corta (BEGIN/COMMIT), en la misma conexión.
 * Cubre `findMany` y compañía, los `include` anidados y `$queryRaw`.
 *
 * `$transaction` queda bloqueado a propósito: dentro de una interactiva del cliente extendido cada operación
 * correría en otra transacción y perdería el rollback. Para varias operaciones atómicas usar `withTenantContext`.
 */
export function createTenantClient(base: PrismaClient, ctx: TenantContext) {
  assertContext(ctx);
  return base.$extends({
    name: 'tenant-context',
    client: {
      $transaction() {
        throw new Error(
          'El cliente con contexto no admite $transaction: usar withTenantContext() para operaciones atómicas'
        );
      },
    },
    query: {
      $allOperations: async ({ args, query }) => {
        const [, result] = await base.$transaction([setTenantContext(base, ctx), query(args)]);
        return result;
      },
    },
  });
}

/**
 * Empresa fijada a mano por una función `'use cache'` (ver `runInCompanyScope`). Vive en `globalThis`, igual que el
 * cliente `prisma`: el cliente se crea una sola vez y su resolver tiene que leer ESTE store aunque el bundler cargue
 * este módulo más de una vez (capas de servidor distintas).
 */
const globalForScope = globalThis as unknown as { tenantCompanyScope?: AsyncLocalStorage<TenantContext> };
const companyScope = (globalForScope.tenantCompanyScope ??= new AsyncLocalStorage<TenantContext>());

/**
 * Corre `fn` con la empresa ya resuelta como contexto de `prisma`.
 *
 * Una función `'use cache'` no puede leer cookies ni la sesión: sin esto el cliente contextual no encuentra contexto,
 * la consulta corre sin `app.company_id` y, con el rol de aplicación (sin BYPASSRLS), la RLS devuelve CERO filas, que
 * además quedan cacheadas (ticket 800: "En mantenimiento" mostraba 9 en el contador y la tabla vacía). La empresa
 * llega por parámetro y ya forma parte de la clave del cache. Sin usuario: las lecturas solo filtran por empresa.
 *
 * También lo usan los jobs (`kind: 'job'`) para que el cliente `prisma` de las funciones que reutilizan (avisos,
 * consultas de stock) corra con la empresa que se está procesando: sin request no hay otra forma de resolverla.
 */
export function runInCompanyScope<T>(
  companyId: string,
  fn: () => Promise<T>,
  kind: Extract<TenantActorKind, 'guest' | 'job'> = 'guest'
): Promise<T> {
  const ctx: TenantContext = { companyId, userId: null, kind };
  assertContext(ctx);
  // `await` DENTRO del scope: una consulta de Prisma es perezosa (corre al hacerle `.then`). Con `run(ctx, fn)` a
  // secas, `() => prisma.x.findMany()` devolvía la consulta sin ejecutar, se ejecutaba afuera y sin empresa.
  return companyScope.run(ctx, async () => await fn());
}

/**
 * Corre `fn` con un contexto COMPLETO (empresa + usuario) como contexto de `prisma`, para quien ya lo resolvió sin
 * cookie: la API móvil autentica por token de portador y reutiliza las consultas de la web (que usan el cliente
 * contextual). Sin esto, con el rol de aplicación la RLS devolvería cero filas sin error.
 */
export function runInTenantScope<T>(ctx: TenantContext, fn: () => Promise<T>): Promise<T> {
  assertContext(ctx);
  return companyScope.run(ctx, async () => await fn());
}

/** Contexto fijado con `runInCompanyScope` o `runInTenantScope`, si la operación corre dentro de uno. */
export function getCompanyScopeContext(): TenantContext | null {
  return companyScope.getStore() ?? null;
}

/**
 * Resuelve el contexto del request actual, o null si no hay (login, jobs, tests, cache sin request). Con sesión pero
 * sin empresa activa resuelve solo el actor (`ActorOnlyContext`).
 */
export type TenantContextResolver = () => Promise<TransactionContext | null>;

/**
 * Cliente "global" que resuelve solo el contexto de empresa: las features siguen importando `prisma` y cada operación
 * corre con `app.company_id` fijado, sin tocar los ~400 archivos que lo usan. La que aísla es la RLS, no el punto de
 * llamada.
 *
 * - Sin contexto (resolver devuelve null o falla) la operación corre directo, sin lote: login, jobs y tests siguen igual.
 * - `$transaction` conserva su forma: la interactiva usa el cliente base (sin extensión, para no perder el rollback)
 *   y fija el contexto al inicio; la de arreglo agrega el `set_config` al principio del mismo lote.
 * - Los clientes que resuelven el contexto (sesión, empresa activa) deben usar el cliente BASE, nunca este: si no,
 *   la resolución se espera a sí misma.
 */
export function createContextualClient(base: PrismaClient, resolve: TenantContextResolver) {
  /** Verdadero mientras corre el lote de un `$transaction([...])`: sus operaciones ya van dentro de la transaccion. */
  const inBatch = new AsyncLocalStorage<true>();

  const safeResolve = async () => {
    try {
      return await resolve();
    } catch {
      return null;
    }
  };

  return base.$extends({
    name: 'tenant-context-auto',
    client: {
      async $transaction(arg: unknown, options?: unknown) {
        const ctx = await safeResolve();
        if (typeof arg === 'function') {
          const fn = arg as (tx: TenantTx) => Promise<unknown>;
          return ctx
            ? runWithTenantContext(base, ctx, fn, options as TenantTransactionOptions | undefined)
            : base.$transaction(fn, options as never);
        }
        // Las operaciones del arreglo son lazy: se ejecutan dentro de `base.$transaction`, o sea dentro de este
        // `inBatch.run`, y ahi no deben abrir una transaccion propia (perderian la atomicidad del arreglo).
        const ops = arg as never[];
        if (!ctx) return inBatch.run(true, () => base.$transaction(ops, options as never));
        const results = await inBatch.run(true, () =>
          base.$transaction([setTenantContext(base, ctx), ...ops] as never, options as never)
        );
        return (results as unknown[]).slice(1);
      },
    },
    query: {
      $allOperations: async ({ args, query }) => {
        if (inBatch.getStore()) return query(args);
        const ctx = await safeResolve();
        if (!ctx) return query(args);
        const [, result] = await base.$transaction([setTenantContext(base, ctx), query(args)]);
        return result;
      },
    },
  });
}
