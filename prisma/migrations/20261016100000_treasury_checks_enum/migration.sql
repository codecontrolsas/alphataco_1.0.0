-- Tesoreria, etapa 3a (cheques de terceros): valores nuevos de enums existentes. Van en una
-- migracion propia porque Postgres no deja usar un valor agregado con ADD VALUE en la misma
-- transaccion (la siguiente migracion los usa en sus CHECK).
ALTER TYPE treasury_account_kind ADD VALUE IF NOT EXISTS 'CHECK_PORTFOLIO';
ALTER TYPE treasury_movement_kind ADD VALUE IF NOT EXISTS 'CHECK_OPERATION';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'THIRD_PARTY_CHECK';
ALTER TYPE customer_receipt_line_kind ADD VALUE IF NOT EXISTS 'REJECTED_CHECK';
ALTER TYPE payment_line_kind ADD VALUE IF NOT EXISTS 'REJECTED_CHECK';
