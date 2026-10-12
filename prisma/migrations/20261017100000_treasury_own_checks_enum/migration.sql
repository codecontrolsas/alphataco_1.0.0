-- Tesoreria, etapa 3b (cheques propios): valor nuevo del tipo de movimiento. Va en una migracion
-- propia porque Postgres no deja usar un valor agregado con ADD VALUE en la misma transaccion.
ALTER TYPE treasury_movement_kind ADD VALUE IF NOT EXISTS 'OWN_CHECK';
