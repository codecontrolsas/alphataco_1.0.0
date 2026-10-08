-- Almacenes (etapa 1): tablas y las reglas que viven SOLO en la base (CHECK e indices que
-- Prisma no modela, ver migracion 20261004100000_warehouses_core). El motor de stock valida
-- antes y da el mensaje; estos tests prueban la red de seguridad.
-- 23514 = check_violation, 23505 = unique_violation.
BEGIN;

SELECT plan(35);

SELECT has_table('public', 'warehouses', 'existe warehouses');
SELECT has_table('public', 'material_categories', 'existe material_categories');
SELECT has_table('public', 'measurement_units', 'existe measurement_units');
SELECT has_table('public', 'materials', 'existe materials');
SELECT has_table('public', 'material_batches', 'existe material_batches');
SELECT has_table('public', 'material_units', 'existe material_units');
SELECT has_table('public', 'stock_balances', 'existe stock_balances');
SELECT has_table('public', 'stock_movements', 'existe stock_movements');
SELECT has_table('public', 'stock_movement_lines', 'existe stock_movement_lines');

-- ── Datos minimos ───────────────────────────────────────────────────────────
INSERT INTO company (id, company_name, description, contact_email, contact_phone, address, city, country, industry, company_cuit)
SELECT
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'pgTAP almacenes', 'empresa de prueba', 'pgtap-almacenes@alphataco.local', '+542991234567',
  'Calle 123', c.id, 'argentina', 'Petroleo', '30999999985'
FROM cities c
LIMIT 1;

INSERT INTO profile (id, credential_id, email)
VALUES ('a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'pgtap-almacenes@alphataco.local');

INSERT INTO measurement_units (id, company_id, name, abbreviation)
VALUES ('a1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'Unidad pgTAP', 'upg');

INSERT INTO warehouses (id, company_id, code, name) VALUES
  ('a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001', 'D1', 'Deposito 1'),
  ('a1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'D2', 'Deposito 2');

INSERT INTO materials (id, company_id, code, name, unit_id)
VALUES ('a1000000-0000-0000-0000-000000000020', 'a1000000-0000-0000-0000-000000000001', 'M1', 'Material 1', 'a1000000-0000-0000-0000-000000000003');

INSERT INTO stock_balances (company_id, material_id, warehouse_id, quantity)
VALUES ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000020', 'a1000000-0000-0000-0000-000000000010', 5);

-- ── Saldos ──────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$UPDATE stock_balances SET quantity = -1 WHERE material_id = 'a1000000-0000-0000-0000-000000000020'$$,
  '23514', NULL, 'el saldo no puede quedar negativo'
);

SELECT throws_ok(
  $$INSERT INTO stock_balances (company_id, material_id, warehouse_id, quantity)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000020', 'a1000000-0000-0000-0000-000000000010', 1)$$,
  '23505', NULL, 'un solo saldo por material+deposito aunque el lote sea NULL (NULLS NOT DISTINCT)'
);

-- ── Movimientos ─────────────────────────────────────────────────────────────
SELECT lives_ok(
  $$INSERT INTO stock_movements (id, company_id, number, type, warehouse_id, occurred_on, created_by)
    VALUES ('a1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000001', 'MOV-000001', 'ENTRY',
            'a1000000-0000-0000-0000-000000000010', CURRENT_DATE, 'a1000000-0000-0000-0000-000000000002')$$,
  'una entrada sin destino es valida'
);

SELECT throws_ok(
  $$INSERT INTO stock_movements (company_id, number, type, warehouse_id, occurred_on, created_by)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'MOV-T1', 'EXIT',
            'a1000000-0000-0000-0000-000000000010', CURRENT_DATE, 'a1000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'una salida sin destino se rechaza'
);

SELECT throws_ok(
  $$INSERT INTO stock_movements (company_id, number, type, warehouse_id, occurred_on, created_by, destination_type)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'MOV-T2', 'EXIT',
            'a1000000-0000-0000-0000-000000000010', CURRENT_DATE, 'a1000000-0000-0000-0000-000000000002', 'CUSTOMER')$$,
  '23514', NULL, 'una salida con tipo de destino pero sin la FK correspondiente se rechaza'
);

SELECT throws_ok(
  $$INSERT INTO stock_movements (company_id, number, type, warehouse_id, occurred_on, created_by)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'MOV-T3', 'TRANSFER',
            'a1000000-0000-0000-0000-000000000010', CURRENT_DATE, 'a1000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'una transferencia sin deposito destino se rechaza'
);

SELECT throws_ok(
  $$INSERT INTO stock_movements (company_id, number, type, warehouse_id, target_warehouse_id, occurred_on, created_by)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'MOV-T4', 'TRANSFER',
            'a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000010',
            CURRENT_DATE, 'a1000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'una transferencia al mismo deposito se rechaza'
);

SELECT throws_ok(
  $$INSERT INTO stock_movements (company_id, number, type, warehouse_id, occurred_on, created_by, customer_service_id)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'MOV-T5', 'ENTRY',
            'a1000000-0000-0000-0000-000000000010', CURRENT_DATE, 'a1000000-0000-0000-0000-000000000002',
            'a1000000-0000-0000-0000-0000000000ff')$$,
  '23514', NULL, 'un contrato sin cliente se rechaza'
);

