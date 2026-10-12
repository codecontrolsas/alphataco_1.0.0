# Tesorería — Etapa 3a: cheques de terceros

**Fecha:** 2026-10-11
**Estado:** en revisión.
**Contexto:** la etapa 2 (commit `823822ab`, spec `2026-10-10-tesoreria-etapa-2-design.md`) cobra con cheque y e-cheq, pero solo como movimiento a una cuenta bancaria "A acreditar" (§2.4 y la decisión "Cheques recibidos"). Compras paga con `payment_order_payments` (`registerPayment`, al pasar la orden de APROBADA a PAGADA). La etapa 3 se partió en **3a, cheques de terceros** (esta) y **3b, cheques propios**.

Rigen las convenciones de las etapas 1 y 2:
- multiempresa por `company_id`, con la empresa resuelta en el servidor;
- `ActionResult` en las mutaciones;
- schemas Zod en `schemas/`;
- permisos por tab, cargados por migración solo a los 3 roles de sistema;
- numeración con advisory lock por empresa;
- lo que tiene historia no se borra: se anula con motivo;
- el libro `treasury_movements` se escribe solo por `lib/movements.ts`;
- **hora argentina**: "hoy" es `treasuryToday()`, los timestamps se muestran con `formatArgentinaDateTime`, y toda función SQL que calcule con fechas lleva `SET TimeZone = 'America/Argentina/Buenos_Aires'`.

## 1. Objetivo

Seguir cada cheque recibido de un cliente desde que entra hasta que sale de la empresa:
- **entra** por un recibo de cobranza o por la carga inicial, a una cuenta de tipo **cartera de cheques**;
- **sale** depositado en un banco, endosado a un proveedor en una orden de pago, o descontado en un banco;
- puede ser **rechazado**, y entonces vuelve como deuda.

### Decisiones

| Tema | Decisión |
| --- | --- |
| Dónde están los cheques | Una cuenta de Tesorería de tipo **Cartera de cheques** (`CHECK_PORTFOLIO`). Su saldo es la suma de los cheques que tiene, con el mismo libro y el mismo extracto que cualquier cuenta. Puede haber varias carteras (por ejemplo, una por sucursal). |
| Registro del cheque | Tabla `third_party_checks` con su estado actual e historial en `third_party_check_events`. |
| Estados | EN CARTERA, DEPOSITADO, ENDOSADO, DESCONTADO, RECHAZADO y ANULADO. "Acreditado" no es un estado: un depositado está acreditado cuando su fecha de acreditación ya pasó. |
| Movimientos | Cada operación mueve plata en el libro: el recibo y la carga inicial entran a la cartera; el depósito, el endoso y el descuento salen de ella; el depósito y el descuento entran al banco; el rechazo de un depositado o descontado sale del banco. |
| Rechazo | El cheque vuelve como **deuda del cliente** en su cuenta corriente y se cobra con un recibo (línea `REJECTED_CHECK`). Si estaba endosado, además nace una **deuda con el proveedor**, que se paga con una orden de pago (línea `REJECTED_CHECK`). |
| Librador | Se guardan nombre y CUIT. Por defecto son los del cliente del recibo, y se pueden editar. |
| Plazo para depositar | 30 días desde la fecha de pago, para cheques físicos y e-cheqs. Solo avisa: no bloquea. |
| Cheques ya en mano | Una **carga inicial**, cheque por cheque, con su cliente de origen. |
| Datos de la etapa 2 | Los recibos ya confirmados con cheque a una cuenta bancaria quedan como están; no se migran a la cartera. Desde esta etapa, un medio `CHECK` o `ECHECK` de un recibo **debe** ir a una cartera. |

## 2. Modelo de datos

### 2.1 Cuentas

`treasury_account_kind` suma `CHECK_PORTFOLIO`. Una cartera:
- no admite movimientos manuales ni transferencias (las acciones lo validan, y la UI no la ofrece);
- solo recibe cheques de los recibos y de la carga inicial;
- solo los pierde por depósito, endoso, descuento o anulación.

