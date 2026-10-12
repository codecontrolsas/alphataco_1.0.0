-- Tesoreria (etapa 3a, cheques de terceros): reglas que viven en la base (CHECK e indices que
-- Prisma no modela, ver migracion 20261016100050_treasury_checks). El servidor valida antes y da
-- el mensaje; estos tests prueban la red de seguridad. 23514 = check_violation, 23505 = unique_violation.
BEGIN;

SELECT plan(26);

SELECT has_table('public', 'third_party_checks', 'existe third_party_checks');
SELECT has_table('public', 'third_party_check_operations', 'existe third_party_check_operations');
SELECT has_table('public', 'third_party_check_operation_items', 'existe third_party_check_operation_items');
SELECT has_table('public', 'third_party_check_events', 'existe third_party_check_events');

-- ── Datos minimos ───────────────────────────────────────────────────────────
INSERT INTO company (id, company_name, description, contact_email, contact_phone, address, city, country, industry, company_cuit)
SELECT
  'a7000000-0000-0000-0000-000000000001'::uuid,
  'pgTAP cheques', 'empresa de prueba', 'pgtap-cheques@alphataco.local', '+542991234567',
  'Calle 123', c.id, 'argentina', 'Petroleo', '30999999986'
FROM cities c
LIMIT 1;

INSERT INTO profile (id, credential_id, email)
VALUES ('a7000000-0000-0000-0000-000000000002', 'a7000000-0000-0000-0000-000000000002', 'pgtap-cheques@alphataco.local');

INSERT INTO customers (id, company_id, name, cuit, vat_condition_id)
VALUES ('a7000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000001', 'Cliente T', 30712345679, 1);

INSERT INTO suppliers (id, company_id, name, cuit, vat_condition_id)
VALUES ('a7000000-0000-0000-0000-000000000004', 'a7000000-0000-0000-0000-000000000001', 'Proveedor T', 30712345678, 1);

INSERT INTO treasury_accounts (id, company_id, kind, name)
VALUES ('a7000000-0000-0000-0000-000000000010', 'a7000000-0000-0000-0000-000000000001', 'CHECK_PORTFOLIO', 'Cartera T'),
       ('a7000000-0000-0000-0000-000000000011', 'a7000000-0000-0000-0000-000000000001', 'BANK', 'Banco T');

INSERT INTO treasury_concepts (id, company_id, name, direction)
VALUES ('a7000000-0000-0000-0000-000000000012', 'a7000000-0000-0000-0000-000000000001', 'Varios', 'BOTH');

-- Carga inicial (origen de los cheques de prueba).
INSERT INTO third_party_check_operations (id, company_id, kind, date, created_by)
VALUES ('a7000000-0000-0000-0000-000000000020', 'a7000000-0000-0000-0000-000000000001', 'OPENING', current_date,
        'a7000000-0000-0000-0000-000000000002');

INSERT INTO third_party_checks (id, company_id, kind, number, bank, drawer_name, drawer_cuit, issue_date, payment_date, amount,
  customer_id, portfolio_id, opening_operation_id, created_by)
VALUES ('a7000000-0000-0000-0000-000000000030', 'a7000000-0000-0000-0000-000000000001', 'PHYSICAL', '100', 'BANCO T', 'Librador',
  '30712345679', current_date, current_date + 10, 1000, 'a7000000-0000-0000-0000-000000000003',
  'a7000000-0000-0000-0000-000000000010', 'a7000000-0000-0000-0000-000000000020', 'a7000000-0000-0000-0000-000000000002');

-- ── Movimientos: el origen CHECK_OPERATION ──────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000010', current_date, 1000, 'CHECK_OPERATION',
            'a7000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'una operacion de cheques lleva su operacion'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, concept_id, check_operation_id, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000011', current_date, 1000, 'MANUAL',
            'a7000000-0000-0000-0000-000000000012', 'a7000000-0000-0000-0000-000000000020', 'a7000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un manual no lleva operacion de cheques'
);

SELECT lives_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, check_operation_id, third_party_check_id, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000010', current_date, 1000, 'CHECK_OPERATION',
            'a7000000-0000-0000-0000-000000000020', 'a7000000-0000-0000-0000-000000000030', 'a7000000-0000-0000-0000-000000000002')$$,
  'una carga inicial con su operacion es valida'
);

