-- Tesoreria (etapa 3b, cheques propios): reglas que viven en la base (CHECK e indices que Prisma
-- no modela, ver migracion 20261017100050_treasury_own_checks). El servidor valida antes y da el
-- mensaje; estos tests prueban la red de seguridad. 23514 = check_violation, 23505 = unique_violation.
BEGIN;

SELECT plan(18);

SELECT has_table('public', 'checkbooks', 'existe checkbooks');
SELECT has_table('public', 'own_checks', 'existe own_checks');
SELECT has_table('public', 'own_check_events', 'existe own_check_events');

-- ── Datos minimos ───────────────────────────────────────────────────────────
INSERT INTO company (id, company_name, description, contact_email, contact_phone, address, city, country, industry, company_cuit)
SELECT
  'a8000000-0000-0000-0000-000000000001'::uuid,
  'pgTAP cheques propios', 'empresa de prueba', 'pgtap-propios@alphataco.local', '+542991234567',
  'Calle 123', c.id, 'argentina', 'Petroleo', '30999999985'
FROM cities c
LIMIT 1;

INSERT INTO profile (id, credential_id, email)
VALUES ('a8000000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-000000000002', 'pgtap-propios@alphataco.local');

INSERT INTO suppliers (id, company_id, name, cuit, vat_condition_id)
VALUES ('a8000000-0000-0000-0000-000000000004', 'a8000000-0000-0000-0000-000000000001', 'Proveedor T', 30712345678, 1);

INSERT INTO treasury_accounts (id, company_id, kind, name)
VALUES ('a8000000-0000-0000-0000-000000000011', 'a8000000-0000-0000-0000-000000000001', 'BANK', 'Banco T');

INSERT INTO checkbooks (id, company_id, account_id, first_number, last_number, created_by)
VALUES ('a8000000-0000-0000-0000-000000000012', 'a8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000011',
        100, 150, 'a8000000-0000-0000-0000-000000000002');

INSERT INTO payment_orders (id, company_id, number, supplier_id, status, planned_on, paid_on, paid_by, invoices_total, credits_total,
  advance_total, withholdings_total, net_total, created_by)
VALUES ('a8000000-0000-0000-0000-000000000020', 'a8000000-0000-0000-0000-000000000001', 'OP-T00001',
        'a8000000-0000-0000-0000-000000000004', 'PAID', current_date, current_date, 'a8000000-0000-0000-0000-000000000002', 0, 0, 1000, 0, 1000,
        'a8000000-0000-0000-0000-000000000002');

INSERT INTO payment_order_payments (id, payment_order_id, method, treasury_account_id, amount, check_number, check_due_on)
VALUES ('a8000000-0000-0000-0000-000000000021', 'a8000000-0000-0000-0000-000000000020', 'CHECK',
        'a8000000-0000-0000-0000-000000000011', 1000, '100', current_date),
       ('a8000000-0000-0000-0000-000000000022', 'a8000000-0000-0000-0000-000000000020', 'CHECK',
        'a8000000-0000-0000-0000-000000000011', 1000, '101', current_date);

INSERT INTO own_checks (id, company_id, kind, account_id, checkbook_id, number, amount, issue_date, payment_date, supplier_id,
  payment_order_payment_id, created_by)
VALUES ('a8000000-0000-0000-0000-000000000030', 'a8000000-0000-0000-0000-000000000001', 'PHYSICAL',
        'a8000000-0000-0000-0000-000000000011', 'a8000000-0000-0000-0000-000000000012', '100', 1000, current_date, current_date,
        'a8000000-0000-0000-0000-000000000004', 'a8000000-0000-0000-0000-000000000021', 'a8000000-0000-0000-0000-000000000002');

-- ── Chequera ────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO checkbooks (company_id, account_id, first_number, last_number, created_by)
    VALUES ('a8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000011', 10, 5, 'a8000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'el hasta no es menor que el desde'
);

