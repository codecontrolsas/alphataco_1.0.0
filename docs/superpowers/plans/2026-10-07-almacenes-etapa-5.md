# Almacenes — Etapa 5 (ropa que descuenta stock) — Plan de implementación

**Spec:** `docs/superpowers/specs/2026-10-07-almacenes-etapa-5-design.md` (fuente de verdad).
**Base:** rama `feat/almacenes-etapa-1` (etapas 1 a 4 commiteadas; merge de `main` en `276fbb92`). Las restricciones globales y el criterio de "tarea terminada" son los del plan de la etapa 1.

## Notas que condicionan el orden

- **El catálogo de Ropa crea materiales.** `syncClothingMaterials` vive en Warehouses (`lib/clothing-materials.ts`) y escribe `materials` y `material_categories`. No toca stock: el motor sigue siendo el único escritor de saldos y costo promedio.
- **Actor del movimiento:** `ClothingOperator` expone `userId` (`credential_id`) y `employeeId`, pero el motor necesita `profile.id`. `requireClothingOperator` suma `profileId` (en este proyecto coincide con el `credential_id`, pero se resuelve igual que en `OperatorPanel/perimeter.ts`, sin asumirlo).
- **Orden de locks de la anulación:** entrega de ropa (`FOR UPDATE`) → movimiento original → … (el resto lo toma `reverseStockMovement`).
- **DataTables** (historial del empleado y reporte global): las modifica el agente `table-expert` (Task 4).
- **Migración de datos:** crea la categoría "Ropa" por empresa y los materiales de todas las combinaciones existentes con SQL, con la misma regla de código que `lib/clothing-material-code.ts` (la regla se escribe una vez en TS y la migración la replica; el test de la Task 1 compara ambas sobre los mismos casos).

## Revisión: riesgos que los tests de cada tarea tienen que cubrir

- Dos combinaciones cuyo código derivado coincide (artículo sin código con nombres parecidos, marcas con la misma abreviatura): sufijo `-2`, sin choque de unicidad.
- Renombrar o desactivar un artículo, una marca o un talle con combinaciones que ya tienen stock: el material se renombra o se desactiva, nunca se borra y conserva su historial.
- Una entrega con dos líneas de la misma combinación: una sola línea de stock con la suma, y el control de stock sobre el total.
- Anular una entrega cuya salida ya se anuló desde Almacenes: la entrega se marca igual, sin error.
- Un operario que manda un `warehouseId` de otra empresa, o un depósito inactivo: rechazado.

---

### Task 1: Esquema, migración y materiales de la matriz

**Files:**
- Modify: `prisma/schema.prisma`:
  - modelo `clothing_item_materials` (vínculo combinación → material, único por combinación y por material, nunca se borra);
  - `clothing_deliveries.warehouse_id`, `stock_movement_id` (único), `cancelled_at`, `cancelled_by` y `cancel_reason`;
  - relaciones inversas en `materials`, `warehouses`, `stock_movements` y `profile`.
- Create: `prisma/migrations/20261007200000_clothing_stock/migration.sql`:
  - columnas, FK, índices y únicos;
  - CHECK `clothing_deliveries_cancel_check`;
  - categoría "Ropa" por empresa con catálogo de ropa;
  - materiales de las combinaciones existentes (código según la regla de la Task 1, sufijos ante colisión) y sus filas en `clothing_item_materials`;
  - la acción `delete` en `indumentaria_empleado` para los 3 roles de sistema.
- Modify: `src/features/Permissions/permissions-map.ts` (`indumentaria_empleado.allowedActions` suma `delete`).
- Create: `src/features/Warehouses/lib/clothing-material-code.ts` + `.test.ts`: `clothingMaterialCode({ itemCode, itemName, brandName, sizeName }, taken: Set<string>)` → código en mayúsculas sin espacios, con sufijo ante colisión; `clothingMaterialName(...)` → "Camisa · Ombú · 42".
- Create: `src/features/Warehouses/lib/clothing-materials.ts` (`server-only`): `syncClothingMaterials(tx, companyId, { itemId?, brandId?, sizeId? })`. Crea los materiales que faltan y sincroniza nombre y `is_active` de los existentes del alcance indicado.
- Modify: `src/features/Clothing/actions/catalog.server.ts`. `setItemBrandSizes` pasa de borrar y reinsertar a insertar y borrar solo la diferencia; ella, `update*` y `toggle*Active` de artículos, marcas y talles llaman a `syncClothingMaterials` dentro de una transacción.
- Modify: `prisma/tests/02_warehouses.sql`. Casos nuevos: CHECK de anulación incompleta y vínculo con `material_id` duplicado.
- Test: `src/features/Warehouses/lib/clothing-materials.integration.test.ts`, sumado a `scripts/test-warehouses.sh`:
  - habilitar una combinación crea el material;
  - renombrar la marca lo renombra;
  - quitar la combinación lo desactiva, y volver a habilitarla lo reactiva (mismo material);
  - código repetido recibe sufijo.

**Verificación:**
- `db:deploy`, `generate`, `psql` (conteo de combinaciones contra materiales con `material_id`), `test:db`, `npm test` y `check-types`.
- La migración, corrida sobre P4 y una base con la demo, deja cero combinaciones sin material.

### Task 2: Entrega que descuenta stock y anulación (servidor)

