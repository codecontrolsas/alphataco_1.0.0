-- Tesoreria (etapa 4, conciliacion bancaria): reglas que viven en la base (CHECK e indices que
-- Prisma no modela, ver migracion 20261018100000_treasury_reconciliation). 23514 = check_violation,
-- 23505 = unique_violation.
BEGIN;

SELECT plan(10);

SELECT has_table('public', 'bank_statement_lines', 'existe bank_statement_lines');

INSERT INTO company (id, company_name, description, contact_email, contact_phone, address, city, country, industry, company_cuit)
SELECT 'a9000000-0000-0000-0000-000000000001'::uuid, 'pgTAP conciliacion', 'x', 'pgtap-conc@alphataco.local', '+542991234567',
       'Calle 123', c.id, 'argentina', 'Petroleo', '30999999984'
FROM cities c LIMIT 1;
INSERT INTO profile (id, credential_id, email)
VALUES ('a9000000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-000000000002', 'pgtap-conc@alphataco.local');
INSERT INTO treasury_accounts (id, company_id, kind, name)
VALUES ('a9000000-0000-0000-0000-000000000011', 'a9000000-0000-0000-0000-000000000001', 'BANK', 'Banco T');
INSERT INTO treasury_concepts (id, company_id, name, direction)
VALUES ('a9000000-0000-0000-0000-000000000012', 'a9000000-0000-0000-0000-000000000001', 'Varios', 'BOTH');
INSERT INTO treasury_movements (id, company_id, account_id, date, amount, kind, concept_id, created_by)
VALUES ('a9000000-0000-0000-0000-000000000013', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000011',
        current_date, -100, 'MANUAL', 'a9000000-0000-0000-0000-000000000012', 'a9000000-0000-0000-0000-000000000002');
INSERT INTO bank_statements (id, company_id, account_id, file_name, date_from, date_to, line_count, created_by)
VALUES ('a9000000-0000-0000-0000-000000000020', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000011',
        'x.csv', current_date, current_date, 1, 'a9000000-0000-0000-0000-000000000002');
INSERT INTO bank_statement_lines (id, statement_id, company_id, account_id, row_number, date, description, amount, line_key)
VALUES ('a9000000-0000-0000-0000-000000000030', 'a9000000-0000-0000-0000-000000000020', 'a9000000-0000-0000-0000-000000000001',
        'a9000000-0000-0000-0000-000000000011', 2, current_date, 'Comision', -100, 'k1');

-- ── Perfil ──────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO bank_statement_profiles (company_id, account_id, header_row, date_column, description_column, amount_column, debit_column, credit_column, date_format, decimal_separator, updated_by)
    VALUES ('a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000011', 1, 'A', 'B', 'C', 'D', 'E', 'DD/MM/YYYY', ',', 'a9000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'el importe va en una columna o en debito y credito, no en las dos'
);
SELECT throws_ok(
  $$INSERT INTO bank_statement_profiles (company_id, account_id, header_row, date_column, description_column, amount_column, date_format, decimal_separator, updated_by)
    VALUES ('a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000011', 1, 'A', 'B', 'C', 'DD.MM.YYYY', ',', 'a9000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'el formato de fecha es uno de los cuatro'
);

-- ── Lineas ──────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO bank_statement_lines (statement_id, company_id, account_id, row_number, date, description, amount, line_key)
    VALUES ('a9000000-0000-0000-0000-000000000020', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000011', 3, current_date, 'Cero', 0, 'k0')$$,
  '23514', NULL, 'una linea no tiene importe 0'
);
SELECT throws_ok(
  $$INSERT INTO bank_statement_lines (statement_id, company_id, account_id, row_number, date, description, amount, line_key)
    VALUES ('a9000000-0000-0000-0000-000000000020', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000011', 3, current_date, 'Rep', -100, 'k1')$$,
  '23505', NULL, 'una linea no se importa dos veces en la cuenta'
);
SELECT throws_ok(
  $$UPDATE bank_statement_lines SET status = 'MATCHED' WHERE id = 'a9000000-0000-0000-0000-000000000030'$$,
  '23514', NULL, 'una conciliada lleva su movimiento'
);
SELECT throws_ok(
  $$UPDATE bank_statement_lines SET status = 'IGNORED', reconciled_at = now(), reconciled_by = 'a9000000-0000-0000-0000-000000000002'
    WHERE id = 'a9000000-0000-0000-0000-000000000030'$$,
  '23514', NULL, 'una ignorada lleva motivo'
);
SELECT lives_ok(
  $$UPDATE bank_statement_lines SET status = 'MATCHED', movement_id = 'a9000000-0000-0000-0000-000000000013', reconciled_at = now(),
      reconciled_by = 'a9000000-0000-0000-0000-000000000002' WHERE id = 'a9000000-0000-0000-0000-000000000030'$$,
  'una conciliada con su movimiento es valida'
);
SELECT throws_ok(
  $$INSERT INTO bank_statement_lines (statement_id, company_id, account_id, row_number, date, description, amount, line_key, status, movement_id, reconciled_at, reconciled_by)
    VALUES ('a9000000-0000-0000-0000-000000000020', 'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000011', 4, current_date, 'Otra', -100, 'k2',
            'MATCHED', 'a9000000-0000-0000-0000-000000000013', now(), 'a9000000-0000-0000-0000-000000000002')$$,
  '23505', NULL, 'un movimiento se concilia con una sola linea'
);
SELECT throws_ok(
  $$UPDATE bank_statement_lines SET status = 'PENDING' WHERE id = 'a9000000-0000-0000-0000-000000000030'$$,
  '23514', NULL, 'una pendiente no tiene movimiento'
);

SELECT * FROM finish();
ROLLBACK;
