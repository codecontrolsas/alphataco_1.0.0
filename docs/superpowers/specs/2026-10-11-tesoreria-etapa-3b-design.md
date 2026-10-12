# Tesorería — Etapa 3b: cheques propios

**Fecha:** 2026-10-11
**Estado:** aprobada en conversación. El usuario aprobó las Partes 1 y 2 y pidió seguir hasta cerrar el módulo, así que las Partes 3 y 4 las decidí yo.
**Contexto:**
- La etapa 3a está commiteada en `70a7452e` (spec `2026-10-11-tesoreria-etapa-3a-design.md`).
- Hasta ahora, Compras paga con `CHECK` y `ECHECK` cargando a mano el número y la fecha de pago (`payment_order_payments`).
- Ese pago crea un movimiento `SUPPLIER_PAYMENT` en la fecha de pago del cheque (`paymentMovementDate`). Al llegar esa fecha, el saldo baja solo, aunque el banco no lo haya debitado.

Rigen las convenciones de las etapas 1 a 3a:
- multiempresa;
- `ActionResult` y schemas Zod en `schemas/`;
- permisos por tab, solo para los 3 roles de sistema;
- lo que tiene historia no se borra, se anula con motivo;
- el libro se escribe solo por `lib/movements.ts`;
- hora argentina (`treasuryToday()`, `formatArgentinaDateTime`).

## 1. Objetivo

Seguir cada cheque propio desde que se emite en una orden de pago hasta que el banco lo debita.

### Decisiones

| Tema | Decisión |
| --- | --- |
| Alcance | Chequeras y seguimiento de los cheques emitidos. |
| Débito | **Lo confirma un usuario**, con la fecha real. Hasta entonces el cheque no mueve plata: suma en "A debitar" de su cuenta. |
| Rechazo | **Se registra.** Vuelve la deuda con el proveedor y se paga con otra orden de pago (línea `REJECTED_CHECK`, como en la 3a). |
| Chequeras | Solo para cheques físicos. Cada una es de una cuenta bancaria y tiene un rango desde/hasta. El sistema propone el próximo número libre, y se puede cambiar por otro libre del rango. |
| E-cheq | Sin chequera: se elige la cuenta bancaria y se carga el número que dio el banco. |
| Números | Nunca se repiten en la misma cuenta y tipo, aunque el cheque esté anulado. |
| Datos existentes | Los pagos con `CHECK` o `ECHECK` ya registrados pasan a ser cheques propios: **Debitado** con la fecha de su movimiento, o **Anulado** si la orden se anuló. |

## 2. Modelo de datos

### 2.1 Chequera: `checkbooks`

| Columna | Detalle |
| --- | --- |
| `id`, `company_id` | |
| `account_id` | Cuenta bancaria (`BANK`, lo valida la acción). |
| `first_number`, `last_number` | Enteros, `1 ≤ first ≤ last`, hasta 500 números. |
| `retired_at`, `retired_by`, `retire_reason` | Baja con motivo. Los tres van juntos. |
| `created_by`, `created_at` | |

- Los rangos de una cuenta no se superponen. Lo valida la acción, con la cuenta bloqueada.
- El estado se calcula:
  - **Dada de baja**: tiene `retired_at`;
  - **Agotada**: no le quedan números libres;
  - **Activa**: en cualquier otro caso.

### 2.2 Cheque propio: `own_checks`

| Columna | Detalle |
| --- | --- |
| `id`, `company_id` | |
| `kind` | `PHYSICAL` o `ECHECK` (enum `own_check_kind`). |
| `account_id` | Cuenta bancaria de la que sale. |
| `checkbook_id` | Solo físicos; null en los e-cheqs y en los datos migrados. |
| `number` | Texto. En los físicos, dígitos sin ceros a la izquierda. |
| `amount` | Mayor a 0. Null en un número inutilizado. |
| `issue_date` | Fecha de emisión: la fecha de pago de la orden, o el día en que se inutilizó el número. |
| `payment_date` | Fecha de pago, mayor o igual a la emisión. Null en un número inutilizado. |
| `supplier_id` | Proveedor. Null en un número inutilizado. |
| `payment_order_payment_id` | Medio de la orden de pago que lo emitió (`@unique`). Null en un número inutilizado. |
| `status` | Enum `own_check_status`: `ISSUED`, `DEBITED`, `REJECTED` o `CANCELLED`. |
| `debited_on` | Solo `DEBITED`. |
| `rejected_on`, `reject_reason` | Solo `REJECTED`. |
| `void_reason` | Solo en un número inutilizado. |
| `created_by`, `created_at`, `updated_at` | |