### 2.2 Cheque: `third_party_checks`

| Columna | Detalle |
| --- | --- |
| `id`, `company_id` | |
| `kind` | `PHYSICAL` o `ECHECK` (enum `third_party_check_kind`). |
| `number` | Texto, obligatorio. |
| `bank` | Texto, obligatorio. Se guarda normalizado: sin espacios de más y en mayúsculas. |
| `drawer_name`, `drawer_cuit` | Librador. El CUIT tiene 11 dígitos y se valida con su dígito verificador. |
| `issue_date` | Fecha de emisión (`@db.Date`). |
| `payment_date` | Fecha de pago (`@db.Date`), desde la que se puede cobrar. No puede ser anterior a la de emisión. |
| `amount` | En pesos, mayor a 0. |
| `customer_id` | Cliente de origen. |
| `status` | Enum `third_party_check_status`: `IN_PORTFOLIO`, `DEPOSITED`, `ENDORSED`, `DISCOUNTED`, `REJECTED`, `CANCELLED`. |
| `portfolio_id` | Cartera donde entró (FK a `treasury_accounts`). Es la cartera a la que vuelve si se anula una salida. |
| `receipt_payment_id` | Medio del recibo que lo trajo (`@unique`, nullable). Es null en la carga inicial. |
| `opening_operation_id` | Operación de carga inicial (nullable). Un CHECK exige exactamente uno de los dos orígenes. |
| `credited_on` | Fecha de acreditación (solo `DEPOSITED`). |
| `bank_account_id` | Banco donde se depositó o descontó (solo `DEPOSITED` y `DISCOUNTED`). |
| `supplier_id` | Proveedor al que se endosó (solo `ENDORSED`, y se conserva en `REJECTED` si venía de ahí). |
| `rejected_from` | Estado desde el que se rechazó (solo `REJECTED`). |
| `created_by`, `created_at`, `updated_at` | |

Restricciones:
- índice único parcial `(company_id, bank, number, drawer_cuit) WHERE status <> 'CANCELLED'`: no puede haber dos cheques vigentes iguales;
- un CHECK por estado, con las columnas obligatorias de cada uno;
- el vencimiento para depositar (`payment_date + 30`) no se guarda: se calcula en `lib/checks-dates.ts`.

### 2.3 Operaciones: `third_party_check_operations`

Una fila por documento que agrupa cheques.

| Columna | Detalle |
| --- | --- |
| `id`, `company_id` | |
| `kind` | `OPENING`, `DEPOSIT`, `DISCOUNT` o `REJECTION` (enum `check_operation_kind`). |
| `number` | `CD-000001` para depósitos, `CL-000001` para liquidaciones de descuento y `CR-000001` para rechazos, únicos por empresa y tipo. La carga inicial no lleva número. |
| `date` | Fecha de la operación. No puede ser futura. |
| `bank_account_id` | Cuenta bancaria (`DEPOSIT` y `DISCOUNT`). |
| `slip_number` | Boleta de depósito, opcional. |
| `interest`, `fee` | Intereses y comisión del descuento, ≥ 0. |
| `reference` | Referencia de la liquidación, opcional. |
| `reason`, `returned_by` | Motivo del rechazo y quién lo devolvió (`BANK` o `SUPPLIER`). |
| `cancelled_by`, `cancelled_at`, `cancel_reason` | Anulación. |
| `created_by`, `created_at` | |

Cheques de cada operación: tabla `third_party_check_operation_items` con `operation_id`, `check_id`, `credited_on` (solo depósito) y `previous_status` (para revertir).

### 2.4 Historial: `third_party_check_events`

Una fila por cada cambio de estado de un cheque, que no se borra nunca:
- `check_id`, `from_status`, `to_status`, `date`;
- el documento que lo causó: `operation_id`, `receipt_id` o `payment_order_id`, exactamente uno;
- `user_id` y `created_at` (timestamptz).

Una anulación agrega un evento nuevo; no borra el anterior.

