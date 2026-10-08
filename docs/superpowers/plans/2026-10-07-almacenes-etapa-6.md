# Almacenes — Etapa 6 (cubiertas en el stock) — Plan de implementación

**Spec:** `docs/superpowers/specs/2026-10-07-almacenes-etapa-6-design.md` (fuente de verdad).
**Base:** rama `feat/almacenes-etapa-1` (etapas 1 a 5 commiteadas). Las restricciones globales y el criterio de "tarea terminada" son los del plan de la etapa 1.

## Notas que condicionan el orden

- **Gomería llama al motor dentro de su transacción.** Sus operaciones usan `prisma.$transaction`; las que mueven stock pasan a `withActor(profile.credentialId, …)` con `profile.id` como `createdBy`. El perfil sale de `requireServerAuthProfile()`, que también funciona en el QR anónimo.
- **La empresa sale de la orden o de la cubierta**, como hoy (perímetro por recurso). El motor recibe ese `companyId`.
- **Orden de locks.** Gomería no lockea nada propio antes de llamar al motor; cada función de `tire-stock.ts` sigue el orden del motor (movimiento → materiales → saldos → unidades → numeración). Dos cubiertas en una misma operación se mueven en dos llamadas, siempre en el mismo orden: primero la que sale, después la que entra.
- **Una cubierta que se monta y se desmonta dentro de la misma orden.** Al cancelar, se anula primero la devolución (la unidad vuelve a quedar afuera por la salida del montaje) y después el montaje. Hoy `reverseStockMovement` exige que el último movimiento de la unidad sea la salida; se amplía para aceptar también "el préstamo abierto de la unidad es esta salida" (`loanExitOf`). Es el mismo criterio que ya usa `registerReturn`.
- **DataTables** (catálogo de cubiertas y listado de préstamos): las modifica el agente `table-expert` (Task 5).
- **Migración de datos:** crea la categoría "Cubiertas" por empresa y los materiales de todas las combinaciones tipo × marca existentes, con la regla de `lib/tire-material-code.ts` escrita también en SQL. No crea unidades: las cubiertas existentes quedan sin stock hasta el inventario inicial.

## Revisión: riesgos que los tests de cada tarea tienen que cubrir

- Montar una cubierta que está afuera (en reparación o faltante, con unidad): rechazado con el mensaje de la spec, sin cambiar el estado en Gomería.
- Cancelar una orden con montaje y desmontaje de la misma cubierta: deja el stock como antes de la orden.
- Una devolución sin depósito en una empresa con varios depósitos: rechazada; con uno solo: usa ese.
- Una entrada en Almacenes con una serie que ya es una cubierta sin unidad: la vincula, no la duplica.
- Una salida, un ajuste negativo, una anulación o una devolución de préstamo de cubiertas desde Almacenes: rechazados.
- Cubiertas sin unidad (anteriores a la etapa): todas las operaciones de Gomería siguen funcionando igual.

---

### Task 1: Esquema, migración y materiales de cubiertas

**Files:**
- Modify: `prisma/schema.prisma`:
  - modelo `tire_materials` (vínculo tipo + marca → material, único por combinación y por material);
  - `tires.material_unit_id` (único, FK a `material_units`);
  - `tire_service_items.mount_movement_id` y `return_movement_id` (FK a `stock_movements`);
  - relaciones inversas.
- Create: `prisma/migrations/20261007210000_tire_stock/migration.sql`: columnas, FK, únicos, categoría "Cubiertas" y materiales de las combinaciones existentes.
- Create: `src/features/Warehouses/lib/tire-material-code.ts` + `.test.ts`: `tireMaterialCode({ size, treadType, brandName }, taken)` y `tireMaterialName(...)`.
- Create: `src/features/Warehouses/lib/tire-materials.ts` (`server-only`): `syncTireMaterials(tx, companyId)` y `tireMaterialFor(tx, companyId, typeId, brandId)`.
- Modify: `Gomeria/Tipos/actions/actions.server.ts` y `Gomeria/Marcas/actions/actions.server.ts`: alta, edición y activación en transacción con `syncTireMaterials`.
- Modify: `prisma/tests/02_warehouses.sql`: unicidades nuevas.
- Test: `src/features/Warehouses/lib/tire-materials.integration.test.ts` (crear, renombrar, desactivar).

