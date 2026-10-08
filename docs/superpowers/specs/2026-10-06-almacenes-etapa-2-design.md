# Almacenes — Etapa 2: préstamos de serializados y vencimientos de lotes

**Fecha:** 2026-10-06
**Estado:** diseño aprobado, pendiente de revisión de la spec escrita
**Parte de:** `docs/superpowers/specs/2026-10-04-almacenes-etapa-1-design.md` (§1.1, etapa 2). Todo lo que esta spec no cambia sigue rigiendo como en la etapa 1 (motor único de escritura, orden de locks, `ActionResult`, costos solo con `view_prices`, multiempresa por `company_id`).

## 1. Objetivo y decisiones del usuario

1. **Quién tiene qué.** Ver qué herramientas (materiales `SERIAL`) están fuera del depósito, en poder de quién y desde cuándo; devolverlas o darlas de baja si no vuelven.
2. **Vencimientos.** Que ningún lote vencido salga del almacén y que se avise de lo vencido y lo próximo a vencer.

Decisiones tomadas en la conversación:

| Tema | Decisión |
| ---- | -------- |
| Qué se devuelve | **Solo serializados.** Lo que se mide por cantidad o lote se consume. |
| Qué es un préstamo | **Toda salida de un serializado.** Sin campos nuevos en la salida ni fecha esperada de devolución. |
| Si la herramienta no vuelve | **Baja en poder del tenedor** con motivo obligatorio; no mueve stock. |
| Lote vencido | **Bloqueado** para salidas y transferencias; solo se descarta con ajuste negativo. |
| Avisos de vencimiento | **En pantalla y mail semanal.** Ventana fija de **30 días** para "por vencer". |

## 2. Modelo de datos

### 2.1 Devolución: nuevo tipo de movimiento `RETURN`

- `stock_movement_type` suma el valor **`RETURN`**.
- `stock_movements` suma **`returned_from_movement_id uuid?`**, FK a `stock_movements`: la salida cuyo préstamo cierra la devolución.
- Una devolución:
  - **ingresa** al depósito que se elige (`warehouse_id`); todas sus líneas tienen `direction = +1`;
  - **copia el destino** de la salida (`destination_type` y la FK correspondiente), así lo imputado al tenedor se compensa;
  - lleva una línea por unidad, con `unit_cost` = el `unit_cost` de esa unidad en la salida.
- CHECKs que cambian o se agregan (migración nueva, a mano):
  - `stock_movements_exit_destination_check` pasa a `(type IN ('EXIT','RETURN')) = (destination_type IS NOT NULL)`.
  - `stock_movements_return_check`: `(type = 'RETURN') = (returned_from_movement_id IS NOT NULL)`.

### 2.2 Baja de una unidad prestada: `material_unit_write_offs`

| Columna | Tipo | Notas |
| ------- | ---- | ----- |
| `id` | uuid | |
| `company_id` | uuid | FK `company` |
| `unit_id` | uuid | FK `material_units` |
| `loan_movement_id` | uuid | FK `stock_movements`: el último movimiento de la unidad al darla de baja (el que la dejó prestada) |
| `reason` | enum `material_write_off_reason` | `LOST` · `BROKEN` |
| `notes` | text | obligatorio (validación) |
| `created_by` | uuid | FK `profile` |
| `created_at` | timestamptz | |

Único `(unit_id, loan_movement_id)`: un mismo préstamo no se da de baja dos veces. No es un movimiento de stock: la unidad ya había salido, no hay saldo que mover, y el costo queda imputado a quien la tenía.

### 2.3 Vencimientos y avisos

- `notification_kind` suma **`stock_batch_expiry`**. La migración crea la fila de `notification_settings` de cada empresa existente con su `contact_email`, como hacen los otros dos tipos. `scripts/seed-company.ts` agrega el tipo a su lista.
- Lotes: no hay cambios de esquema. `material_batches.expires_at` ya existe.

## 3. Motor de stock

Todo sigue pasando por `src/features/Warehouses/lib/stock-engine.ts`, con el mismo orden de locks.

### 3.1 `registerReturn(tx, companyId, createdBy, input)`

