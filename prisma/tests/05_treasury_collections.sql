-- Tesoreria (etapa 2, cobranzas): reglas que viven en la base (CHECK e indices que Prisma no
-- modela, ver migracion 20261014100000_treasury_collections). El servidor valida antes y da el
-- mensaje; estos tests prueban la red de seguridad. 23514 = check_violation, 23505 = unique_violation.
BEGIN;

SELECT plan(24);

SELECT has_table('public', 'customer_receipts', 'existe customer_receipts');
SELECT has_table('public', 'customer_receipt_lines', 'existe customer_receipt_lines');
SELECT has_table('public', 'customer_receipt_withholdings', 'existe customer_receipt_withholdings');
SELECT has_table('public', 'customer_receipt_payments', 'existe customer_receipt_payments');

-- ── Datos minimos ───────────────────────────────────────────────────────────
INSERT INTO company (id, company_name, description, contact_email, contact_phone, address, city, country, industry, company_cuit)
SELECT
  'a4000000-0000-0000-0000-000000000001'::uuid,
  'pgTAP cobranzas', 'empresa de prueba', 'pgtap-cobranzas@alphataco.local', '+542991234567',
  'Calle 123', c.id, 'argentina', 'Petroleo', '30999999986'
FROM cities c
LIMIT 1;

INSERT INTO profile (id, credential_id, email)
VALUES ('a4000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000002', 'pgtap-cobranzas@alphataco.local');

INSERT INTO customers (id, company_id, name, cuit, vat_condition_id)
VALUES ('a4000000-0000-0000-0000-000000000003', 'a4000000-0000-0000-0000-000000000001', 'Cliente T', 30712345679, 1);

INSERT INTO sales_points (id, company_id, number, name)
VALUES ('a4000000-0000-0000-0000-000000000004', 'a4000000-0000-0000-0000-000000000001', 9, 'PV T');

-- Comprobante autorizado: solo UPDATE/DELETE tienen guarda, el INSERT directo es valido.
INSERT INTO invoices (id, company_id, environment, status, simulated, sales_point_id, customer_id, cbte_type, number,
  issue_date, currency, arca_currency_id, net_taxed, total, receiver_doc_number, receiver_vat_condition_id, cae, cae_due_date, authorized_at)
VALUES ('a4000000-0000-0000-0000-000000000005', 'a4000000-0000-0000-0000-000000000001', 'homologacion', 'autorizada', true,
  'a4000000-0000-0000-0000-000000000004', 'a4000000-0000-0000-0000-000000000003', 1, 1,
  current_date, 'ARS', 'PES', 1000, 1000, 30712345679, 1, '12345678901234', current_date + 10, now());

INSERT INTO treasury_accounts (id, company_id, kind, name)
VALUES ('a4000000-0000-0000-0000-000000000010', 'a4000000-0000-0000-0000-000000000001', 'BANK', 'Banco T');

INSERT INTO treasury_concepts (id, company_id, name, direction)
VALUES ('a4000000-0000-0000-0000-000000000011', 'a4000000-0000-0000-0000-000000000001', 'Varios', 'BOTH');

INSERT INTO customer_receipts (id, company_id, customer_id, number, status, date, created_by, confirmed_by, confirmed_at)
VALUES ('a4000000-0000-0000-0000-000000000020', 'a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000003',
  'RE-000001', 'CONFIRMED', current_date, 'a4000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000002', now());

INSERT INTO customer_receipts (id, company_id, customer_id, status, date, created_by)
VALUES ('a4000000-0000-0000-0000-000000000021', 'a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000003',
  'DRAFT', current_date, 'a4000000-0000-0000-0000-000000000002');

INSERT INTO customer_receipt_lines (receipt_id, position, kind, invoice_id, currency, applied_amount, amount_ars)
VALUES ('a4000000-0000-0000-0000-000000000020', 0, 'INVOICE', 'a4000000-0000-0000-0000-000000000005', 'ARS', 100, 100);

INSERT INTO customer_receipt_payments (id, receipt_id, method, treasury_account_id, amount)
VALUES ('a4000000-0000-0000-0000-000000000030', 'a4000000-0000-0000-0000-000000000020', 'TRANSFER',
  'a4000000-0000-0000-0000-000000000010', 100);

-- ── Movimientos: el origen CUSTOMER_RECEIPT ─────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, created_by)
    VALUES ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000010', current_date, 100, 'CUSTOMER_RECEIPT',
            'a4000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un cobro lleva su medio'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, customer_receipt_payment_id, concept_id, created_by)
    VALUES ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000010', current_date, 100, 'CUSTOMER_RECEIPT',
            'a4000000-0000-0000-0000-000000000030', 'a4000000-0000-0000-0000-000000000011', 'a4000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un cobro no lleva concepto'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, customer_receipt_payment_id, created_by)
    VALUES ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000010', current_date, -100, 'CUSTOMER_RECEIPT',
            'a4000000-0000-0000-0000-000000000030', 'a4000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un cobro siempre entra'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, concept_id, customer_receipt_payment_id, created_by)
    VALUES ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000010', current_date, 100, 'MANUAL',
            'a4000000-0000-0000-0000-000000000011', 'a4000000-0000-0000-0000-000000000030', 'a4000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'un manual no lleva medio de recibo'
);

SELECT lives_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, customer_receipt_payment_id, created_by)
    VALUES ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000010', current_date, 100, 'CUSTOMER_RECEIPT',
            'a4000000-0000-0000-0000-000000000030', 'a4000000-0000-0000-0000-000000000002')$$,
  'un cobro con su medio es valido'
);