SELECT throws_ok(
  $$INSERT INTO checkbooks (company_id, account_id, first_number, last_number, created_by)
    VALUES ('a8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000011', 1, 501, 'a8000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'una chequera tiene hasta 500 numeros'
);

SELECT throws_ok(
  $$UPDATE checkbooks SET retired_at = now() WHERE id = 'a8000000-0000-0000-0000-000000000012'$$,
  '23514', NULL, 'la baja lleva quien y motivo'
);

-- ── Movimientos: el origen OWN_CHECK ────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, created_by)
    VALUES ('a8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000011', current_date, -1000, 'OWN_CHECK',
            'a8000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un debito de cheque propio lleva su cheque'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, own_check_id, created_by)
    VALUES ('a8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000011', current_date, 1000, 'OWN_CHECK',
            'a8000000-0000-0000-0000-000000000030', 'a8000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un debito de cheque propio es un egreso'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, payment_order_payment_id, own_check_id, created_by)
    VALUES ('a8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000011', current_date, -1000, 'SUPPLIER_PAYMENT',
            'a8000000-0000-0000-0000-000000000022', 'a8000000-0000-0000-0000-000000000030', 'a8000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un pago a proveedor no lleva cheque propio'
);

SELECT lives_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, own_check_id, created_by)
    VALUES ('a8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000011', current_date, -1000, 'OWN_CHECK',
            'a8000000-0000-0000-0000-000000000030', 'a8000000-0000-0000-0000-000000000002')$$,
  'un debito con su cheque es valido'
);

-- ── Estados ─────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$UPDATE own_checks SET status = 'DEBITED' WHERE id = 'a8000000-0000-0000-0000-000000000030'$$,
  '23514', NULL, 'un debitado lleva fecha de debito'
);

SELECT throws_ok(
  $$UPDATE own_checks SET status = 'REJECTED', rejected_on = current_date WHERE id = 'a8000000-0000-0000-0000-000000000030'$$,
  '23514', NULL, 'un rechazado lleva motivo'
);

SELECT lives_ok(
  $$UPDATE own_checks SET status = 'DEBITED', debited_on = current_date WHERE id = 'a8000000-0000-0000-0000-000000000030'$$,
  'un debitado con fecha es valido'
);

-- ── Datos y numeros ─────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO own_checks (company_id, kind, account_id, checkbook_id, number, issue_date, status, void_reason, amount, created_by)
    VALUES ('a8000000-0000-0000-0000-000000000001', 'PHYSICAL', 'a8000000-0000-0000-0000-000000000011',
            'a8000000-0000-0000-0000-000000000012', '120', current_date, 'CANCELLED', 'Roto', 10, 'a8000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un numero inutilizado no tiene importe'
);

SELECT throws_ok(
  $$INSERT INTO own_checks (company_id, kind, account_id, checkbook_id, number, amount, issue_date, payment_date, supplier_id,
      payment_order_payment_id, created_by)
    VALUES ('a8000000-0000-0000-0000-000000000001', 'ECHECK', 'a8000000-0000-0000-0000-000000000011',
            'a8000000-0000-0000-0000-000000000012', 'E1', 10, current_date, current_date, 'a8000000-0000-0000-0000-000000000004',
            'a8000000-0000-0000-0000-000000000022', 'a8000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un e-cheq no tiene chequera'
);

SELECT throws_ok(
  $$INSERT INTO own_checks (company_id, kind, account_id, checkbook_id, number, issue_date, status, void_reason, created_by)
    VALUES ('a8000000-0000-0000-0000-000000000001', 'PHYSICAL', 'a8000000-0000-0000-0000-000000000011',
            'a8000000-0000-0000-0000-000000000012', '100', current_date, 'CANCELLED', 'Roto', 'a8000000-0000-0000-0000-000000000002')$$,
  '23505', NULL, 'un numero no se repite en la cuenta, ni anulado'
);

-- ── Deuda de un cheque rechazado en la orden de pago ───────────────────────
SELECT throws_ok(
  $$INSERT INTO payment_order_lines (payment_order_id, position, kind, amount, own_check_id, third_party_check_id)
    VALUES ('a8000000-0000-0000-0000-000000000020', 9, 'REJECTED_CHECK', 10, 'a8000000-0000-0000-0000-000000000030', NULL),
           ('a8000000-0000-0000-0000-000000000020', 10, 'REJECTED_CHECK', 10, NULL, NULL)$$,
  '23514', NULL, 'la linea de cheque rechazado lleva exactamente un cheque'
);

SELECT lives_ok(
  $$INSERT INTO payment_order_lines (payment_order_id, position, kind, amount, own_check_id)
    VALUES ('a8000000-0000-0000-0000-000000000020', 9, 'REJECTED_CHECK', 10, 'a8000000-0000-0000-0000-000000000030')$$,
  'la deuda de un cheque propio es una linea valida'
);

SELECT * FROM finish();
ROLLBACK;
