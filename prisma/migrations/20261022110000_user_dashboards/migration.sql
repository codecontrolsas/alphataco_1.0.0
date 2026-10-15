-- Tableros personales del Dashboard: uno o varios por usuario y empresa.
-- `layout` = lista ordenada [{ "widgetId": "...", "size": "xs|sm|md|lg|xl|full" }]; la valida la
-- server action contra el registro de widgets (src/features/Dashboard/lib/widget-registry.ts).

CREATE TABLE "user_dashboards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "template" VARCHAR(40),
    "layout" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_dashboards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_dashboards_layout_is_array_ck" CHECK (jsonb_typeof("layout") = 'array'),
    CONSTRAINT "user_dashboards_name_not_blank_ck" CHECK (btrim("name") <> '')
);

CREATE INDEX "idx_user_dashboards_user_company_position" ON "user_dashboards"("user_id", "company_id", "position");

CREATE UNIQUE INDEX "user_dashboards_user_company_name_key" ON "user_dashboards"("user_id", "company_id", "name");

ALTER TABLE "user_dashboards" ADD CONSTRAINT "user_dashboards_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_dashboards" ADD CONSTRAINT "user_dashboards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