`input = { exitMovementId, unitIds[], warehouseId, occurredOn, notes }`.

1. Lockea la salida (`FOR UPDATE`); tiene que ser de la empresa, de tipo `EXIT` y no una anulación.
2. Lockea materiales, saldos y unidades, en el orden del dominio.
3. Cada unidad tiene que estar en `OUT` y su `last_movement_id` tiene que ser esa salida, o una anulación de una devolución de esa salida (§3.4). Si no, `UNIT_NOT_AVAILABLE` con el número de serie.
4. Por cada unidad:
   - suma 1 al saldo del depósito elegido, al `unit_cost` de la línea de la salida;
   - recalcula el promedio como una entrada (`averageCostAfterEntry`);
   - la unidad pasa a `IN_STOCK` en ese depósito, con `last_movement_id` = la devolución.
5. Numeración `MOV-` y escritura, igual que el resto de los movimientos.

`registerStockMovement` rechaza `type = 'RETURN'`: la devolución solo entra por esta función, que sabe de qué salida viene.

### 3.2 `writeOffLoanedUnit(tx, companyId, createdBy, { unitId, reason, notes })`

- Lockea la unidad, que tiene que estar en `OUT`.
- Inserta en `material_unit_write_offs` con `loan_movement_id` = `last_movement_id` de la unidad.
- La unidad pasa a `DISCARDED`; `last_movement_id` no cambia.
- No toca saldos ni el costo promedio.

### 3.3 Lotes vencidos

En salidas y transferencias, una línea con `batch_id` de un lote cuyo `expires_at` es anterior a **hoy en Argentina** (UTC−03:00 fijo, sin horario de verano) se rechaza con el error nuevo `EXPIRED_BATCH`: *"El lote L-01 de Grasa de litio venció el 31/12/2026: no puede salir ni transferirse. Para darlo de baja usá un ajuste."* El ajuste negativo y las anulaciones siguen permitidos: corrigen el stock, no lo despachan.

### 3.4 Anulaciones

- Una **devolución** se anula como el resto de los movimientos: la unidad tiene que estar `IN_STOCK` en el depósito de la devolución y el promedio se recalcula como en la anulación de una entrada. La anulación copia `returned_from_movement_id` (la `RETURN` anulada también es `RETURN`). La unidad vuelve a **`OUT`**, no a `DISCARDED` como en la anulación de una entrada: es un caso propio en `reverseStockMovement`. Su `last_movement_id` pasa a ser la anulación. El préstamo se reabre.
- Una **salida** cuya unidad ya fue devuelta o dada de baja no se puede anular: la regla actual ("la unidad se movió después") ya lo cubre.
- Las **bajas** no se anulan en esta etapa. Si fue un error, la herramienta se vuelve a ingresar con una entrada: la serie descartada se reutiliza, como ya hace el motor.

### 3.5 Kardex

- La devolución se reproduce como una entrada al costo de la salida (la misma regla que la anulación de una salida).
- La anulación de una devolución se reproduce como la anulación de una entrada.
- `lib/kardex.ts` y el test que compara el kardex con el motor cubren los dos casos.

## 4. Pantallas y permisos

### 4.1 Sección nueva "Préstamos"

- **Tab y permisos:** `prestamos` (`b0000000-0000-0000-0000-000000000006`), con acciones `view`, `create` (devolver) y `delete` (dar de baja). La migración da permisos solo a los 3 roles de sistema.
- **Sidebar:** la entrada se ubica entre Movimientos y Materiales, con el ícono `HandHelping`.
- **Tabla:** DataTable nuevo, a cargo de `table-expert`.
  - **Filas:** las unidades en estado `OUT` de la empresa.
  - **Columnas:**
    - código y nombre del material;
    - número de serie;
    - tipo de destino;
    - tenedor: empleado como `[legajo] Apellido Nombre`, vehículo, equipo, orden de mantenimiento o cliente, con las mismas etiquetas que en `lib/labels.ts`;
    - fecha de la salida, días en préstamo y número de la salida (link al detalle).
  - **Filtros:** uno por columna, según la regla del repo.
