-- Tesoreria (etapa 1): reglas que viven en la base (CHECK e indices que Prisma no modela, ver
-- migracion 20261012100000_treasury_core). El servidor valida antes y da el mensaje; estos
-- tests prueban la red de seguridad. 23514 = check_violation, 23505 = unique_violation.
BEGIN;

SELECT plan(24);

SELECT has_table('public', 'treasury_movements', 'existe treasury_movements');
SELECT has_table('public', 'treasury_concepts', 'existe treasury_concepts');
SELECT has_table('public', 'treasury_transfers', 'existe treasury_transfers');

-- ── Datos minimos ───────────────────────────────────────────────────────────
INSERT INTO company (id, company_name, description, contact_email, contact_phone, address, city, country, industry, company_cuit)
SELECT
  'a3000000-0000-0000-0000-000000000001'::uuid,
  'pgTAP tesoreria', 'empresa de prueba', 'pgtap-tesoreria@alphataco.local', '+542991234567',
  'Calle 123', c.id, 'argentina', 'Petroleo', '30999999994'
FROM cities c
LIMIT 1;

INSERT INTO profile (id, credential_id, email)
VALUES ('a3000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000002', 'pgtap-tesoreria@alphataco.local');

INSERT INTO treasury_accounts (id, company_id, kind, name) VALUES
  ('a3000000-0000-0000-0000-000000000010', 'a3000000-0000-0000-0000-000000000001', 'BANK', 'Banco T'),
  ('a3000000-0000-0000-0000-000000000011', 'a3000000-0000-0000-0000-000000000001', 'CASH', 'Caja T');

INSERT INTO treasury_concepts (id, company_id, name, direction)
VALUES ('a3000000-0000-0000-0000-000000000020', 'a3000000-0000-0000-0000-000000000001', 'Gastos', 'OUT');

INSERT INTO treasury_transfers (id, company_id, number, date, from_account_id, to_account_id, amount, created_by)
VALUES ('a3000000-0000-0000-0000-000000000030', 'a3000000-0000-0000-0000-000000000001', 'TR-000001', current_date,
  'a3000000-0000-0000-0000-000000000010', 'a3000000-0000-0000-0000-000000000011', 100,
  'a3000000-0000-0000-0000-000000000002');

INSERT INTO suppliers (id, company_id, name, cuit, vat_condition_id)
VALUES ('a3000000-0000-0000-0000-000000000040', 'a3000000-0000-0000-0000-000000000001', 'Proveedor T', 30712345678, 1);

INSERT INTO payment_orders (id, company_id, number, supplier_id, status, planned_on, invoices_total, credits_total,
  advance_total, withholdings_total, net_total, created_by)
VALUES ('a3000000-0000-0000-0000-000000000041', 'a3000000-0000-0000-0000-000000000001', 'OP-000001',
  'a3000000-0000-0000-0000-000000000040', 'DRAFT', current_date, 0, 0, 0, 0, 0, 'a3000000-0000-0000-0000-000000000002');

INSERT INTO payment_order_payments (id, payment_order_id, method, treasury_account_id, amount)
VALUES ('a3000000-0000-0000-0000-000000000042', 'a3000000-0000-0000-0000-000000000041', 'TRANSFER',
  'a3000000-0000-0000-0000-000000000010', 50);

-- ── Cuentas ─────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$UPDATE treasury_accounts SET currency = 'USD' WHERE id = 'a3000000-0000-0000-0000-000000000010'$$,
  '23514', NULL, 'solo pesos'
);

-- ── Movimientos: importe y origen ───────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000010', current_date, 0, 'OPENING',
            'a3000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un movimiento nunca es 0'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, concept_id, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000010', current_date, 10, 'OPENING',
            'a3000000-0000-0000-0000-000000000020', 'a3000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un saldo inicial no lleva concepto'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000010', current_date, -10, 'MANUAL',
            'a3000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un manual lleva concepto'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, concept_id, transfer_id, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000010', current_date, -10, 'MANUAL',
            'a3000000-0000-0000-0000-000000000020', 'a3000000-0000-0000-0000-000000000030',
            'a3000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un manual no lleva transferencia'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000010', current_date, -10, 'TRANSFER',
            'a3000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un movimiento de transferencia lleva la transferencia'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, transfer_id, payment_order_payment_id, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000010', current_date, -10, 'TRANSFER',
            'a3000000-0000-0000-0000-000000000030', 'a3000000-0000-0000-0000-000000000042',
            'a3000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un movimiento de transferencia no lleva pago'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000010', current_date, -10, 'SUPPLIER_PAYMENT',
            'a3000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un pago a proveedor lleva el medio de pago'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, payment_order_payment_id, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000010', current_date, 10, 'SUPPLIER_PAYMENT',
            'a3000000-0000-0000-0000-000000000042', 'a3000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un pago a proveedor siempre sale (negativo)'
);

