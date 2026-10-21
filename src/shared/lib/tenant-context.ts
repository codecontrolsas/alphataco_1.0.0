import { AsyncLocalStorage } from 'node:async_hooks';

import type { Prisma, PrismaClient } from '@/generated/prisma/client';

/**
 * Contexto de la transacción que leen las funciones SQL y, más adelante, las políticas RLS
 * (`app_current_company_id()`, `app_current_user_id()`, `app_current_actor_kind()`; ver `prisma/sql/tenant.sql`).
 *
 * Parte pura, sin Next ni sesión: la usan `tenant-db.ts` (request) y, más adelante, los jobs y los scripts.
 */
export type TenantActorKind = 'user' | 'operator' | 'guest' | 'api' | 'job';

export interface TenantContext {
  companyId: string;
  /** `profile.credential_id` del usuario; null para jobs y accesos sin sesión. */
  userId: string | null;
  kind: TenantActorKind;
}

export type TenantTx = Prisma.TransactionClient;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertContext(ctx: TenantContext): void {
  if (!UUID_RE.test(ctx.companyId)) throw new Error('companyId debe ser un uuid');
  if (ctx.userId !== null && !UUID_RE.test(ctx.userId)) throw new Error('userId debe ser un uuid');
}

/**
 * Fija el contexto con `set_config(..., true)`: vive solo hasta el final de la transacción en curso.
 * Nunca un `SET` de sesión: con un pool se filtraría a la próxima persona que use la conexión.
 */
export function setTenantContext(tx: Pick<TenantTx, '$executeRaw'>, ctx: TenantContext) {
  assertContext(ctx);
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
  ctx: TenantContext,
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
        throw new Error('El cliente con contexto no admite $transaction: usar withTenantContext() para operaciones atómicas');
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

/** Resuelve el contexto del request actual, o null si no hay (login, jobs, tests, cache sin request). */
export type TenantContextResolver = () => Promise<TenantContext | null>;

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