- **Fecha "desde":** es la de la salida original. Si el último movimiento de la unidad es la anulación de una devolución, la fecha sale de la salida a la que apunta esa devolución (`returned_from_movement_id`).
- **Acciones por fila:**
  - **Devolver** (`create`): diálogo con depósito, fecha (date picker con escritura) y observaciones. Toast: "MOV-000012: TP-001 devuelto a Depósito Base".
  - **Dar de baja** (`delete`): `AlertDialog` con motivo (Extraviada / Rota) y detalle obligatorio.

### 4.2 Otras pantallas

- **Movimientos:** el filtro de tipo suma "Devolución" y la etiqueta va en `MOVEMENT_TYPE_LABELS`. El detalle de una devolución muestra "Devuelve el préstamo de MOV-xxxxxx".
- **Nuevo movimiento:** no ofrece `RETURN`; las devoluciones salen de la sección Préstamos.
- **Detalle de material:** suma el bloque "Unidades prestadas" (serie, tenedor, desde) y "Dadas de baja" (serie, motivo, quién la tenía, fecha).
- **Stock:** suma el aviso `BatchExpiryAlert` junto al de bajo mínimo: lotes con saldo vencidos (en rojo) y los que vencen en los próximos 30 días. Si no hay ninguno, no se muestra.
- **Formulario de movimientos:** en el selector de lotes, los vencidos aparecen deshabilitados con la etiqueta "Vencido" en salidas y transferencias.

### 4.3 Mail semanal

- **Job y ruta:** `src/features/Jobs/jobs/warehouse-batch-expiry.ts` y la ruta `/api/jobs/warehouse-batch-expiry` (`GET`/`POST`, mismo token que el resto).
- **Cron:** los lunes a las 08:05 hora AR, en `docker/cron/crontab`.
- **Funcionamiento:** el mismo patrón que `documents-expiry`:
  - recorre todas las empresas, con el reclamo de idempotencia en `jobs_runs`;
  - destinatarios desde `notification_settings` (`stock_batch_expiry`).
- **Contenido del mail**, por depósito: material, lote, vencimiento y saldo. Separa los **vencidos** de los que vencen **en los próximos 30 días**.
- **Sin nada que avisar:** la empresa queda como `skipped` y no se manda mail.

## 5. Tests

- **Integración del motor**, sumada a `test:warehouses`:
  - devolución al costo de la salida y promedio recalculado;
  - la imputación queda compensada;
  - devolver una unidad que no es de esa salida → `UNIT_NOT_AVAILABLE`;
  - anular una devolución reabre el préstamo y se puede volver a devolver;
  - no se puede anular una salida ya devuelta;
  - baja: la unidad pasa a `DISCARDED`, sin cambio de saldo, y no se puede dar de baja dos veces;
  - lote vencido rechazado en salida y en transferencia, y permitido en ajuste negativo;
  - el kardex sigue coincidiendo con el motor.
- **pgTAP:** los CHECK nuevos (`RETURN` sin salida de origen, destino en devolución) y el único de las bajas.
- **Job:** test de integración con dos empresas (como `jobs.integration.test.ts`):
  - un solo mail por empresa;
  - empresa sin lotes por vencer salteada;
  - idempotencia al correrlo dos veces el mismo día.
- **Unitarios:** la fecha de "hoy" en Argentina y la clasificación vencido / por vencer / vigente.
- **Navegador:**
  - prestar y devolver una herramienta, y dar de baja otra;
  - comprobar que una salida de un lote vencido se rechaza;
  - el aviso en Stock;
  - disparar el job a mano contra Mailpit.

## 6. Demo

`scripts/demo/domains/warehouses.ts` suma:
- una devolución (una herramienta prestada que vuelve al pañol);
- una baja ("extraviada en locación");
- un lote ya vencido con saldo, para que el aviso y el bloqueo se vean.

## 7. Fuera de alcance

- Fecha esperada de devolución y avisos de préstamos demorados.
- Devoluciones de materiales por cantidad o lote.
- Anular una baja.
- Ventana de "por vencer" configurable por empresa.
- La ficha del empleado con "herramientas en su poder". Es natural, pero toca el módulo Empleados: va como pedido aparte.