SELECT lives_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, payment_order_payment_id, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000010', current_date, -50, 'SUPPLIER_PAYMENT',
            'a3000000-0000-0000-0000-000000000042', 'a3000000-0000-0000-0000-000000000002')$$,
  'un pago a proveedor se guarda'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, payment_order_payment_id, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000010', current_date, -50, 'SUPPLIER_PAYMENT',
            'a3000000-0000-0000-0000-000000000042', 'a3000000-0000-0000-0000-000000000002')$$,
  '23505', NULL, 'un medio de pago genera un solo movimiento'
);

SELECT lives_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, concept_id, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000010', current_date, -10, 'MANUAL',
            'a3000000-0000-0000-0000-000000000020', 'a3000000-0000-0000-0000-000000000002')$$,
  'un manual se guarda'
);

SELECT lives_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, transfer_id, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000010', current_date, -100, 'TRANSFER',
            'a3000000-0000-0000-0000-000000000030', 'a3000000-0000-0000-0000-000000000002')$$,
  'un movimiento de transferencia se guarda'
);

-- ── Saldo inicial: uno vigente por cuenta ───────────────────────────────────
INSERT INTO treasury_movements (id, company_id, account_id, date, amount, kind, created_by)
VALUES ('a3000000-0000-0000-0000-000000000050', 'a3000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000011', current_date - 30, 1000, 'OPENING', 'a3000000-0000-0000-0000-000000000002');

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000011', current_date, 500, 'OPENING',
            'a3000000-0000-0000-0000-000000000002')$$,
  '23505', NULL, 'un solo saldo inicial vigente por cuenta'
);

SELECT lives_ok(
  $$UPDATE treasury_movements SET cancelled_by = 'a3000000-0000-0000-0000-000000000002', cancelled_at = now(),
      cancel_reason = 'error' WHERE id = 'a3000000-0000-0000-0000-000000000050'$$,
  'el saldo inicial se anula'
);

SELECT lives_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000011', current_date, -500, 'OPENING',
            'a3000000-0000-0000-0000-000000000002')$$,
  'anulado el anterior, se carga otro (puede ser negativo)'
);

-- ── Anulacion completa o nada ───────────────────────────────────────────────
SELECT throws_ok(
  $$UPDATE treasury_movements SET cancelled_at = now() WHERE kind = 'MANUAL'
      AND account_id = 'a3000000-0000-0000-0000-000000000010'$$,
  '23514', NULL, 'la anulacion de un movimiento lleva quien, cuando y motivo'
);

SELECT throws_ok(
  $$UPDATE treasury_transfers SET cancelled_by = 'a3000000-0000-0000-0000-000000000002'
      WHERE id = 'a3000000-0000-0000-0000-000000000030'$$,
  '23514', NULL, 'la anulacion de una transferencia lleva quien, cuando y motivo'
);

-- ── Transferencias ──────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO treasury_transfers (company_id, number, date, from_account_id, to_account_id, amount, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'TR-000002', current_date, 'a3000000-0000-0000-0000-000000000010',
            'a3000000-0000-0000-0000-000000000010', 100, 'a3000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'una transferencia va entre cuentas distintas'
);

SELECT throws_ok(
  $$INSERT INTO treasury_transfers (company_id, number, date, from_account_id, to_account_id, amount, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'TR-000002', current_date, 'a3000000-0000-0000-0000-000000000010',
            'a3000000-0000-0000-0000-000000000011', 0, 'a3000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'una transferencia tiene importe positivo'
);

SELECT throws_ok(
  $$INSERT INTO treasury_transfers (company_id, number, date, from_account_id, to_account_id, amount, created_by)
    VALUES ('a3000000-0000-0000-0000-000000000001', 'TR-000001', current_date, 'a3000000-0000-0000-0000-000000000010',
            'a3000000-0000-0000-0000-000000000011', 5, 'a3000000-0000-0000-0000-000000000002')$$,
  '23505', NULL, 'el numero de transferencia es unico por empresa'
);

SELECT * FROM finish();
ROLLBACK;