**Files:**
- Modify: `src/features/Clothing/actions/perimeter.ts`: `ClothingOperator.profileId`; `assertWarehouseInCompany(warehouseId, companyId)` (activo y de la empresa).
- Modify: `src/features/Clothing/ClothingDelivery/actions/deliveries.server.ts`:
  - `CreateDeliveryInput` suma `warehouseId`;
  - las líneas exigen marca y talle;
  - todo pasa a `withActor(profileId)` en una transacción: entrega, `registerStockMovement` (EXIT, destino `EMPLOYEE`, líneas agrupadas por material) y `stock_movement_id`;
  - devuelve `ActionResult<{ id }>` con `toActionError`.
- Modify: `src/features/Clothing/lib/delivery-items.ts` (+ su test): la normalización rechaza líneas sin marca o talle y expone `groupLinesByMaterial`.
- Modify: `src/features/Clothing/ClothingDelivery/actions/queries.server.ts`:
  - `getSizesForItemBrand(itemId, brandId, warehouseId?)` suma el disponible por talle (`stock_balances` del material de la combinación);
  - `getDeliveryWarehouses()` lista los depósitos activos de la empresa del operario.
- Create: `src/features/Clothing/EmployeeDeliveries/actions/cancel.server.ts`: `cancelClothingDeliveryAction(deliveryId, reason)`.
  - Permiso `empleados:indumentaria_empleado:delete`.
  - Lockea la entrega y anula su salida si existe. Si la salida ya estaba anulada, la marca igual (spec §3.3).
  - Marca la entrega.
- Test: `src/features/Clothing/ClothingDelivery/actions/deliveries.integration.test.ts`, sumado a `scripts/test-warehouses.sh`:
  - descuenta del depósito elegido al costo promedio, imputando al empleado;
  - sin stock no registra nada;
  - dos líneas de una combinación se suman;
  - depósito de otra empresa rechazado;
  - anular devuelve el stock;
  - anular dos veces se rechaza;
  - anular con la salida ya anulada desde Almacenes marca la entrega.

### Task 3: Asistente de entrega (`/clothing`)

**Files:**
- Modify: `ClothingDelivery/components/StepAddItems.tsx`:
  - selector de depósito (si hay uno solo, viene elegido);
  - marca y talle obligatorios;
  - "Disponible: N" por línea;
  - en el selector de talle, los talles sin stock aparecen con "Sin stock" pero se pueden elegir (el bloqueo es del servidor, con su mensaje).
- Modify: `DeliveryWizard.tsx` y `StepConfirm.tsx`: el depósito viaja en el estado del asistente; la confirmación usa `unwrapAction` y muestra el error de stock sin reiniciar.
- Modify: `src/features/Clothing/pdf/DeliveryReceiptLayout.tsx` + `actions/pdf.server.ts`: marca "ANULADA" con fecha y motivo en entregas anuladas.

### Task 4: Historial del empleado y reporte global (agente `table-expert`)

**Files:** `src/features/Clothing/EmployeeDeliveries/EmployeeDeliveriesList/*` y `src/features/Clothing/ClothingReports/ClothingReportsList/*`.

- **Columna Estado** (Vigente / Anulada), con filtro faceted.
- **Columna Costo**: `stock_movements.total_cost` de la entrega. Solo con `almacenes:movimientos:view_prices`; sin permiso, el valor no sale del servidor. Entregas anteriores a la etapa: "Sin costo".
- **Columna Depósito.**
- **Acción Anular** con `delete`, que abre `CancelDeliveryDialog` (lo escribo yo: motivo obligatorio y `cancelClothingDeliveryAction`).
- Export con los mismos formatters.

### Task 5: Catálogo de Ropa y Almacenes

**Files:**
- Modify: la pantalla de la matriz artículo × marca × talle (`src/features/Clothing/ClothingItems/...`): muestra, por combinación, el código del material y su stock total.
- Modify: `src/features/Warehouses/Materials/components/MaterialFormDialog.tsx` + `actions/catalog.server.ts` (`updateMaterial`): un material vinculado a una combinación de ropa bloquea código, nombre y unidad, con el aviso "Se administra desde el catálogo de Ropa". El servidor rechaza esos cambios.
- Modify: `Movements/components/MovementDetail.tsx` + `getStockMovementDetail`: una salida de una entrega de ropa muestra "Entrega de ropa a [legajo] Apellido Nombre".

### Task 6: Demo

**Files:** `scripts/demo/reset.ts` (Almacenes antes que Ropa), `scripts/demo/domains/warehouses.ts`, `scripts/demo/domains/hr.ts`.
- **En `warehouses.ts`:**
  - se quitan `EPP-GUA` y `EPP-ANT`, con sus salidas y pedidos, reemplazados por materiales que no son ropa;
  - el libro en memoria se exporta para que Ropa registre sus movimientos.
- **En `hr.ts`:**
  - crea los materiales de la matriz con la regla de código;
  - registra una compra de ropa al depósito base;
  - genera una salida por cada entrega;
  - incluye una entrega anulada.
- Se verifica con el arnés en transacción descartada.

### Task 7: Verificación final

- `check-types`, `npm test`, `test:db`, `test:warehouses` y `test:jobs`.
- En el navegador:
  - entrada de ropa en Almacenes;
  - entrega desde `/clothing` con el depósito elegido y el disponible por talle;
  - bloqueo sin stock;
  - anulación desde el historial, con el stock devuelto y la constancia "ANULADA";
  - costos con y sin permiso;
  - la matriz con el stock;
  - el material de ropa bloqueado en Almacenes.
- Revisión de calidad antes de proponer el commit.
