-- Presets del Dashboard (#802): un tablero guardado (`user_dashboards`) pasa a ser un preset con alcance.
--   private  = solo su dueño (lo que había hasta ahora: todas las filas existentes quedan así).
--   company  = toda la organización (la empresa del tablero).
--   users    = los usuarios puntuales de `user_dashboard_shares`.
-- Solo el dueño lo modifica o lo borra; los demás lo ven y lo pueden duplicar como propio.

ALTER TABLE "user_dashboards"
  ADD COLUMN "visibility" VARCHAR(20) NOT NULL DEFAULT 'private',
  ADD CONSTRAINT "user_dashboards_visibility_ck" CHECK ("visibility" IN ('private', 'company', 'users'));

CREATE INDEX "idx_user_dashboards_company_visibility" ON "user_dashboards"("company_id", "visibility");

CREATE TABLE "user_dashboard_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL DEFAULT public.app_current_company_id(),
    "dashboard_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_dashboard_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_dashboard_shares_dashboard_user_key" ON "user_dashboard_shares"("dashboard_id", "user_id");
CREATE INDEX "idx_user_dashboard_shares_user_company" ON "user_dashboard_shares"("user_id", "company_id");

ALTER TABLE "user_dashboard_shares" ADD CONSTRAINT "user_dashboard_shares_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "user_dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_dashboard_shares" ADD CONSTRAINT "user_dashboard_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_dashboard_shares" ADD CONSTRAINT "user_dashboard_shares_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Aislamiento por empresa (mismo helper que el resto de las tablas de negocio).
SELECT public.app_enable_tenant_isolation('public.user_dashboard_shares');

-- Además del aislamiento por empresa (`tenant_isolation`, ya activo en `user_dashboards`), políticas RESTRICTIVAS por
-- usuario: se combinan con AND. Ver: el dueño, los de toda la organización o los compartidos con el usuario de la
-- transacción. Escribir: solo el dueño. `user_dashboard_shares` solo tiene aislamiento por empresa, así la consulta de
-- la política no vuelve a `user_dashboards` (sin recursión de políticas).
DROP POLICY IF EXISTS dashboard_preset_read ON public.user_dashboards;
CREATE POLICY dashboard_preset_read ON public.user_dashboards AS RESTRICTIVE FOR SELECT USING (
  user_id = public.app_current_user_id()
  OR visibility = 'company'
  OR (
    visibility = 'users'
    AND EXISTS (
      SELECT 1 FROM public.user_dashboard_shares s
      WHERE s.dashboard_id = user_dashboards.id AND s.user_id = public.app_current_user_id()
    )
  )
);
DROP POLICY IF EXISTS dashboard_preset_insert ON public.user_dashboards;
CREATE POLICY dashboard_preset_insert ON public.user_dashboards AS RESTRICTIVE FOR INSERT
  WITH CHECK (user_id = public.app_current_user_id());
DROP POLICY IF EXISTS dashboard_preset_update ON public.user_dashboards;
CREATE POLICY dashboard_preset_update ON public.user_dashboards AS RESTRICTIVE FOR UPDATE
  USING (user_id = public.app_current_user_id()) WITH CHECK (user_id = public.app_current_user_id());
DROP POLICY IF EXISTS dashboard_preset_delete ON public.user_dashboards;
CREATE POLICY dashboard_preset_delete ON public.user_dashboards AS RESTRICTIVE FOR DELETE
  USING (user_id = public.app_current_user_id());
