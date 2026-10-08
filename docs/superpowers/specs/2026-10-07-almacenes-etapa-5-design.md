# Almacenes — Etapa 5: las entregas de ropa descuentan stock

**Fecha:** 2026-10-07
**Estado:** diseño aprobado, pendiente de revisión de la spec escrita
**Parte de:** `docs/superpowers/specs/2026-10-04-almacenes-etapa-1-design.md` (§1.1, etapa 5: "Integración con Ropa de trabajo: las entregas descuentan stock"). Rige lo de las etapas anteriores: motor único de escritura, `ActionResult`, costos solo con `view_prices`, multiempresa por `company_id`, orden de locks del dominio. El módulo de Ropa conserva sus tablas y su panel; solo llama al motor dentro de su propia transacción (etapa 1, §2).

## 1. Objetivo y decisiones

Que cada entrega de ropa o EPP a un empleado sea una salida de stock imputada a ese empleado, con su costo, y que el stock de ropa se lleve por prenda, marca y talle.

Hoy el módulo de Ropa (spec `2026-03-18-clothing-module-design.md`) no tiene stock, costos ni anulación: registra entregas con firma y genera la constancia RG 12-4.

| Tema | Decisión |
| ---- | -------- |
| Nivel del stock | **Artículo + marca + talle**: cada combinación válida de la matriz es un material. |
| Catálogo | **Materiales automáticos** desde la matriz de Ropa. El catálogo se sigue manejando solo desde Ropa. |
| Depósito | **Lo elige quien entrega**, en el asistente. |
| Sin stock | **Se bloquea la entrega.** El stock nunca queda negativo. |
| Anulación | **Se suma**: anular una entrega anula su salida y devuelve el stock; la entrega queda marcada, no se borra. |
| Marca y talle | **Obligatorios** en cada línea (antes eran opcionales). |

## 2. Modelo de datos

- Tabla nueva **`clothing_item_materials`**: `company_id`, `clothing_item_id`, `clothing_brand_id`, `clothing_size_id`, `material_id` (FK a `materials`, **única**), con único `(clothing_item_id, clothing_brand_id, clothing_size_id)`. Es el vínculo combinación → material y **nunca se borra**: si una combinación se quita de la matriz y después se vuelve a habilitar, recupera el mismo material con su stock e historial. Va en tabla propia y no en `clothing_item_brand_sizes` porque la matriz se reescribe al guardarla. La migración la completa para todas las combinaciones existentes.
- `setItemBrandSizes` deja de borrar y reinsertar la matriz entera: inserta las combinaciones nuevas y borra solo las que se quitaron.
- `clothing_deliveries`:
  - `warehouse_id uuid?` (FK a `warehouses`): depósito del que salió.
  - `stock_movement_id uuid?` (FK a `stock_movements`, única): la salida de la entrega.
  - `cancelled_at timestamptz?`, `cancelled_by uuid?` (FK a `profile`), `cancel_reason text?`.
  - CHECK `clothing_deliveries_cancel_check`: `cancelled_at`, `cancelled_by` y `cancel_reason` van los tres o ninguno.
  - Las entregas anteriores a esta etapa quedan con `warehouse_id` y `stock_movement_id` en NULL: no se genera stock retroactivo.
- **Categoría "Ropa"** en `material_categories`, una por empresa, que la migración crea si no existe. Unidad: la "u" de la empresa (`default-units`).

## 3. Reglas

### 3.1 Materiales de la matriz (`lib/clothing-materials.ts` en Warehouses, `server-only`)

`syncClothingMaterials(tx, companyId, itemBrandSizeIds)`:

- Por cada combinación de la matriz sin fila en `clothing_item_materials`, crea el material y el vínculo:
  - **código** `{item.code}-{marca abreviada}-{talle}`, en mayúsculas y sin espacios (ej. `IND-001-OMB-42`). Si el artículo no tiene código, usa las primeras letras del nombre. Si el código ya existe en la empresa, suma un sufijo `-2`, `-3`…
  - **nombre** `"{artículo} · {marca} · {talle}"`;
  - categoría "Ropa", unidad "u", `tracking_type = QUANTITY`, activo.
- Sincroniza nombre y estado: si cambia el nombre del artículo, la marca o el talle, se actualiza el nombre del material. Si la combinación se quita de la matriz o el artículo, la marca o el talle se desactivan, el material pasa a inactivo; nunca se borra.
- La llaman `setItemBrandSizes` y las altas o ediciones de artículos, marcas y talles del catálogo de Ropa, dentro de su transacción.
- Desde Almacenes, un material de ropa se ve y se mueve como cualquiera, pero su código, nombre y unidad no se editan: el formulario de material lo informa ("Se administra desde el catálogo de Ropa").

### 3.2 Entrega (`createClothingDelivery`)

1. Valida, como hoy, el tipo, el empleado y el catálogo. Además:
   - cada línea tiene marca y talle, y la combinación existe en la matriz y tiene material;
   - el depósito es de la empresa y está activo.
