-- Tesoreria etapa 2: kind de movimiento de los cobros. Va sola: Postgres no deja usar un valor
-- de enum nuevo en la misma transaccion en la que se agrega.
ALTER TYPE "treasury_movement_kind" ADD VALUE IF NOT EXISTS 'CUSTOMER_RECEIPT';