Restricciones:
- **índice único** `(account_id, kind, number)`, sin excepción por estado;
- **CHECK por estado**, con las columnas obligatorias de cada uno;
- **CHECK de datos:**
  - un número inutilizado (sin medio de pago) está `CANCELLED`, tiene chequera y motivo, y no tiene importe, fecha de pago ni proveedor;
  - un cheque emitido tiene importe, fecha de pago y proveedor, y no tiene `void_reason`;
- **CHECK de tipo:** un e-cheq no tiene chequera.

### 2.3 Historial: `own_check_events`

Una fila por cada cambio de estado, que nunca se borra:
- `check_id`, `from_status` (null al emitir), `to_status` y `date`;
- `payment_order_id`, si la orden de pago lo causó (emitir o anular);
- `reason`, el motivo de una anulación, un rechazo o un número inutilizado;
- `user_id` y `created_at`.

### 2.4 Libro y órdenes de pago

- `treasury_movement_kind` suma `OWN_CHECK`.
- `treasury_movements` suma `own_check_id`.
- Rama nueva de `treasury_movements_origin_check`:
  - un `OWN_CHECK` exige `own_check_id`, un importe menor a 0 y ningún otro origen;
  - las ramas existentes exigen `own_check_id IS NULL`.
- El débito no usa `SUPPLIER_PAYMENT`. Ese tipo está atado 1 a 1 al medio de pago (`payment_order_payment_id @unique`), y deshacer un débito y volver a debitar necesita más de un movimiento por cheque.
- `payment_order_lines` suma `own_check_id`: la deuda de un cheque propio rechazado. Una línea `REJECTED_CHECK` lleva exactamente uno de los dos cheques, `third_party_check_id` o `own_check_id`.

### 2.5 Migración de datos

Por cada `payment_order_payments` con `CHECK` o `ECHECK`:
- crea su `own_check`:
  - **tipo:** `PHYSICAL` o `ECHECK`;
  - **cuenta:** la del medio;
  - **número:** el del medio, sin chequera;
  - **emisión:** la fecha de pago de la orden;
  - **fecha de pago:** `check_due_on`;
  - **proveedor:** el de la orden;
- el estado depende de su movimiento:
  - movimiento vigente → `DEBITED`, con la fecha del movimiento;
  - movimiento anulado → `CANCELLED`;
- crea un evento de origen;
- pasa su movimiento a `OWN_CHECK`, apuntado al cheque y sin `payment_order_payment_id`.

Si dos medios viejos repiten número en la misma cuenta, al segundo se le agrega ` (2)`. Toda la data de producción es de prueba.

## 3. Reglas del servidor

`lib/own-checks.ts` es el único que cambia `own_checks.status` y escribe eventos. `lib/own-check-transitions.ts` (sin directiva) define las transiciones.

### 3.1 Transiciones

| Desde | Acción | Hacia |
| --- | --- | --- |
| — | Emitir (pagar la orden) | EMITIDO |
| — | Inutilizar número | ANULADO |
| EMITIDO | Confirmar débito | DEBITADO |
| DEBITADO | Deshacer débito | EMITIDO |
| EMITIDO | Rechazo | RECHAZADO |
| RECHAZADO | Anular rechazo | EMITIDO |
| EMITIDO | Anular la orden de pago | ANULADO |

Cualquier otra combinación se rechaza con un mensaje que nombra el cheque y su estado.

### 3.2 Emitir (en `registerPayment`)

- **`CHECK`:**
  - el medio lleva `checkbookId` y el número;
  - la chequera es de la empresa y no está dada de baja; su cuenta es la del medio;
  - el número es un entero del rango, libre en la cuenta.
- **`ECHECK`:** la cuenta es bancaria y el número no está usado en la cuenta para e-cheqs.
- La fecha de pago del cheque no puede ser anterior a la fecha de pago de la orden.
- Crea el medio de pago (con `check_bank`, el banco de la cuenta) y su `own_check` EMITIDO, **sin movimiento**.
- Bloquea la chequera (`FOR UPDATE`).
- Si el índice único rechaza el número, el mensaje es "El cheque Nº … ya se usó en la cuenta …".

