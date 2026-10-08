-- Almacenes etapa 4: el pedido de materiales recuerda la OT desde la que se pidio.

ALTER TABLE "material_requests" ADD COLUMN "work_order_id" UUID;

CREATE INDEX "idx_material_requests_work_order" ON "material_requests"("work_order_id");

ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Una OT solo tiene sentido en un pedido imputado a una orden de mantenimiento. Que la OT sea
-- de ESA orden se valida en codigo: la relacion OT -> orden pasa por work_order_items.
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_work_order_check"
  CHECK ("work_order_id" IS NULL OR "destination_type" = 'MAINTENANCE_ORDER');
