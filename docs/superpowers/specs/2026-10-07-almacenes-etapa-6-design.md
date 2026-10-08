# Almacenes — Etapa 6: cubiertas en el stock

**Fecha:** 2026-10-07
**Estado:** diseño aprobado (respuestas del usuario del 2026-10-07)
**Parte de:** `docs/superpowers/specs/2026-10-04-almacenes-etapa-1-design.md` (§1.1, etapa 6: "Integración con Cubiertas: ubicación en depósito, costo, movimientos al instalar/desinstalar").

Rige lo de las etapas anteriores:
- motor único de escritura;
- `ActionResult` en las acciones nuevas;
- costos solo con `view_prices`;
- multiempresa por `company_id`;
- orden de locks del dominio.

Gomería conserva sus tablas, sus estados y sus pantallas; solo llama al motor dentro de su propia transacción.

## 1. Objetivo y decisiones

Que cada cubierta sea una unidad serializada del stock, con depósito y costo, y que montarla, desmontarla y darla de baja muevan el stock imputando el costo al vehículo.

Hoy Gomería (spec `2026-03-25-tire-management-design.md`) lleva cubiertas por número de serie con estado (`AVAILABLE`, `INSTALLED`, `IN_REPAIR`, `MISSING`, `DISCARDED`), pero sin costo, depósito ni vínculo con Almacenes.

| Tema | Decisión |
| ---- | -------- |
| Material | **Tipo (medida + dibujo) + marca**: un material SERIAL por combinación; cada cubierta es una unidad. |
| Reparación / recapado | **Fuera del stock hasta que vuelve**: sigue imputada al vehículo; "Marcar como reparada" la devuelve al depósito elegido. |
| Cubiertas existentes | **Inventario inicial** con costo por tipo + marca. Hasta hacerlo, funcionan como hoy (sin stock). |
| Alta | **Desde los dos lados**: el catálogo de Gomería (con depósito y costo) y una entrada en Almacenes de un material de cubiertas. |
| Alta rápida del QR | **Se quita**: desde el QR solo se montan cubiertas que ya existen. |

## 2. Modelo de datos

- **`tire_materials`** (nueva):
  - columnas: `company_id`, `tire_type_id`, `tire_brand_id`, `material_id`;
  - únicos: `material_id` y la combinación (tipo, marca);
  - el vínculo nunca se borra.
- **`tires.material_unit_id uuid?`**: FK única a `material_units`. Una cubierta sin unidad es una cubierta "sin stock" (anterior a la etapa o sin inventario inicial).
- **`tire_service_items`**, para anular la orden:
  - `mount_movement_id uuid?`: la salida de la cubierta que se monta;
  - `return_movement_id uuid?`: la devolución de la que se desmonta a disponible.
- **Categoría "Cubiertas"** en `material_categories` y unidad "u", por empresa.

## 3. Reglas

### 3.1 Materiales del catálogo (`lib/tire-materials.ts` en Warehouses)

- **`syncTireMaterials(tx, companyId)`:**
  - crea el material de cada combinación tipo × marca de la empresa que no lo tenga;
  - sincroniza nombre y estado: el material está activo si el tipo y la marca lo están.
- **Código** `CUB-{medida}-{dibujo}-{marca 3 letras}`:
  - la medida va en mayúsculas y sin espacios;
  - el dibujo se abrevia: `SMOOTH` → `LIS`, `MIXED` → `MIX`, `BLOCK` → `TAC`;
  - ejemplo: `CUB-295/80R22.5-MIX-FIR`;
  - si el código ya existe, se agrega el sufijo `-2`, `-3`…
- **Nombre:** "Cubierta 295/80R22.5 Mixto · Firestone" (dibujo con las etiquetas de Gomería: Liso, Mixto, Taco).
- **Atributos:** categoría "Cubiertas", unidad "u", control `SERIAL`.
- **Cuándo se llama:** desde el alta, la edición y la activación de tipos y marcas de Gomería, dentro de su transacción.
- **Migración:** crea los materiales de las combinaciones existentes con la misma regla, escrita en SQL.
- **Desde Almacenes:** un material de cubiertas no cambia código, nombre, unidad ni control, igual que la ropa (etapa 5).