### Task 2: Stock de una cubierta (motor)

**Files:**
- Modify: `src/features/Warehouses/lib/stock-engine.ts`: la anulación de una salida acepta la unidad cuyo préstamo abierto es esa salida; exporta `loanExitOf`.
- Create: `src/features/Warehouses/lib/tire-stock.ts` (`server-only`): `mountTire`, `returnTire`, `writeOffTire`, `resolveReturnWarehouse`, `createTiresWithStock` (alta con entrada) y `linkTiresFromEntry` (entrada de Almacenes → cubiertas).
- Test: `src/features/Warehouses/lib/tire-stock.integration.test.ts`.

### Task 3: Gomería mueve stock (servidor)

**Files:**
- Modify: `Gomeria/Catalogo/actions/actions.server.ts`:
  - `createTire` y `createTiresBulk` con depósito y costo;
  - `updateTire` bloquea serie, marca y tipo con unidad;
  - `updateTireStatus(id, status, warehouseId?)`;
  - `deleteTire` bloqueado con stock;
  - se quitan `createTireForVehicle` y `getTireBrandsForVehicle` (alta rápida del QR);
  - el listado suma depósito y costo (este último con `view_prices`).
- Modify: `Gomeria/Ordenes/actions/actions.server.ts`:
  - `performReplace`, `performRepair` (y el destino "Disponible" con depósito) en `withActor`;
  - `cancelServiceOrder` anula los movimientos;
  - `getAvailableTiresForVehicle` excluye las faltantes con unidad y devuelve si están en stock;
  - `getTireReturnWarehouses(vehicleId)` para el asistente.
- Modify: `Equipos/EquipoID/components/vehicle-tires/actions.server.ts`: cubiertas desplazadas y restablecer plantilla.
- Modify: `Warehouses/actions/movements.server.ts`, `loans.server.ts` y `catalog.server.ts`: bloqueos de la spec §3.4; la entrada de un material de cubiertas crea las cubiertas.
- Test: `src/features/Mantenimiento/Gomeria/Ordenes/actions/tire-orders.integration.test.ts` sumado a `scripts/test-warehouses.sh`.

### Task 4: Pantallas de Gomería

**Files:**
- `TireForm.tsx` y `TireBulkForm.tsx`: depósito y costo unitario en el alta.
- `ServiceOrderWizard.tsx` / `TireReplacePicker.tsx`: sin alta rápida; depósito al desmontar a "Disponible".
- Diálogo "Marcar como reparada / encontrada" con depósito (`_TiresDataTable.tsx`).
- Diálogo de cubiertas desplazadas y restablecer plantilla, con depósito.

### Task 5: Tablas (agente `table-expert`)

- Catálogo de cubiertas: columnas Depósito y Costo.
- Préstamos de Almacenes: excluir unidades de cubiertas.

### Task 6: Almacenes

- Sección "Inventario inicial de cubiertas" en Configuración (`movimientos:adjust`) + `initialTireInventoryAction`.
- Formulario de material bloqueado para materiales de cubiertas.
- Detalle del movimiento con la orden de gomería.

### Task 7: Demo

- `reset.ts`: Almacenes antes que Gomería.
- `tires.ts`: materiales, compra de cubiertas al depósito base, salidas de las montadas, en reparación sin stock.
- Se verifica con el arnés en transacción descartada.

### Task 8: Verificación final

- `check-types`, `npm test`, `test:db`, `test:warehouses` y `test:jobs`.
- Navegador: los casos de la spec §5.
- Revisión de calidad antes de proponer el commit.
