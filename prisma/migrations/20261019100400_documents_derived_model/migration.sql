-- M1: documentos al modelo derivado. Idempotente.
-- Las filas "pendiente" sin archivo dejan de existir (el faltante se deriva de los tipos obligatorios),
-- el status de employees/vehicles lo escribe solo el motor (refreshDocumentStatus + job documents-status)
-- y los 12 triggers de documentos se eliminan. Las funciones (controlar_alertas_*, update_status_trigger,
-- trg_*, recalcular_status_documentacion, build_*_where_alias, get_documents_expiry_summary) se CONSERVAN
-- para el rollback; las retira M2. No hay UPDATE masivo de status: lo recalcula el job.

-- 1. Respaldo de las filas vacias (y de sus logs, que se van por ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS public._bak_documents_empty_20261019 (
  source      text        NOT NULL,
  row_id      uuid        NOT NULL,
  row_data    jsonb       NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, row_id)
);
CREATE TABLE IF NOT EXISTS public._bak_documents_empty_logs_20261019 (
  source      text        NOT NULL,
  log_id      integer     NOT NULL,
  row_data    jsonb       NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, log_id)
);

INSERT INTO public._bak_documents_empty_20261019 (source, row_id, row_data)
SELECT 'documents_employees', d.id, to_jsonb(d) FROM public.documents_employees d
WHERE d.state = 'pendiente' AND COALESCE(d.document_path, '') = ''
ON CONFLICT DO NOTHING;
INSERT INTO public._bak_documents_empty_20261019 (source, row_id, row_data)
SELECT 'documents_equipment', d.id, to_jsonb(d) FROM public.documents_equipment d
WHERE d.state = 'pendiente' AND COALESCE(d.document_path, '') = ''
ON CONFLICT DO NOTHING;
INSERT INTO public._bak_documents_empty_20261019 (source, row_id, row_data)
SELECT 'documents_company', d.id, to_jsonb(d) FROM public.documents_company d
WHERE d.state = 'pendiente' AND COALESCE(d.document_path, '') = ''
ON CONFLICT DO NOTHING;

INSERT INTO public._bak_documents_empty_logs_20261019 (source, log_id, row_data)
SELECT 'documents_employees_logs', l.id, to_jsonb(l)
FROM public.documents_employees_logs l
JOIN public.documents_employees d ON d.id = l.documents_employees_id
WHERE d.state = 'pendiente' AND COALESCE(d.document_path, '') = ''
ON CONFLICT DO NOTHING;
INSERT INTO public._bak_documents_empty_logs_20261019 (source, log_id, row_data)
SELECT 'documents_equipment_logs', l.id, to_jsonb(l)
FROM public.documents_equipment_logs l
JOIN public.documents_equipment d ON d.id = l.documents_equipment_id
WHERE d.state = 'pendiente' AND COALESCE(d.document_path, '') = ''
ON CONFLICT DO NOTHING;

-- 2. Triggers de documentos (12). Se conservan los de auditoria:
--    document_employee_changes_trigger y document_equipment_changes_trigger.
DROP TRIGGER IF EXISTS controlar_alertas_employees        ON public.employees;
DROP TRIGGER IF EXISTS controlar_alertas_employees_insert ON public.employees;
DROP TRIGGER IF EXISTS controlar_alertas_vehicles         ON public.vehicles;
DROP TRIGGER IF EXISTS controlar_alertas_vehicles_insert  ON public.vehicles;
DROP TRIGGER IF EXISTS document_types_after_insert        ON public.document_types;
DROP TRIGGER IF EXISTS document_types_after_update        ON public.document_types;
DROP TRIGGER IF EXISTS trg_update_documents_employees     ON public.documents_employees;
DROP TRIGGER IF EXISTS trg_update_documents_employees_ins ON public.documents_employees;
DROP TRIGGER IF EXISTS trg_update_documents_employees_del ON public.documents_employees;
DROP TRIGGER IF EXISTS trg_update_documents_equipment     ON public.documents_equipment;
DROP TRIGGER IF EXISTS trg_update_documents_equipment_ins ON public.documents_equipment;
DROP TRIGGER IF EXISTS trg_update_documents_equipment_del ON public.documents_equipment;

-- 3. Filas vacias: solo 'pendiente' sin archivo. Las filas con archivo (incluidas las archivadas con
--    archived_at) y las sin archivo en otro estado NO se tocan.
DELETE FROM public.documents_employees WHERE state = 'pendiente' AND COALESCE(document_path, '') = '';
DELETE FROM public.documents_equipment WHERE state = 'pendiente' AND COALESCE(document_path, '') = '';
DELETE FROM public.documents_company   WHERE state = 'pendiente' AND COALESCE(document_path, '') = '';

-- 4. Indices para las consultas del motor (por recurso y por tipo).
CREATE INDEX IF NOT EXISTS idx_documents_employees_applies_type ON public.documents_employees (applies, id_document_types);
CREATE INDEX IF NOT EXISTS idx_documents_employees_type         ON public.documents_employees (id_document_types);
CREATE INDEX IF NOT EXISTS idx_documents_equipment_applies_type ON public.documents_equipment (applies, id_document_types);
CREATE INDEX IF NOT EXISTS idx_documents_equipment_type         ON public.documents_equipment (id_document_types);
