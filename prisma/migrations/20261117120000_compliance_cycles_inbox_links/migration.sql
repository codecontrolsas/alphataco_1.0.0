-- Ticket 842: ciclos mensuales (F.931, sindicales, planes de pago, recibos) con cruce nómina / boleta / pago y rechazos
-- por cliente; links de carga externa (estudio contable, consultora) y bandeja de entrada de documentos subidos por
-- externos o leídos por la IA, pendientes de validar. Todas las tablas por empresa con aislamiento RLS.

CREATE TABLE public.monthly_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.app_current_company_id(),
  kind text NOT NULL CHECK (kind IN ('f931', 'sindical', 'plan_pago', 'recibos')),
  -- Sindicato, número de plan, etc. Vacío para F.931 y recibos.
  label text NOT NULL DEFAULT '',
  period char(7) NOT NULL CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  declared_headcount integer CHECK (declared_headcount >= 0),
  declared_amount numeric(15, 2) CHECK (declared_amount >= 0),
  slip_amount numeric(15, 2) CHECK (slip_amount >= 0),
  paid_amount numeric(15, 2) CHECK (paid_amount >= 0),
  declaration_path text,
  slip_path text,
  payment_path text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, kind, label, period)
);
CREATE INDEX idx_monthly_cycles_company_period ON public.monthly_cycles (company_id, period DESC);
SELECT public.app_enable_tenant_isolation('public.monthly_cycles');
-- Con Documentación apagada para la empresa, la tabla no se ve (compuerta de módulo, prisma/sql/modules.sql).
SELECT public.app_enable_module_gate('public.monthly_cycles', ARRAY['documentacion']::text[]);

CREATE TABLE public.monthly_cycle_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.app_current_company_id(),
  cycle_id uuid NOT NULL REFERENCES public.monthly_cycles (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  reason text NOT NULL,
  rejected_by uuid,
  rejected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text
);
CREATE INDEX idx_monthly_cycle_rejections_cycle ON public.monthly_cycle_rejections (cycle_id);
CREATE INDEX idx_monthly_cycle_rejections_company ON public.monthly_cycle_rejections (company_id);
SELECT public.app_enable_tenant_isolation('public.monthly_cycle_rejections');
-- Con Documentación apagada para la empresa, la tabla no se ve (compuerta de módulo, prisma/sql/modules.sql).
SELECT public.app_enable_module_gate('public.monthly_cycle_rejections', ARRAY['documentacion']::text[]);

CREATE TABLE public.external_upload_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.app_current_company_id(),
  -- Para quién es: "Estudio contable Pérez", "Consultora HSE".
  label text NOT NULL,
  -- Qué puede cargar: documentos de personal, de equipos o de ambos.
  scope text NOT NULL CHECK (scope IN ('Persona', 'Equipos', 'Ambos')),
  -- SHA-256 del token: el token en claro solo se muestra al crearlo.
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  uploads_count integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_external_upload_links_company ON public.external_upload_links (company_id);
SELECT public.app_enable_tenant_isolation('public.external_upload_links');
-- Con Documentación apagada para la empresa, la tabla no se ve (compuerta de módulo, prisma/sql/modules.sql).
SELECT public.app_enable_module_gate('public.external_upload_links', ARRAY['documentacion']::text[]);

CREATE TABLE public.document_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.app_current_company_id(),
  -- ai = carga con IA desde la app; external = link de carga externa.
  source text NOT NULL CHECK (source IN ('ai', 'external')),
  link_id uuid REFERENCES public.external_upload_links (id) ON DELETE SET NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  -- validating = reclamado por quien lo está validando (evita crear el documento dos veces).
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validating', 'validated', 'discarded')),
  resource_kind text CHECK (resource_kind IN ('Persona', 'Equipos')),
  resource_id uuid,
  document_type_id uuid,
  validity date,
  period char(7),
  -- Por qué quedó pendiente (se muestra al validar).
  reason text,
  -- Lo que leyó la IA (tipo, titular, vencimiento, identificadores) y su confianza.
  extracted jsonb,
  uploader_name text,
  document_id uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_inbox_company_status ON public.document_inbox (company_id, status, created_at DESC);
SELECT public.app_enable_tenant_isolation('public.document_inbox');
-- Con Documentación apagada para la empresa, la tabla no se ve (compuerta de módulo, prisma/sql/modules.sql).
SELECT public.app_enable_module_gate('public.document_inbox', ARRAY['documentacion']::text[]);
