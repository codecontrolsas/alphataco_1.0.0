-- Remitos: la tabla `remitos` es la única fuente del remito de una línea del parte diario
-- (migración 20261019100000_unify_remitos_source). La columna vieja `dailyreportrows.remit_number`
-- ya no existe, y el historial de la línea registra las altas, bajas y cambios de remitos y documentos.
BEGIN;

SELECT plan(9);

SELECT hasnt_column('public', 'dailyreportrows', 'remit_number', 'la columna vieja del remito ya no existe');
SELECT has_trigger('public', 'remitos', 'tr_remitos_history', 'remitos tiene trigger de historial');
SELECT has_trigger('public', 'remito_documents', 'tr_remito_documents_history', 'remito_documents tiene trigger de historial');

INSERT INTO company (id, company_name, description, contact_email, contact_phone, address, city, country, industry, company_cuit)
SELECT 'b1000000-0000-0000-0000-000000000001'::uuid, 'pgTAP remitos', 'x', 'pgtap-remitos@alphataco.local', '+542991234567',
       'Calle 123', c.id, 'argentina', 'Petroleo', '30999999992'
FROM cities c LIMIT 1;
INSERT INTO dailyreport (id, company_id, date)
VALUES ('b1000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000001', current_date);
INSERT INTO dailyreportrows (id, daily_report_id, status)
VALUES ('b1000000-0000-0000-0000-000000000020', 'b1000000-0000-0000-0000-000000000010', 'ejecutado');

CREATE TEMP VIEW remit_history AS
SELECT action_type, related_table, changed_data, changed_fields
FROM dailyreportrows_history
WHERE daily_report_row_id = 'b1000000-0000-0000-0000-000000000020'
  AND related_table IN ('remitos', 'remito_documents');

-- Alta del remito y de un documento
INSERT INTO remitos (id, daily_report_row_id, remit_number)
VALUES ('b1000000-0000-0000-0000-000000000030', 'b1000000-0000-0000-0000-000000000020', 'R-0001');
SELECT is(
  (SELECT changed_data->>'remito_numero' FROM remit_history WHERE action_type = 'LINK' AND related_table = 'remitos'),
  'R-0001',
  'el alta del remito queda en el historial de la línea con su número'
);

INSERT INTO remito_documents (id, remit_id, document_path, document_name)
VALUES ('b1000000-0000-0000-0000-000000000040', 'b1000000-0000-0000-0000-000000000030', 'x/r-0001.pdf', 'r-0001.pdf');
SELECT is(
  (SELECT changed_data->>'documento_nombre' FROM remit_history WHERE action_type = 'LINK' AND related_table = 'remito_documents'),
  'r-0001.pdf',
  'el alta de un documento queda en el historial con su nombre'
);

-- Cambio de número
UPDATE remitos SET remit_number = 'R-0002' WHERE id = 'b1000000-0000-0000-0000-000000000030';
SELECT is(
  (SELECT changed_fields->'remit_number'->>'old' || '>' || (changed_fields->'remit_number'->>'new')
     FROM remit_history WHERE action_type = 'UPDATE'),
  'R-0001>R-0002',
  'el cambio de número queda con el valor anterior y el nuevo'
);

-- Baja del remito: sus documentos caen por cascada sin duplicar la baja en el historial
DELETE FROM remitos WHERE id = 'b1000000-0000-0000-0000-000000000030';
SELECT is(
  (SELECT count(*)::int FROM remit_history WHERE action_type = 'UNLINK' AND related_table = 'remitos'),
  1,
  'la baja del remito queda en el historial'
);
SELECT is(
  (SELECT count(*)::int FROM remit_history WHERE action_type = 'UNLINK' AND related_table = 'remito_documents'),
  0,
  'los documentos que caen por cascada con el remito no generan bajas propias'
);

-- Borrar la línea con remitos no falla (no hay historial donde escribir la baja)
INSERT INTO remitos (daily_report_row_id, remit_number)
VALUES ('b1000000-0000-0000-0000-000000000020', 'R-0003');
SELECT lives_ok(
  $$DELETE FROM dailyreportrows WHERE id = 'b1000000-0000-0000-0000-000000000020'$$,
  'borrar una línea con remitos no rompe el trigger de historial'
);

SELECT * FROM finish();
ROLLBACK;