2. En **una transacción**:
   - crea la entrega y sus líneas, con `warehouse_id`;
   - registra la salida con `registerStockMovement`: `EXIT` desde el depósito, destino `EMPLOYEE` = quien recibe, `reference` = "Entrega de ropa", una línea por material (las líneas repetidas de un mismo material se suman), `createdBy` = `profile.id` del operario;
   - guarda `stock_movement_id`.
3. Si falta stock, el motor lanza `INSUFFICIENT_STOCK` y no se registra nada. La acción devuelve el mensaje del motor ("Stock insuficiente de Camisa · Ombú · 42 en Depósito Base: hay 1 u, se pidieron 2 u").

La entrega no pasa por la regla de salida directa ni por pedidos de materiales: la autoriza el perímetro del panel `/clothing` (operario con empleado vinculado) y la firma del empleado.

**Cambio de contrato de `createClothingDelivery`:** hoy lanza errores. Pasa a devolver `ActionResult`, para que el mensaje de stock llegue al operario en producción. El asistente se adapta.

### 3.3 Anulación (`cancelClothingDeliveryAction`)

- **Permiso:** `empleados:indumentaria_empleado:delete` (acción nueva en esa tab; la migración se la da a los 3 roles de sistema).
- **Pasos**, en una transacción:
  1. lockea la entrega (`FOR UPDATE`) y valida que no esté anulada;
  2. si tiene `stock_movement_id`, la anula con `reverseStockMovement` (motivo: "Anulación de entrega de ropa: {motivo}");
  3. marca la entrega con `cancelled_at`, `cancelled_by` y `cancel_reason`.
- Una entrega anterior a esta etapa (sin movimiento) también se puede anular: solo se marca.
- El orden de locks queda: entrega → movimiento original → materiales → … Ningún camino del motor lockea una entrega de ropa, así que no hay ciclo.
- Si la salida no se puede anular (por ejemplo, porque ya la anularon desde Almacenes), el error del motor llega al usuario. Si la salida ya está anulada desde Almacenes, la entrega igual se marca como anulada.

## 4. Pantallas

### 4.1 Asistente de entrega (`/clothing`)

- Paso **Artículos**:
  - selector de **depósito** arriba de las líneas (depósitos activos de la empresa; si hay uno solo, viene elegido);
  - cada línea exige marca y talle, y muestra "Disponible: N" de esa combinación en el depósito.
- El botón de confirmar muestra el error de stock si el servidor lo devuelve; el asistente no se reinicia.
- La constancia PDF no cambia, salvo la marca "ANULADA" en las entregas anuladas.

### 4.2 Historial del empleado y reporte global

- Columna o dato **Estado**: Vigente / Anulada, con filtro.
- **Costo** de la entrega (total de su salida), solo con `almacenes:movimientos:view_prices`.
- Acción **Anular** (con `delete`) que abre un diálogo con motivo obligatorio.
- Las tablas son DataTables: los cambios los hace el agente `table-expert`.

### 4.3 Catálogo de Ropa

- La pantalla de la matriz informa, por combinación, el código del material y su stock total.
- No cambia la forma de cargarla.

### 4.4 Almacenes

- En el formulario de material, los materiales de ropa muestran el aviso de §3.1 y bloquean código, nombre y unidad.
- El detalle de una salida de ropa muestra "Entrega de ropa a [legajo] Apellido Nombre".

## 5. Tests

- **Unitarios:** armado del código del material (abreviaturas, sin código de artículo, colisiones con sufijo).
- **Integración:**
  - sincronizar la matriz crea, renombra y desactiva materiales; quitar y volver a habilitar una combinación recupera el mismo material;
  - una entrega descuenta stock del depósito elegido al costo promedio e imputa al empleado;
  - sin stock: no se registra ni la entrega ni la salida;
  - líneas repetidas de una misma combinación se suman en una línea de stock;
  - anular devuelve el stock y marca la entrega; anular dos veces se rechaza;
  - el operario no puede entregar desde un depósito de otra empresa.
- **pgTAP:** el CHECK de anulación y la unicidad del vínculo (`material_id` y la combinación) y de `stock_movement_id`.
- **Navegador:**
  - cargar stock de ropa con una entrada;
  - entregar desde `/clothing` eligiendo depósito, ver el disponible y el bloqueo sin stock;
  - anular desde el historial y ver el stock devuelto;
  - costos con y sin permiso.

## 6. Demo

- `seedWarehouses` se siembra **antes** que `seedClothing` y crea la categoría "Ropa".
- `seedClothing`:
  - crea los materiales de la matriz;
  - registra una compra de ropa al depósito base;
  - genera una salida por cada entrega, por el libro en memoria de Almacenes;
  - incluye una entrega anulada.
- Se quitan `EPP-GUA` y `EPP-ANT` de la demo de Almacenes, que duplicaban el catálogo de Ropa, junto con sus salidas y pedidos de ejemplo.

## 7. Fuera de alcance

- Talles por empleado.
- Vencimientos y renovaciones de EPP.
- Pedidos de ropa con aprobación.
- Editar una entrega.
- Stock retroactivo de entregas anteriores.