### 2.5 Recibo y orden de pago

- `customer_receipt_payments` suma `check_issue_date`, `drawer_name` y `drawer_cuit`. En `CHECK` y `ECHECK` son obligatorios, y la cuenta tiene que ser una cartera (lo valida la acción). `check_due_on` es la fecha de pago.
- `customer_receipt_line_kind` suma `REJECTED_CHECK`. La línea apunta a `third_party_check_id` y cobra la deuda de un cheque rechazado.
- `payment_method` suma `THIRD_PARTY_CHECK`, válido solo en `payment_order_payments` (CHECK en `customer_receipt_payments`). El medio apunta a `third_party_check_id`, lleva como cuenta la cartera del cheque y su importe es el del cheque completo.
- `payment_line_kind` suma `REJECTED_CHECK`. La línea apunta a `third_party_check_id` y paga la deuda con el proveedor de un cheque endosado y rechazado.

### 2.6 Cambios en el libro

`treasury_movement_kind` suma `CHECK_OPERATION`. `treasury_movements` suma:
- `check_operation_id`, FK a `third_party_check_operations`;
- `third_party_check_id`, FK a `third_party_checks` y nullable: el neto de un descuento no es de un solo cheque.

`treasury_movements_origin_check` se reemplaza:
- `CHECK_OPERATION` exige `check_operation_id` y ningún otro origen;
- las ramas existentes exigen además `check_operation_id IS NULL`.

Un endoso usa el `SUPPLIER_PAYMENT` existente, con importe negativo, sobre la cartera y unido a su `payment_order_payment_id`.

Movimientos por operación:

| Operación | Cartera | Banco |
| --- | --- | --- |
| Recibo | + importe, a la fecha del recibo (`CUSTOMER_RECEIPT`) | — |
| Carga inicial | + importe, a la fecha de la carga | — |
| Depósito | − importe por cheque, a la fecha del depósito | + importe por cheque, a su fecha de acreditación |
| Endoso | − importe, a la fecha de pago de la orden (`SUPPLIER_PAYMENT`) | — |
| Descuento | − importe por cheque, a la fecha de la liquidación | + neto (una sola fila), a la fecha de la liquidación |
| Rechazo de depositado o descontado | — | − importe, a la fecha del rechazo |
| Rechazo de endosado | — | — |

### 2.7 Deudas por cheques rechazados

Una sola definición de lectura, `src/features/Treasury/lib/rejected-checks.ts`, con el patrón de `receivables.ts`:

```
deuda del cliente   = importe − Σ applied_amount de las líneas REJECTED_CHECK en recibos DRAFT o CONFIRMED
deuda con proveedor = importe − Σ amount de las líneas REJECTED_CHECK en órdenes no anuladas
```

La deuda del proveedor existe solo si el cheque se rechazó desde `ENDORSED`.

**Dónde se ven:**
- **Cliente:** en "A cobrar", en el editor del recibo (como un comprobante pendiente más) y en la cuenta corriente.
- **Proveedor:** en el editor de la orden de pago, en los vencimientos y en la cuenta corriente de Compras (`payment-balances.ts` suma la definición).

## 3. Reglas del servidor

Las operaciones viven en `src/features/Treasury/Checks/actions/` y usan `lib/checks.ts`, el único que cambia `third_party_checks.status` y escribe eventos.

### 3.1 Transiciones

| Desde | Operación | Hacia |
| --- | --- | --- |
| — | Confirmar recibo / carga inicial | EN CARTERA |
| EN CARTERA | Depósito | DEPOSITADO |
| EN CARTERA | Endoso (pagar la orden) | ENDOSADO |
| EN CARTERA | Descuento | DESCONTADO |
| DEPOSITADO, ENDOSADO, DESCONTADO | Rechazo | RECHAZADO |
| EN CARTERA | Anular recibo / carga inicial | ANULADO |
| DEPOSITADO, ENDOSADO, DESCONTADO | Anular la operación | EN CARTERA |
| RECHAZADO | Anular el rechazo | el estado anterior |

