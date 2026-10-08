-- Almacenes, etapa 2: valores de enum nuevos.
-- Va en una migracion propia: Postgres no permite usar un valor de enum en la misma transaccion
-- que lo agrega, y la migracion siguiente lo usa en CHECKs e INSERTs.

-- CreateEnum
CREATE TYPE "material_write_off_reason" AS ENUM ('LOST', 'BROKEN');

-- AlterEnum
ALTER TYPE "notification_kind" ADD VALUE 'stock_batch_expiry';

-- AlterEnum
ALTER TYPE "stock_movement_type" ADD VALUE 'RETURN';