### 3.3 Confirmar el débito

- Uno o varios cheques EMITIDOS, con una sola fecha.
- La fecha no puede ser futura ni anterior a la fecha de pago de ningún cheque.
- Cada cheque pasa a DEBITADO, con un movimiento `OWN_CHECK` por −importe en su cuenta y en esa fecha.
- **Deshacer el débito (con motivo):** anula el movimiento y el cheque vuelve a EMITIDO.

### 3.4 Rechazo

- Desde EMITIDO, con fecha y motivo. La fecha no puede ser futura ni anterior a la emisión.
- No mueve plata. Nace la deuda con el proveedor (§3.6).
- **Anular el rechazo (con motivo):** solo si la deuda no está en ninguna orden no anulada. El cheque vuelve a EMITIDO.

### 3.5 Inutilizar un número

- Desde la chequera, con un número libre del rango y un motivo.
- Crea un `own_check` ANULADO, sin importe. El número no se vuelve a ofrecer.
- No se puede en una chequera dada de baja.

### 3.6 Anular la orden de pago

- Un cheque propio DEBITADO bloquea la anulación: "El cheque Nº … de esta orden ya se debitó: deshacé primero el débito".
- Un cheque RECHAZADO también la bloquea: "… fue rechazado: anulá primero el rechazo".
- Los EMITIDOS pasan a ANULADO; el número no se reusa.

### 3.7 Deuda con el proveedor

`lib/rejected-checks.ts` sigue siendo la única fórmula. `supplierCheckDebtSql` une a los cheques de terceros endosados los propios rechazados:

```
deuda = importe − Σ amount de las líneas REJECTED_CHECK (own_check_id) en órdenes no anuladas
```

- Cada deuda lleva su `source` (`THIRD_PARTY` u `OWN`).
- La etiqueta de un cheque propio es "Cheque propio rechazado Nº … — BANCO".
- La deuda aparece en el editor de la orden, en los vencimientos de Compras, en la cuenta corriente del proveedor y en el PDF de la orden.
- La línea no lleva retenciones.

### 3.8 Saldos

`getAccountIndicators` suma a "A debitar" de cada cuenta los cheques EMITIDOS (−importe), cualquiera sea su fecha. El proyectado los incluye. El saldo no cambia hasta que se confirma el débito.

### 3.9 Aviso

Un cheque EMITIDO cuya fecha de pago es anterior a hoy (`treasuryToday()`) figura **"Pendiente de confirmar"**. Lo calcula `ownCheckAlert` en `own-check-transitions.ts`.

### 3.10 Concurrencia

- Cada operación bloquea sus cheques (`SELECT … FOR UPDATE`, ordenados por id) y vuelve a validar el estado.
- La emisión bloquea la chequera.
- El alta de una chequera bloquea la cuenta.

## 4. Pantallas y permisos

### 4.1 Permisos

Tab `cheques-propios` (`d0000000-0000-0000-0000-000000000008`), "Cheques propios", después de Cheques. Retenciones sufridas pasa al orden 7. Se carga por migración a los 3 roles de sistema y se declara en `permissions-map.ts`:
- **view:** chequeras, listado y detalle;
- **create:** alta de chequeras e inutilizar números;
- **update:** confirmar débitos y registrar rechazos;
- **delete:** deshacer débitos, anular rechazos y dar de baja chequeras.

La emisión usa el permiso de pago de Compras.

### 4.2 Tab Cheques propios

**Encabezado (cards):**
- total EMITIDO por cuenta;
- cantidad de "Pendientes de confirmar".

**Chequeras:**
- una tabla simple: cuenta, rango, usados/libres, próximo número y estado;
- botón "Nueva chequera";
- por fila, "Inutilizar número" y "Dar de baja".

**DataTable de cheques**, hecha por `table-expert`:
- **Columnas:** número, tipo, cuenta, proveedor, orden de pago, importe, emisión, fecha de pago, estado (con el aviso), débito.
- **Filtros:** uno por columna. Estado visible, y arranca en EMITIDO.
- **Selección múltiple** de EMITIDOS con "Confirmar débito".
- **Export** a Excel.

### 4.3 Detalle