Cualquier otra combinación se rechaza con un mensaje que nombra el cheque y su estado.

### 3.2 Recibo

- **Borrador:** guarda los datos del cheque en el medio. Antes de guardar, avisa si ya existe un cheque vigente igual (banco, número y CUIT del librador). El aviso no bloquea el borrador.
- **Confirmar:** crea el cheque EN CARTERA y su movimiento `CUSTOMER_RECEIPT` a la cartera, a la fecha del recibo. Si el índice único rechaza el alta, la confirmación falla con "El cheque Nº … del banco … ya está en la cartera".
- **Anular:** solo si todos sus cheques siguen EN CARTERA. Los cheques pasan a ANULADO y se anulan sus movimientos.
- **Cobrar una deuda:** una línea `REJECTED_CHECK` cobra la deuda de un cheque rechazado, total o parcialmente, igual que una factura.

### 3.3 Depósito

- Uno o varios cheques EN CARTERA, todos de la misma empresa, hacia una cuenta bancaria activa.
- **Acreditación, por cheque:**
  - por defecto, la mayor entre la fecha del depósito y la de pago del cheque;
  - se puede cambiar, pero nunca a una anterior a esa.
- **Sin control del vencimiento:** un cheque vencido para depositar se puede depositar igual.

### 3.4 Endoso

- En `registerPayment`, un medio `THIRD_PARTY_CHECK` toma un cheque EN CARTERA y lo pasa a ENDOSADO, con `supplier_id` el de la orden. Crea el movimiento de salida de la cartera.
- Un cheque no puede ir dos veces en el mismo pago.
- La suma de todos los medios tiene que cerrar el neto a pagar, como hoy. Si el cheque es mayor que lo que falta, el pago no cierra y se rechaza; dar vuelto queda fuera de alcance.
- **Anular la orden (`cancelPaymentOrder`):** solo si ninguno de sus cheques está RECHAZADO. Los cheques vuelven a EN CARTERA y se anulan sus movimientos, como ya ocurre con los demás medios.
- **PDF de la orden:** lista número, banco, librador y fecha de pago de cada cheque.

### 3.5 Descuento

- Uno o varios cheques EN CARTERA, una cuenta bancaria, intereses y comisión.
- El neto es nominal − intereses − comisión, y tiene que ser mayor a 0.
- Se calcula en `lib/check-discount.ts` con la aritmética escalada de `invoice-math`.
- La liquidación guarda intereses y comisión para consulta; no generan asiento.

### 3.6 Rechazo

- Un cheque por operación, desde DEPOSITADO, ENDOSADO o DESCONTADO. Lleva fecha, motivo y quién lo devolvió (banco o proveedor).
- Si el cheque estaba depositado o descontado, saca su importe del banco donde entró.
- Crea la deuda del cliente. Si estaba endosado, también la deuda con el proveedor.
- La fecha del rechazo no puede ser anterior a la operación que lo sacó de la cartera.

### 3.7 Anulaciones

Siempre de la operación completa y con motivo. Cada anulación anula los movimientos de la operación y agrega eventos a cada cheque.

| Qué | Bloqueo | Efecto |
| --- | --- | --- |
| Depósito o descuento | Algún cheque está RECHAZADO | Los cheques vuelven a EN CARTERA |
| Orden de pago con endosos | Algún cheque endosado está RECHAZADO | Los cheques vuelven a EN CARTERA |
| Rechazo | Su deuda (del cliente o del proveedor) aparece en una línea de un recibo o de una orden, en borrador o confirmada | El cheque vuelve a su estado anterior |
| Recibo | Algún cheque no está EN CARTERA | Los cheques quedan ANULADOS |
| Carga inicial (por cheque) | El cheque no está EN CARTERA | El cheque queda ANULADO |

### 3.8 Plazo para depositar