### 3.2 Stock de una cubierta (`lib/tire-stock.ts` en Warehouses, `server-only`)

Todas las funciones reciben el `tx` del llamador. Si la cubierta no tiene unidad, no hacen nada y devuelven `null`: la cubierta funciona como hoy.

| Función | Unidad | Efecto |
| ------- | ------ | ------ |
| `mountTire` | `IN_STOCK` | `EXIT` desde su depósito, destino `VEHICLE`. Si está `OUT`: error "La cubierta X no está en un depósito: registrá su devolución antes de montarla". |
| `returnTire(…, warehouseId)` | `OUT` | `registerReturn` desde la salida que la dejó afuera, al depósito elegido. Si está `IN_STOCK`, no hace nada. |
| `writeOffTire(…, reason, notes)` | `OUT` | `writeOffLoanedUnit` (`BROKEN` o `LOST`). |
| | `IN_STOCK` | Ajuste negativo con la unidad, con motivo. |
| `tireStockState(tireId)` | — | Unidad, estado, depósito y costo, para la pantalla. |

### 3.3 Qué mueve stock

**Alta de cubiertas**

- **Catálogo** (`createTire`, `createTiresBulk`): suman depósito y costo unitario. Crean las cubiertas, una entrada con sus números de serie y vinculan cada cubierta con su unidad.
- **Entrada en Almacenes** de un material de cubiertas: por cada unidad que entra, crea la cubierta en Gomería, disponible y nueva. Si ya existe una cubierta con esa serie, la vincula.

**Operaciones de la orden de gomería**

| Operación | Efecto en el stock |
| --------- | ------------------ |
| `performReplace` | La cubierta que entra: `mountTire`, guardado en `mount_movement_id`. |
| | La que sale a disponible: `returnTire` al depósito elegido, guardado en `return_movement_id`. |
| | La que sale a descarte: `writeOffTire` (`BROKEN`, con el comentario). |
| | La que sale a reparación: nada. |
| `performRepair` | La que entra: `mountTire`. La que sale a reparación: nada. |
| `performMissingReport` | Nada: queda imputada al vehículo. |
| `cancelServiceOrder` | Antes de revertir estados, anula con `reverseStockMovement` las devoluciones y los montajes de cada ítem, en orden inverso. |

**Estados cambiados fuera de una orden** (`updateTireStatus`, cubiertas desplazadas al editar el diagrama)

| Pasa a | Efecto en el stock |
| ------ | ------------------ |
| `AVAILABLE` | `returnTire` al depósito elegido. Es el caso de "Marcar como reparada" y "Marcar como encontrada". |
| `DISCARDED` | `writeOffTire`. |
| `IN_REPAIR` o `MISSING` | Nada. |

**Restablecer la plantilla del vehículo** (`resetVehicleToSubTypeTemplate`): las cubiertas montadas pasan a disponibles, así que vuelven al depósito elegido (`returnTire`).

**Depósito de una devolución:** el que elige el usuario. Si no se indica y la empresa tiene un solo depósito activo, se usa ese; si tiene varios, se rechaza con "Elegí el depósito al que vuelve la cubierta X".

**Editar una cubierta** (`updateTire`): con unidad, no se cambian la serie, la marca ni el tipo, porque definen su material y su unidad. Mensaje: "La cubierta tiene stock: no se cambian la serie, la marca ni el tipo".

**Eliminar una cubierta** (`deleteTire`): con unidad vigente, se rechaza con "Dala de baja con un descarte; tiene stock".

**Montar exige que la cubierta esté en un depósito.** `getAvailableTiresForVehicle` deja de ofrecer cubiertas `MISSING` con unidad: primero se marcan como encontradas.

### 3.4 Coherencia con Almacenes