`/dashboard/treasury/own-checks/[id]`:
- datos del cheque y su estado;
- historial (fecha y hora argentina, usuario, motivo, link a la orden);
- deuda pendiente, si está rechazado;
- acciones según el estado: confirmar débito, deshacer débito, registrar rechazo y anular rechazo.

### 4.4 Cambios en lo existente

- **Registrar pago (Compras):**
  - `CHECK` pide la chequera (con su cuenta y los números libres) y propone el próximo número;
  - `ECHECK` pide una cuenta bancaria y el número;
  - transferencia y efectivo no cambian.
- **Detalle de la orden de pago:** muestra el estado del cheque propio de cada medio, con link a su detalle.
- **Movimientos y extractos:** el origen de un `OWN_CHECK` es "Cheque Nº …", con link al cheque.
- **`paymentMovementDate`** desaparece: ya no hay movimiento al emitir.

## 5. Errores y casos borde

- Número fuera del rango, no numérico o ya usado → error en el medio.
- Chequera dada de baja o agotada → no se ofrece; si llega igual, se rechaza.
- Fecha de débito futura o anterior a la fecha de pago → error.
- Operación sobre un cheque que otro usuario ya movió → error claro, sin cambios a medias.
- Rangos superpuestos → se rechaza el alta de la chequera.
- Cheques o chequeras de otra empresa → se tratan como inexistentes.
- Filtros hostiles de la tabla → se ignoran (`lib/filter-values.ts`).

## 6. Tests

**Unitarios:**
- tabla de transiciones, `ownCheckAlert`, normalización del número y schemas (chequera, débito, rechazo, inutilizar y medios de pago);
- claves de permisos de la tab.

**Integración** (`own-checks.integration.test.ts`):
- **emisión y débito:** pagar con cheque físico (próximo número) y e-cheq. Sin movimiento; "A debitar" los suma y el saldo no cambia. Confirmar el débito mueve el saldo; deshacerlo lo devuelve.
- **número ocupado:** repetido, fuera de rango o inutilizado se rechaza; el próximo libre salta los usados.
- **rechazo y deuda:** se paga con otra orden; no se puede anular el rechazo mientras la deuda está en una orden.
- **anulación de la orden:** con cheque EMITIDO lo anula; con DEBITADO o RECHAZADO se bloquea.
- **concurrencia:** dos débitos simultáneos del mismo cheque, uno solo gana.
- **chequeras:** superpuestas se rechazan; dada de baja no emite.

**pgTAP** (`prisma/tests/08_treasury_own_checks.sql`):
- origen `OWN_CHECK`;
- CHECK de estado, de datos y de tipo;
- índice único;
- la línea `REJECTED_CHECK` con exactamente un cheque.

**Navegador** (admin P4):
- alta de chequera, pago con cheque y e-cheq, confirmar débito, rechazo y su deuda, y anular la orden.

## 7. Demo

Dominio nuevo, `scripts/demo/domains/own-checks.ts`:
- una chequera en Galicia;
- los cheques emitidos por las órdenes de la demo:
  - dos debitados;
  - uno emitido "pendiente de confirmar";
  - uno emitido a futuro;
  - uno rechazado, con su deuda;
- un número inutilizado.

El `verify` de Compras y de Tesorería deja de exigir un movimiento por medio `CHECK`/`ECHECK`. Exige el movimiento solo en los cheques DEBITADOS.

## 8. Manual

**Guías nuevas:**
- `chequeras`: Chequeras;
- `cheques-propios`: Cheques propios, con débito, rechazo y números inutilizados.

**Guías que se actualizan:**
- la de pago de órdenes de Compras;
- la de saldos de cuentas ("A debitar");
- la de cartera de cheques (link a cheques propios).

Se verifica con `npm run manual:check`.

## 9. Fuera de alcance

- Importar del banco los débitos de cheques. La etapa 4 concilia el extracto, y confirmar un débito desde la conciliación queda para después.
- Imprimir cheques.
- Cheques propios en dólares.

## 10. Entrega

Un commit en `feat/tesoreria`: `feat(tesoreria): etapa 3b - cheques propios`.

Antes del commit:
- `check-types`;
- unitarios;
- `test:db`;
- `test:treasury` y `test:purchases`;
- `manual:check`;
- demo `--dry`.
