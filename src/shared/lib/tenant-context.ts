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
 * correría en otra transacción y perdería el rollback. Para varias operaciones atómicas usar `withTenantTx`.
 */
export function createTenantClient(base: PrismaClient, ctx: TenantContext) {
  assertContext(ctx);
  return base.$extends({
    name: 'tenant-context',
    client: {
      $transaction() {
        throw new Error('getDb() no admite $transaction: usar withTenantTx() para operaciones atómicas');
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