-- Anulaciones: una sola por movimiento.
SELECT lives_ok(
  $$INSERT INTO stock_movements (company_id, number, type, warehouse_id, occurred_on, created_by, reverses_movement_id, notes)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'MOV-000002', 'ENTRY',
            'a1000000-0000-0000-0000-000000000010', CURRENT_DATE, 'a1000000-0000-0000-0000-000000000002',
            'a1000000-0000-0000-0000-000000000030', 'error de carga')$$,
  'se puede anular un movimiento'
);

SELECT throws_ok(
  $$INSERT INTO stock_movements (company_id, number, type, warehouse_id, occurred_on, created_by, reverses_movement_id, notes)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'MOV-000003', 'ENTRY',
            'a1000000-0000-0000-0000-000000000010', CURRENT_DATE, 'a1000000-0000-0000-0000-000000000002',
            'a1000000-0000-0000-0000-000000000030', 'otra vez')$$,
  '23505', NULL, 'no se puede anular dos veces el mismo movimiento'
);

-- ── Lineas ──────────────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO stock_movement_lines (movement_id, material_id, quantity, direction, unit_cost, total_cost)
    VALUES ('a1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000020', 0, 1, 10, 0)$$,
  '23514', NULL, 'una linea con cantidad 0 se rechaza'
);

SELECT throws_ok(
  $$INSERT INTO stock_movement_lines (movement_id, material_id, quantity, direction, unit_cost, total_cost)
    VALUES ('a1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000020', 1, 2, 10, 10)$$,
  '23514', NULL, 'direction solo admite +1 o -1'
);

-- ── Unidades serializadas ───────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO material_units (company_id, material_id, serial_number, status)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000020', 'S-1', 'IN_STOCK')$$,
  '23514', NULL, 'una unidad en stock sin deposito se rechaza'
);

SELECT throws_ok(
  $$INSERT INTO material_units (company_id, material_id, serial_number, status, warehouse_id)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000020', 'S-2', 'OUT',
            'a1000000-0000-0000-0000-000000000010')$$,
  '23514', NULL, 'una unidad entregada no puede tener deposito'
);

-- ── Etapa 2: devoluciones y bajas ───────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO stock_movements (company_id, number, type, warehouse_id, occurred_on, created_by)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'MOV-R1', 'RETURN',
            'a1000000-0000-0000-0000-000000000010', CURRENT_DATE, 'a1000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'una devolucion sin destino ni salida de origen se rechaza'
);

SELECT throws_ok(
  $$INSERT INTO stock_movements (company_id, number, type, warehouse_id, occurred_on, created_by, returned_from_movement_id)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'MOV-R2', 'ENTRY',
            'a1000000-0000-0000-0000-000000000010', CURRENT_DATE, 'a1000000-0000-0000-0000-000000000002',
            'a1000000-0000-0000-0000-000000000030')$$,
  '23514', NULL, 'solo una devolucion apunta a una salida de origen'
);

INSERT INTO material_units (id, company_id, material_id, serial_number, status)
VALUES ('a1000000-0000-0000-0000-000000000040', 'a1000000-0000-0000-0000-000000000001',
        'a1000000-0000-0000-0000-000000000020', 'S-LOAN', 'OUT');

INSERT INTO material_unit_write_offs (company_id, unit_id, loan_movement_id, reason, notes, created_by)
VALUES ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000040',
        'a1000000-0000-0000-0000-000000000030', 'LOST', 'extraviada en locacion', 'a1000000-0000-0000-0000-000000000002');

SELECT throws_ok(
  $$INSERT INTO material_unit_write_offs (company_id, unit_id, loan_movement_id, reason, notes, created_by)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000040',
            'a1000000-0000-0000-0000-000000000030', 'BROKEN', 'otra vez', 'a1000000-0000-0000-0000-000000000002')$$,
  '23505', NULL, 'un mismo prestamo no se da de baja dos veces'
);