SELECT throws_ok(
  $$INSERT INTO treasury_movements (company_id, account_id, date, amount, kind, customer_receipt_payment_id, created_by)
    VALUES ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000010', current_date, 100, 'CUSTOMER_RECEIPT',
            'a4000000-0000-0000-0000-000000000030', 'a4000000-0000-0000-0000-000000000002')$$,
  '23505', NULL, 'un medio tiene un solo movimiento'
);

-- ── Recibos: numero y estado ────────────────────────────────────────────────
SELECT lives_ok(
  $$INSERT INTO customer_receipts (company_id, customer_id, status, date, created_by)
    VALUES ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000003', 'DRAFT', current_date,
            'a4000000-0000-0000-0000-000000000002')$$,
  'dos borradores sin numero conviven'
);

SELECT throws_ok(
  $$INSERT INTO customer_receipts (company_id, customer_id, number, status, date, created_by, confirmed_by, confirmed_at)
    VALUES ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000003', 'RE-000001', 'CONFIRMED', current_date,
            'a4000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000002', now())$$,
  '23505', NULL, 'el numero de recibo es unico por empresa'
);

SELECT throws_ok(
  $$INSERT INTO customer_receipts (company_id, customer_id, status, date, created_by, confirmed_by, confirmed_at)
    VALUES ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000003', 'CONFIRMED', current_date,
            'a4000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000002', now())$$,
  '23514', NULL, 'un recibo confirmado tiene numero'
);

SELECT throws_ok(
  $$UPDATE customer_receipts SET status = 'CANCELLED', cancelled_by = created_by, cancelled_at = now()
    WHERE id = 'a4000000-0000-0000-0000-000000000020'$$,
  '23514', NULL, 'un recibo anulado tiene motivo'
);

SELECT throws_ok(
  $$UPDATE customer_receipts SET number = 'RE-000099' WHERE id = 'a4000000-0000-0000-0000-000000000021'$$,
  '23514', NULL, 'un borrador no tiene numero'
);

-- ── Lineas ──────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO customer_receipt_lines (receipt_id, position, kind, currency, applied_amount, amount_ars)
    VALUES ('a4000000-0000-0000-0000-000000000021', 0, 'INVOICE', 'ARS', 10, 10)$$,
  '23514', NULL, 'una linea de comprobante lleva el comprobante'
);

SELECT throws_ok(
  $$INSERT INTO customer_receipt_lines (receipt_id, position, kind, currency, applied_amount, amount_ars)
    VALUES ('a4000000-0000-0000-0000-000000000021', 0, 'ADVANCE_APPLIED', 'ARS', 10, 10)$$,
  '23514', NULL, 'un anticipo aplicado lleva su linea de origen'
);

SELECT throws_ok(
  $$INSERT INTO customer_receipt_lines (receipt_id, position, kind, currency, applied_amount, exchange_rate, amount_ars)
    VALUES ('a4000000-0000-0000-0000-000000000021', 0, 'ADVANCE', 'USD', 10, 1000, 10000)$$,
  '23514', NULL, 'un cobro a cuenta es en pesos'
);

SELECT throws_ok(
  $$INSERT INTO customer_receipt_lines (receipt_id, position, kind, invoice_id, currency, applied_amount, amount_ars)
    VALUES ('a4000000-0000-0000-0000-000000000020', 1, 'INVOICE', 'a4000000-0000-0000-0000-000000000005', 'ARS', 10, 10)$$,
  '23505', NULL, 'un comprobante aparece una vez por recibo'
);

SELECT throws_ok(
  $$INSERT INTO customer_receipt_lines (receipt_id, position, kind, invoice_id, currency, applied_amount, amount_ars)
    VALUES ('a4000000-0000-0000-0000-000000000021', 0, 'INVOICE', 'a4000000-0000-0000-0000-000000000005', 'ARS', 0, 0)$$,
  '23514', NULL, 'lo aplicado es mayor a 0'
);

-- ── Retenciones ─────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO customer_receipt_withholdings (receipt_id, company_id, customer_id, tax, certificate_number, certificate_date, amount)
    VALUES ('a4000000-0000-0000-0000-000000000021', 'a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000003',
            'IIBB', '0001', current_date, 10)$$,
  '23514', NULL, 'IIBB lleva jurisdiccion'
);

SELECT throws_ok(
  $$INSERT INTO customer_receipt_withholdings (receipt_id, company_id, customer_id, tax, jurisdiction, certificate_number, certificate_date, amount)
    VALUES ('a4000000-0000-0000-0000-000000000021', 'a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000003',
            'GANANCIAS', 'Neuquén', '0001', current_date, 10)$$,
  '23514', NULL, 'solo IIBB lleva jurisdiccion'
);

-- ── Medios ──────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO customer_receipt_payments (receipt_id, method, treasury_account_id, amount, check_due_on)
    VALUES ('a4000000-0000-0000-0000-000000000021', 'CHECK', 'a4000000-0000-0000-0000-000000000010', 10, current_date)$$,
  '23514', NULL, 'un cheque lleva numero'
);

SELECT throws_ok(
  $$INSERT INTO customer_receipt_payments (receipt_id, method, treasury_account_id, amount)
    VALUES ('a4000000-0000-0000-0000-000000000021', 'CASH', 'a4000000-0000-0000-0000-000000000010', 0)$$,
  '23514', NULL, 'un medio es mayor a 0'
);

SELECT * FROM finish();
ROLLBACK;