-- ── Datos del cheque ────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO third_party_checks (company_id, kind, number, bank, drawer_name, drawer_cuit, issue_date, payment_date, amount,
      customer_id, portfolio_id, opening_operation_id, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'PHYSICAL', '101', 'BANCO T', 'L', '30712345679', current_date, current_date, 0,
      'a7000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000010', 'a7000000-0000-0000-0000-000000000020',
      'a7000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'el importe es mayor a 0'
);

SELECT throws_ok(
  $$INSERT INTO third_party_checks (company_id, kind, number, bank, drawer_name, drawer_cuit, issue_date, payment_date, amount,
      customer_id, portfolio_id, opening_operation_id, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'PHYSICAL', '102', 'BANCO T', 'L', '30712345679', current_date, current_date - 1, 10,
      'a7000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000010', 'a7000000-0000-0000-0000-000000000020',
      'a7000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'la fecha de pago no es anterior a la emision'
);

SELECT throws_ok(
  $$INSERT INTO third_party_checks (company_id, kind, number, bank, drawer_name, drawer_cuit, issue_date, payment_date, amount,
      customer_id, portfolio_id, opening_operation_id, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'PHYSICAL', '103', 'BANCO T', 'L', '3071234567', current_date, current_date, 10,
      'a7000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000010', 'a7000000-0000-0000-0000-000000000020',
      'a7000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'el CUIT del librador tiene 11 digitos'
);

SELECT throws_ok(
  $$INSERT INTO third_party_checks (company_id, kind, number, bank, drawer_name, drawer_cuit, issue_date, payment_date, amount,
      customer_id, portfolio_id, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'PHYSICAL', '104', 'BANCO T', 'L', '30712345679', current_date, current_date, 10,
      'a7000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000010', 'a7000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un cheque viene de un recibo o de una carga inicial'
);

-- ── Estados ─────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$UPDATE third_party_checks SET status = 'DEPOSITED', bank_account_id = 'a7000000-0000-0000-0000-000000000011'
    WHERE id = 'a7000000-0000-0000-0000-000000000030'$$,
  '23514', NULL, 'un depositado lleva fecha de acreditacion'
);

SELECT throws_ok(
  $$UPDATE third_party_checks SET status = 'ENDORSED' WHERE id = 'a7000000-0000-0000-0000-000000000030'$$,
  '23514', NULL, 'un endosado lleva proveedor'
);

SELECT throws_ok(
  $$UPDATE third_party_checks SET status = 'REJECTED' WHERE id = 'a7000000-0000-0000-0000-000000000030'$$,
  '23514', NULL, 'un rechazado lleva el estado desde el que se rechazo'
);

SELECT lives_ok(
  $$UPDATE third_party_checks SET status = 'DEPOSITED', bank_account_id = 'a7000000-0000-0000-0000-000000000011', credited_on = current_date
    WHERE id = 'a7000000-0000-0000-0000-000000000030'$$,
  'un depositado con banco y acreditacion es valido'
);

-- ── Repetidos ───────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO third_party_checks (company_id, kind, number, bank, drawer_name, drawer_cuit, issue_date, payment_date, amount,
      customer_id, portfolio_id, opening_operation_id, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'PHYSICAL', '100', 'BANCO T', 'Otro', '30712345679', current_date, current_date, 10,
      'a7000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000010', 'a7000000-0000-0000-0000-000000000020',
      'a7000000-0000-0000-0000-000000000002')$$,
  '23505', NULL, 'no hay dos cheques vigentes iguales'
);

UPDATE third_party_checks SET status = 'CANCELLED', bank_account_id = NULL, credited_on = NULL
WHERE id = 'a7000000-0000-0000-0000-000000000030';

SELECT lives_ok(
  $$INSERT INTO third_party_checks (company_id, kind, number, bank, drawer_name, drawer_cuit, issue_date, payment_date, amount,
      customer_id, portfolio_id, opening_operation_id, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'PHYSICAL', '100', 'BANCO T', 'Otro', '30712345679', current_date, current_date, 10,
      'a7000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000010', 'a7000000-0000-0000-0000-000000000020',
      'a7000000-0000-0000-0000-000000000002')$$,
  'un cheque anulado no bloquea uno nuevo igual'
);

-- ── Operaciones ─────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO third_party_check_operations (company_id, kind, number, date, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'DEPOSIT', 'CD-000001', current_date, 'a7000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un deposito lleva cuenta bancaria'
);

SELECT throws_ok(
  $$INSERT INTO third_party_check_operations (company_id, kind, number, date, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'REJECTION', 'CR-000001', current_date, 'a7000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un rechazo lleva motivo y quien lo devolvio'
);

SELECT throws_ok(
  $$INSERT INTO third_party_check_operations (company_id, kind, number, date, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'OPENING', 'CI-000001', current_date, 'a7000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'la carga inicial no lleva numero'
);

INSERT INTO third_party_check_operations (company_id, kind, number, date, bank_account_id, interest, fee, created_by)
VALUES ('a7000000-0000-0000-0000-000000000001', 'DISCOUNT', 'CL-000001', current_date, 'a7000000-0000-0000-0000-000000000011', 10, 5,
        'a7000000-0000-0000-0000-000000000002');

SELECT throws_ok(
  $$INSERT INTO third_party_check_operations (company_id, kind, number, date, bank_account_id, created_by)
    VALUES ('a7000000-0000-0000-0000-000000000001', 'DISCOUNT', 'CL-000001', current_date, 'a7000000-0000-0000-0000-000000000011',
            'a7000000-0000-0000-0000-000000000002')$$,
  '23505', NULL, 'el numero de la operacion es unico por empresa y tipo'
);

-- ── Eventos ─────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO third_party_check_events (check_id, to_status, date, operation_id, receipt_id, user_id)
    SELECT 'a7000000-0000-0000-0000-000000000030', 'IN_PORTFOLIO', current_date, 'a7000000-0000-0000-0000-000000000020', r.id,
           'a7000000-0000-0000-0000-000000000002'
    FROM (SELECT gen_random_uuid() AS id) r$$,
  '23514', NULL, 'un evento tiene un solo documento de origen'
);

-- ── Recibos y ordenes de pago ───────────────────────────────────────────────
INSERT INTO customer_receipts (id, company_id, customer_id, status, date, created_by)
VALUES ('a7000000-0000-0000-0000-000000000040', 'a7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000003',
  'DRAFT', current_date, 'a7000000-0000-0000-0000-000000000002');

SELECT throws_ok(
  $$INSERT INTO customer_receipt_payments (receipt_id, method, treasury_account_id, amount)
    VALUES ('a7000000-0000-0000-0000-000000000040', 'THIRD_PARTY_CHECK', 'a7000000-0000-0000-0000-000000000010', 10)$$,
  '23514', NULL, 'un recibo no cobra con cheque de tercero endosado'
);

SELECT throws_ok(
  $$INSERT INTO customer_receipt_lines (receipt_id, position, kind, currency, applied_amount, amount_ars)
    VALUES ('a7000000-0000-0000-0000-000000000040', 0, 'REJECTED_CHECK', 'ARS', 10, 10)$$,
  '23514', NULL, 'la deuda de un cheque rechazado lleva el cheque (recibo)'
);

INSERT INTO payment_orders (id, company_id, number, supplier_id, status, planned_on, invoices_total, credits_total,
  advance_total, withholdings_total, net_total, created_by)
VALUES ('a7000000-0000-0000-0000-000000000050', 'a7000000-0000-0000-0000-000000000001', 'OP-000001',
  'a7000000-0000-0000-0000-000000000004', 'DRAFT', current_date, 0, 0, 0, 0, 0, 'a7000000-0000-0000-0000-000000000002');

SELECT throws_ok(
  $$INSERT INTO payment_order_lines (payment_order_id, position, kind, amount)
    VALUES ('a7000000-0000-0000-0000-000000000050', 1, 'REJECTED_CHECK', 10)$$,
  '23514', NULL, 'la deuda de un cheque rechazado lleva el cheque (orden de pago)'
);

SELECT throws_ok(
  $$INSERT INTO payment_order_payments (payment_order_id, method, treasury_account_id, amount)
    VALUES ('a7000000-0000-0000-0000-000000000050', 'THIRD_PARTY_CHECK', 'a7000000-0000-0000-0000-000000000010', 10)$$,
  '23514', NULL, 'un endoso lleva el cheque'
);

SELECT * FROM finish();
ROLLBACK;