En `lib/checks-dates.ts`:
- el vencimiento es `payment_date + 30 días`;
- el estado de aviso, solo para EN CARTERA, puede ser:
  - `OK`;
  - `DUE_SOON`, si faltan 5 días o menos, contados sobre `treasuryToday()`;
  - `EXPIRED`, si la fecha ya pasó.

### 3.9 Concurrencia

Cada operación hace un `SELECT … FOR UPDATE` sobre sus cheques ordenados por id y vuelve a validar el estado dentro de la transacción. Si dos usuarios toman el mismo cheque, el segundo recibe "El cheque Nº … ya no está en cartera".

La numeración usa el mismo advisory lock por empresa que las transferencias.

## 4. Pantallas

### 4.1 Permisos

Tab `cheques` (`d0000000-0000-0000-0000-000000000007`), por migración a los 3 roles de sistema y en `permissions-map.ts`:
- **view:** cartera y detalle;
- **create:** depositar, descontar y carga inicial;
- **update:** registrar rechazos;
- **delete:** anular depósitos, descuentos, rechazos y cargas iniciales.

El endoso usa el permiso de pago de Compras. Se replica el test de claves de tabs (`tab-permission-keys.test.ts`).

### 4.2 Tab Cheques

Va entre Cobranzas y Retenciones sufridas.

**Encabezado:**
- total EN CARTERA por cartera;
- cantidad de cheques "Por vencer" y "Vencidos para depositar";
- botón "Carga inicial".

**DataTable de cheques**, hecha por `table-expert`:
- **Columnas:** número, banco, tipo, librador, CUIT, cliente, importe, emisión, fecha de pago, vence para depositar (con el badge de aviso), estado, cartera y destino (cuenta o proveedor).
- **Filtros:** uno por columna. Estado y cartera visibles; el estado arranca en EN CARTERA.
- **Selección múltiple de cheques EN CARTERA,** con los botones "Depositar" y "Descontar". Cada uno abre un único formulario con los cheques elegidos y el total; no hay modales encadenados.
- **Export** a Excel.

### 4.3 Detalle del cheque

`/dashboard/treasury/checks/[id]`:
- datos del cheque y estado;
- historial de eventos, con fecha y hora argentina, usuario y link al documento;
- deuda pendiente, si está rechazado;
- acciones según el estado: "Registrar rechazo" y "Anular" la última operación.

### 4.4 Cambios en lo existente

- **Editor del recibo:** en `CHECK` y `ECHECK`, el selector de cuenta solo ofrece carteras (preseleccionada si hay una sola). Pide emisión, fecha de pago, librador y CUIT, precargados del cliente. Muestra el aviso de cheque repetido y lista las deudas por cheques rechazados junto a los comprobantes pendientes.
- **Registrar pago de la orden (Compras):** medio "Cheque de tercero", con un selector de cheques EN CARTERA de la empresa (número, banco, librador, importe y fecha de pago).
- **Editor de la orden de pago:** lista las deudas por cheques rechazados del proveedor.
- **Cuentas corrientes:** las del cliente y del proveedor muestran "Cheque rechazado Nº …" como débito.
- **Configuración de Tesorería:** suma el tipo "Cartera de cheques" al alta de cuentas. Una cartera no ofrece saldo inicial en pesos: sus cheques iniciales se cargan con la carga inicial.
- **Movimientos y transferencias:** las carteras no se ofrecen como cuenta.

## 5. Errores y casos borde

- Cheque repetido vigente → se rechaza al confirmar; la base lo garantiza con el índice único.
- Fecha de pago anterior a la de emisión, CUIT inválido o importe ≤ 0 → error de validación en el formulario.
- Depósito con acreditación anterior a la permitida → error en ese cheque.
- Neto del descuento ≤ 0 → se rechaza.
- Operación sobre un cheque que otro usuario ya movió → error claro, nada se aplica a medias.
- Cheques de otra empresa → se rechazan como inexistentes.
- Rechazo con fecha anterior a la salida de la cartera → se rechaza.
- Filtros de la tabla con valores inválidos → se ignoran, sin error 500 (`lib/filter-values.ts`).