SELECT throws_ok(
  $$INSERT INTO material_unit_write_offs (company_id, unit_id, loan_movement_id, reason, notes, created_by)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000040',
            'a1000000-0000-0000-0000-000000000011', 'LOST', '   ', 'a1000000-0000-0000-0000-000000000002')$$,
  '23514', NULL, 'una baja sin detalle se rechaza'
);

-- ── Etapa 3: pedidos ────────────────────────────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO material_requests (company_id, number, requested_by, destination_type)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'PED-T1', 'a1000000-0000-0000-0000-000000000002', 'EMPLOYEE')$$,
  '23514', NULL, 'un pedido con tipo de destino pero sin la FK se rechaza'
);

SELECT throws_ok(
  $$INSERT INTO stock_movements (company_id, number, type, warehouse_id, occurred_on, created_by, material_request_id)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'MOV-P1', 'ENTRY',
            'a1000000-0000-0000-0000-000000000010', CURRENT_DATE, 'a1000000-0000-0000-0000-000000000002',
            'a1000000-0000-0000-0000-000000000099')$$,
  '23514', NULL, 'solo una salida puede ser la entrega de un pedido'
);

SELECT throws_ok(
  $$INSERT INTO material_request_lines (request_id, material_id, quantity)
    VALUES ('a1000000-0000-0000-0000-000000000099', 'a1000000-0000-0000-0000-000000000020', 0)$$,
  '23514', NULL, 'una linea de pedido con cantidad 0 se rechaza'
);

-- ── Etapa 4: pedidos desde una OT ───────────────────────────────────────────
-- Destino valido (empleado con su FK) para que el unico CHECK que falle sea el de la OT; las FK
-- se verifican despues de los CHECK, asi que los uuid no necesitan existir.
SELECT throws_ok(
  $$INSERT INTO material_requests (company_id, number, requested_by, destination_type, employee_id, work_order_id)
    VALUES ('a1000000-0000-0000-0000-000000000001', 'PED-T2', 'a1000000-0000-0000-0000-000000000002', 'EMPLOYEE',
            'a1000000-0000-0000-0000-000000000098', 'a1000000-0000-0000-0000-000000000097')$$,
  '23514', 'new row for relation "material_requests" violates check constraint "material_requests_work_order_check"',
  'una OT solo va en un pedido a una orden de mantenimiento'
);

-- ── Etapa 5: ropa ───────────────────────────────────────────────────────────
-- Anulacion a medias (fecha sin quien ni motivo). Los demas campos no importan: el CHECK falla
-- antes que las FK.
SELECT throws_ok(
  $$INSERT INTO clothing_deliveries (employee_id, delivered_by_id, delivery_type, delivered_at, company_id, cancelled_at)
    VALUES ('a1000000-0000-0000-0000-000000000096', 'a1000000-0000-0000-0000-000000000096', 'REPLACEMENT', now(),
            'a1000000-0000-0000-0000-000000000001', now())$$,
  '23514', NULL, 'una anulacion de entrega tiene fecha, quien y motivo juntos'
);

-- Un material no puede ser de dos combinaciones de ropa.
SELECT throws_ok(
  $$INSERT INTO clothing_item_materials (company_id, clothing_item_id, clothing_brand_id, clothing_size_id, material_id)
    VALUES ('a1000000-0000-0000-0000-000000000001', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'a1000000-0000-0000-0000-000000000020'),
           ('a1000000-0000-0000-0000-000000000001', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'a1000000-0000-0000-0000-000000000020')$$,
  '23505', NULL, 'un material es de una sola combinacion de ropa'
);

-- ── Etapa 6: cubiertas ──────────────────────────────────────────────────────
-- Un material es de una sola combinacion tipo + marca (la unicidad falla antes que las FK).
SELECT throws_ok(
  $$INSERT INTO tire_materials (company_id, tire_type_id, tire_brand_id, material_id)
    VALUES ('a1000000-0000-0000-0000-000000000001', gen_random_uuid(), gen_random_uuid(), 'a1000000-0000-0000-0000-000000000020'),
           ('a1000000-0000-0000-0000-000000000001', gen_random_uuid(), gen_random_uuid(), 'a1000000-0000-0000-0000-000000000020')$$,
  '23505', NULL, 'un material es de una sola combinacion de cubiertas'
);

-- Una unidad de stock es de una sola cubierta.
SELECT throws_ok(
  $$INSERT INTO tires (serial_number, brand_id, tire_type_id, company_id, updated_at, material_unit_id)
    VALUES ('T-1', gen_random_uuid(), gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', now(), 'a1000000-0000-0000-0000-000000000095'),
           ('T-2', gen_random_uuid(), gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', now(), 'a1000000-0000-0000-0000-000000000095')$$,
  '23505', NULL, 'una unidad de stock es de una sola cubierta'
);

SELECT * FROM finish();
ROLLBACK;