Las cubiertas se montan, se desmontan y se dan de baja **desde Gomería**. En Almacenes:

- una salida o un ajuste negativo de unidades de cubiertas desde "Nuevo movimiento" se rechaza: "Las cubiertas se montan y se dan de baja desde Gomería";
- la anulación de un movimiento de cubiertas se rechaza: "Los movimientos de cubiertas no se anulan desde Almacenes: se corrigen desde Gomería" (los de una orden se anulan cancelando la orden; una entrada equivocada, descartando las cubiertas);
- la devolución y la baja de préstamos de unidades de cubiertas se rechazan: "Las cubiertas montadas se desmontan desde Gomería". El listado de préstamos no muestra cubiertas;
- el formulario de material bloquea código, nombre, unidad y control de un material de cubiertas, con el aviso "Se administra desde el catálogo de Gomería", y el servidor rechaza esos cambios, su baja y su reactivación;
- las transferencias entre depósitos y las entradas sí están permitidas.

### 3.5 Inventario inicial (Almacenes, permiso `movimientos:adjust`)

La pantalla lista las cubiertas activas sin unidad y no descartadas, agrupadas por tipo + marca, con su cantidad por estado. Se elige el depósito y se carga el costo unitario de cada grupo. Una sola transacción:

1. Una **entrada** al depósito con todas las series, al costo de su grupo.
2. Por cada cubierta, según su estado:
   - **montada:** salida a su vehículo actual (`vehicle_tire_positions`);
   - **en reparación o faltante:** salida al vehículo del último ítem de gomería que la desmontó; si no se conoce, queda en el depósito;
   - **disponible:** queda en el depósito.
3. Vincula cada cubierta con su unidad.

## 4. Pantallas

- **Catálogo de cubiertas.** Columnas Depósito (si está en stock) y Costo (solo con `view_prices`). La tabla la modifica `table-expert`.
- **Alta individual y masiva.** Depósito y costo unitario obligatorios.
- **Asistente de la orden (dashboard y QR).**
  - Al elegir destino "Disponible" para la cubierta que sale, pide el depósito. Si hay uno solo, viene elegido.
  - Desaparece el alta rápida de cubierta.
- **"Marcar como reparada" y "Marcar como encontrada".** Abren un diálogo con el depósito cuando la cubierta está afuera.
- **Diálogo de cubiertas desplazadas** (editar diagrama). Pide el depósito si alguna vuelve a disponible.
- **Almacenes.**
  - Sección "Inventario inicial de cubiertas" en Configuración, visible mientras haya cubiertas sin stock.
  - El detalle de un movimiento de cubiertas indica la orden de gomería si la tiene.

## 5. Tests

- **Unitarios:** regla del código del material.
- **Integración:**
  - sincronizar materiales;
  - alta con entrada;
  - entrada en Almacenes que crea cubiertas;
  - montar (y rechazo si está afuera);
  - desmontar a disponible al depósito;
  - descartar;
  - cancelar la orden anula los movimientos;
  - inventario inicial (disponible, montada, en reparación);
  - bloqueo de salida y de anulación desde Almacenes.
- **pgTAP:** unicidades de los vínculos nuevos.
- **Navegador:**
  - alta con costo;
  - orden con reemplazo y desmontaje a depósito;
  - cancelación;
  - "Marcar como reparada";
  - inventario inicial;
  - salida bloqueada en Almacenes.

## 6. Demo

- `seedWarehouses` antes que `seedTires`.
- `seedTires` crea los materiales y registra una compra de cubiertas al depósito base.
- Las montadas salen a su vehículo; las disponibles quedan en el depósito.
- Las que están en reparación quedan **sin stock**, para que la pantalla de inventario inicial tenga qué mostrar.

## 7. Fuera de alcance

- Costo de recapados y reparaciones.
- Historial de kilómetros por cubierta.
- Rotación como acción propia.
- Imputar el montaje a una orden de mantenimiento.
- Proveedores.