## 6. Tests

**Unitarios (vitest):**
- `checks-dates`: vencimiento, `DUE_SOON` en el límite de 5 días, `EXPIRED` y el caso de las 22:30 AR con `TZ=UTC`;
- `check-discount`: neto y redondeo; neto ≤ 0;
- tabla de transiciones válidas e inválidas;
- schemas de depósito, descuento, rechazo, carga inicial y medios de cheque del recibo y de la orden;
- claves de permisos de la tab.

**Integración** (`test:treasury`, contra el Postgres del compose):
- recibo con 2 cheques → cartera; depósito de uno → banco en su fecha de acreditación; endoso del otro → proveedor; saldos de las tres cuentas en cada paso;
- descuento: la cartera baja el nominal y el banco sube el neto;
- rechazo desde depositado, endosado y descontado, con sus movimientos y deudas; cobrar la deuda del cliente con un recibo y pagar la del proveedor con una orden;
- cada anulación de §3.7 y cada bloqueo;
- depósito y endoso simultáneos del mismo cheque: uno solo gana;
- un cheque repetido se rechaza; uno anulado no bloquea;
- una cartera rechaza movimientos manuales y transferencias;
- filtros hostiles de la tabla de cheques.

**pgTAP** (`prisma/tests/07_treasury_checks.sql`):
- origen de `CHECK_OPERATION` y de las ramas existentes;
- CHECK por estado del cheque y de origen (recibo o carga inicial);
- índice único parcial;
- `THIRD_PARTY_CHECK` rechazado en los medios del recibo;
- número único por empresa y tipo de operación.

Si se crea alguna función SQL con fechas, la cubre el test 06.

**Navegador**, como admin P4:
- la tab Cheques con sus botones;
- el ciclo completo desde un recibo;
- el endoso desde una orden de pago;
- un rechazo y su deuda en las dos cuentas corrientes;
- las anulaciones.

## 7. Demo

Un dominio nuevo, `scripts/demo/domains/third-party-checks.ts`, que corre después de `customer-receipts` y de Compras:
- una cartera "Cartera de cheques";
- recibos con cheques: dos EN CARTERA (uno por vencer y uno vencido para depositar), uno depositado y acreditado, uno depositado a acreditar, uno endosado en una orden pagada, uno descontado y uno rechazado con su deuda;
- una carga inicial de dos cheques.

El RE-000003 de la demo actual (e-cheq "A acreditar" a un banco) pasa a ir a la cartera.

`verify`:
- el saldo de la cartera es la suma de sus cheques EN CARTERA;
- cada cheque tiene sus movimientos según §2.6;
- la deuda del rechazado coincide con el cálculo a mano.

## 8. Manual

En la sección `tesoreria.ts` se suman cuatro guías:
- Cartera de cheques;
- Depositar y descontar cheques;
- Rechazo de un cheque;
- Endosar cheques en una orden de pago.

Se actualizan:
- las guías del recibo (medio cheque, cartera y librador);
- la de configuración de Tesorería (cuenta tipo cartera);
- la del pago de órdenes de Compras.

Verificación con `npm run manual:check`.

## 9. Fuera de alcance de la etapa 3a

- Cheques propios (chequeras, emisión y conciliación), que van en la etapa 3b.
- Vuelto al endosar un cheque mayor que lo que falta pagar.
- Endosar en un pago que no sea una orden de pago.
- Asiento contable de intereses y comisiones del descuento.
- Integración con la API de e-cheqs de los bancos.
- Migrar a la cartera los cheques de recibos ya confirmados en la etapa 2.

## 10. Rama y entrega

Se trabaja en la rama `feat/tesoreria`, en un solo commit: `feat(tesoreria): etapa 3a - cheques de terceros`.

**Antes del commit:**
- `check-types`;
- unitarios;
- `test:db`;
- `test:treasury` y `test:purchases`;
- `manual:check`.

**Push y PR a `main`:** recién al cerrar el módulo, con `npx next build` antes.
