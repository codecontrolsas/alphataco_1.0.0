# Tesorería — Etapa 1: cuentas, saldos, movimientos y transferencias

**Fecha:** 2026-10-10
**Estado:** diseño aprobado en conversación (2026-10-10), pendiente de revisión de la spec escrita
**Contexto:** Compras (etapas 1 a 5, PR #8) dejó `treasury_accounts` como catálogo de cuentas bancarias y cajas, y registra los medios de pago de cada orden de pago en `payment_order_payments`, pero no mueve saldos. Tesorería es el módulo que sigue.

Rigen las convenciones de Almacenes y Compras:
- multiempresa por `company_id`, con la empresa siempre resuelta en el servidor;
- mutaciones con `ActionResult` (los errores de negocio llegan al usuario en producción);
- schemas Zod en módulos sin directiva;
- permisos por tab, cargados por migración solo a los 3 roles de sistema;
- numeración con advisory lock por empresa y `MAX()+1`;
- nada se borra si tiene historia: se anula (con motivo) o se desactiva.

## 1. Objetivo

Tesorería va a cubrir **dónde está la plata y qué le pasa**: saldos de bancos y cajas, cobranzas a clientes, cheques y conciliación bancaria. Solo en pesos. Se construye en cuatro etapas, cada una usable por sí sola:

| # | Etapa | Qué deja andando |
| --- | --- | --- |
| **1** | **Cuentas y movimientos** | **Esta spec.** Saldo de cada cuenta y caja, extracto, movimientos manuales, transferencias entre cuentas, y los pagos de Compras moviendo el saldo. |
| 2 | Cobranzas | Recibo numerado (`RE-000001`) con PDF que cancela facturas de Comercial, con uno o varios medios. Retenciones sufridas con su certificado por recibo y listado mensual. Cuenta corriente del cliente. |
| 3 | Cheques | **De terceros** (recibidos en cobranzas): cartera, depósito, endoso a proveedores en una orden de pago, rechazo y descuento/venta. **Propios**: chequeras y e-cheqs, con el débito en la fecha de pago del cheque. |
| 4 | Conciliación bancaria | Importación del extracto del banco (Excel/CSV con un perfil de columnas por banco) y conciliación automática por importe y fecha, más la manual. Movimientos del banco sin registrar se dan de alta desde el extracto. |

La etapa 1 resuelve **cuánto hay en cada cuenta hoy, cuánto se va a debitar, y por qué cambió**. Todas las etapas siguientes escriben en el mismo libro de movimientos.

### Decisiones

| Tema | Decisión |
| --- | --- |
| Arquitectura | **Un solo libro de movimientos** (`treasury_movements`): toda entrada o salida de plata es una fila, con el documento que la originó. El saldo es la suma. Cobranzas, cheques y conciliación (etapas 2 a 4) agregan tipos de movimiento, no tablas de saldo propias. |
| Moneda | Solo pesos. La cuenta guarda `currency = 'ARS'` para no cerrar la puerta, pero no hay cotizaciones ni conversión. |
| Saldo | **Se calcula, no se guarda.** Es la suma de los movimientos vigentes con fecha hasta hoy. No hay columna de saldo que mantener sincronizada. |
| Movimientos futuros | Un pago con cheque o e-cheq se registra con la **fecha de pago del cheque**. Hasta ese día figura como "a debitar" y no baja el saldo. Así se obtiene el débito al vencimiento sin ningún proceso que lo dispare. |
| Escritura | **Sin triggers.** Cada movimiento se escribe en la misma transacción que su documento de origen, desde una única función de `lib/`. |
| Saldo negativo | **Avisa, no bloquea.** Un banco puede girar en descubierto y el pago ya ocurrió; una caja en negativo pide confirmación. |
| Cuentas y cajas | Pasan de Configuración de Compras a **Configuración de Tesorería**. Compras las sigue usando para pagar. |

## 2. Modelo de datos

### 2.1 Cuentas (cambios sobre `treasury_accounts`)

- Se agrega `currency` `VarChar(3)` con default `'ARS'` y CHECK `currency = 'ARS'`. El formulario no la muestra.
- Se agrega `updated_at`.
- El **saldo inicial no es una columna**: es un movimiento `OPENING` (ver 2.2).
- Una cuenta con movimientos o con pagos de Compras no se borra: se desactiva. Una sin uso se puede borrar.
- Una cuenta inactiva no acepta movimientos nuevos (manuales, transferencias ni pagos). Sus movimientos y su saldo se siguen viendo.

### 2.2 Movimientos

- **`treasury_movements`**
  - `company_id`, `account_id`;
  - `date` (`Date`): la fecha en que la plata entra o sale de la cuenta (la fecha valor);
  - `amount` `Decimal(15,2)` **con signo**: positivo entra, negativo sale. Nunca 0;
  - `kind` (enum `treasury_movement_kind`): `OPENING`, `MANUAL`, `TRANSFER`, `SUPPLIER_PAYMENT`. Las etapas siguientes agregan los suyos (`COLLECTION`, `CHECK_DEPOSIT`, …);
  - `concept_id?` y `description?`;
  - origen, FK explícitas y nullables:
    - `payment_order_payment_id?`, **único** (un medio de pago genera un solo movimiento);
    - `transfer_id?`;
  - `created_by`, `created_at`, `updated_at`;
  - anulación: `cancelled_by?`, `cancelled_at?`, `cancel_reason?`.
  - Índices: `(account_id, date)` y `(company_id, date)`.
- **`treasury_concepts`**: catálogo por empresa para clasificar los movimientos manuales (gastos bancarios, aporte de socios, retiro, comisiones, impuesto a los débitos y créditos…).
  - `company_id`, `name` (único por empresa), `direction` (enum `treasury_concept_direction`: `IN`, `OUT`, `BOTH`), `is_active`, `created_at`.
  - Un concepto usado no se borra: se desactiva.
- **`treasury_transfers`**: traspaso entre dos cuentas de la empresa.
  - `company_id`, `number` (`TR-000001`, único por empresa), `date`, `from_account_id`, `to_account_id`, `amount` (positivo), `notes?`;
  - `created_by`, `created_at`, y anulación (`cancelled_by?`, `cancelled_at?`, `cancel_reason?`).
  - Genera **dos movimientos** `TRANSFER` con su `transfer_id`: el negativo en la cuenta de origen y el positivo en la de destino, con la misma fecha.

### 2.3 CHECK en la base (la red; los mensajes salen de las validaciones del servidor)

- Movimiento: `amount <> 0`.
- Cada tipo tiene exactamente su origen:
  - `OPENING`: sin `concept_id`, sin `transfer_id`, sin `payment_order_payment_id`;
  - `MANUAL`: con `concept_id`, sin los otros dos orígenes;
  - `TRANSFER`: con `transfer_id`, sin `concept_id` ni `payment_order_payment_id`;
  - `SUPPLIER_PAYMENT`: con `payment_order_payment_id`, sin `concept_id` ni `transfer_id`, y `amount < 0`.
- Un solo saldo inicial vigente por cuenta: índice único parcial sobre `account_id` donde `kind = 'OPENING' AND cancelled_at IS NULL`.
- Anulación completa o nada: `cancelled_by`, `cancelled_at` y `cancel_reason` van juntos (movimiento y transferencia).
- Transferencia: `from_account_id <> to_account_id` y `amount > 0`.

## 3. Reglas del servidor

- **Una sola escritura.** Todo movimiento se crea y se anula desde `src/features/Treasury/lib/movements.ts`. La llaman las actions de Tesorería y `registerPayment` / `cancelPaymentOrder` de Compras; en las etapas siguientes, Cobranzas y Cheques. Ningún otro código hace `treasury_movements.create`.
- **Una sola lectura de saldos.** Saldo, a debitar, proyectado y extracto salen de `src/features/Treasury/lib/balances.ts`, con una consulta agregada por cuenta (no N+1). La usan las tarjetas de cuentas, el extracto, el aviso de saldo negativo y el selector de cuentas del pago de Compras.
- **Indicadores por cuenta** (siempre solo movimientos sin anular):
  - **Saldo**: suma con `date <= hoy`;
  - **A debitar**: suma de los negativos con `date > hoy`;
  - **A acreditar**: suma de los positivos con `date > hoy` (en esta etapa solo los genera una transferencia o un manual con fecha futura);
  - **Proyectado**: saldo + a debitar + a acreditar.
  - "Hoy" es la fecha local (`moment().format('YYYY-MM-DD')`), no UTC.
- **Extracto** de una cuenta entre `desde` y `hasta`: el **saldo anterior** (suma con `date < desde`), los movimientos del período ordenados por `date` y `created_at`, y el **saldo acumulado** fila por fila. Los anulados se muestran tachados, con el motivo, y no suman.
- **Empresa:** sale de la sesión (`getActiveCompanyId`). Cuenta, concepto, transferencia y movimiento se validan contra esa empresa.
- **Movimiento manual:**
  - el formulario pide cuenta, fecha, **Ingreso / Egreso**, importe positivo, concepto y descripción opcional. El servidor arma el signo;
  - el concepto tiene que estar activo y admitir ese sentido. Si no, _"El concepto «Gastos bancarios» es solo de egresos"_;
  - se edita (todos sus campos) mientras no esté anulado; se anula con motivo;
  - fecha futura permitida (un débito programado).
- **Movimientos automáticos** (`TRANSFER`, `SUPPLIER_PAYMENT`): no se editan ni se anulan desde Movimientos. El detalle linkea al documento de origen: _"Este movimiento es del pago de la OP-000012. Para revertirlo, anulá la orden de pago"_.
- **Saldo inicial:** uno por cuenta, con fecha e importe (puede ser negativo, un banco en descubierto). Se carga al crear la cuenta o después desde la ficha. Se edita mientras no esté anulado; un segundo saldo inicial se rechaza: _"La cuenta ya tiene saldo inicial al 01/10/2026: editalo"_.
- **Transferencia:**
  - origen y destino distintos, los dos activos y de la empresa; importe positivo;
  - numeración `TR-` con advisory lock por empresa;
  - no se edita: se anula con motivo (anula los dos movimientos en la misma transacción) y se carga de nuevo.
- **Saldo negativo:** al guardar un egreso o una transferencia, el formulario muestra el saldo que queda en la fecha del movimiento. Si da negativo en una **caja**, pide confirmar (_"La caja queda en $ −15.000,00. ¿Guardar igual?"_); en un banco solo lo informa. El servidor no bloquea.
- **Concurrencia:** como el saldo no bloquea, los movimientos no lockean la cuenta. Las transiciones de un movimiento o una transferencia (editar, anular) lockean esa fila (`FOR UPDATE`) y fallan con mensaje si ya estaba anulada.

### 3.1 Enganche con Compras

- **`registerPayment`**, en su misma transacción, crea un movimiento `SUPPLIER_PAYMENT` por cada fila de `payment_order_payments`:
  - cuenta: la del medio; importe: `−amount`;
  - fecha: la **fecha de pago del cheque** (`check_due_on`) en `CHECK` y `ECHECK`; la fecha de pago de la orden (`paid_on`) en `TRANSFER` y `CASH`;
  - descripción: `OP-000012 — <proveedor>` y, si es cheque, su número.
  - Si falla la creación del movimiento, no se registra el pago.
- **`cancelPaymentOrder`** de una orden pagada anula sus movimientos en la misma transacción, con el motivo de la anulación de la orden.
- **Backfill:** la migración crea el movimiento de cada `payment_order_payments` ya existente, con las mismas reglas de fecha y `created_by` = quien registró el pago (`paid_by`). Si la orden está anulada, el movimiento nace anulado con su fecha y motivo. Los pagos con neto 0 no tienen medios y no generan nada.
- El selector de cuentas del diálogo **Registrar pago** muestra el saldo de cada cuenta.

## 4. Pantallas

Módulo **Tesorería** en el menú (`/dashboard/treasury`), después de Compras, con cuatro tabs:

| Tab | Contenido | Acciones de permiso |
| --- | --- | --- |
| **Cuentas** | Tarjetas por cuenta y caja activa: nombre, banco, **saldo**, **a debitar**, **a acreditar** y **proyectado**; totales de bancos y de cajas. Cada tarjeta abre el extracto. | `view` |
| **Movimientos** | DataTable de todos los movimientos: fecha, cuenta, tipo, concepto, descripción, origen (link), ingreso, egreso, estado. Botón "Nuevo movimiento". | `view`, `create`, `update` |
| **Transferencias** | DataTable: número, fecha, origen, destino, importe, notas, estado. Botón "Nueva transferencia". | `view`, `create`, `update` |
| **Configuración** | **Cuentas y cajas** (ABM con saldo inicial; se muda desde Compras) y **Conceptos** (ABM con sentido). | `view`, `update` |

`update` en Movimientos es editar y anular manuales y saldos iniciales; en Transferencias, anular.

**Páginas**
- **Extracto de la cuenta** (`/dashboard/treasury/accounts/[id]`):
  - encabezado con los cuatro indicadores y los datos de la cuenta (banco, número, CBU);
  - período **Desde / Hasta** (default: el mes en curso), saldo anterior, movimientos con saldo acumulado y saldo final;
  - los movimientos futuros aparecen marcados "a debitar" / "a acreditar";
  - **Excel** del extracto y **Nuevo movimiento** con la cuenta elegida.

**Formularios** (RHF + Zod, fechas escribibles)
- **Nuevo / editar movimiento**: un solo formulario. El selector de concepto filtra por el sentido elegido.
- **Nueva transferencia**: origen, destino (sin la de origen), fecha, importe y notas, con el saldo de las dos cuentas a la vista.
- **Cuenta o caja**: tipo, nombre, banco, número y CBU (solo banco), y en el alta una sección **Saldo inicial (opcional)** con fecha e importe. Un único botón Guardar.

**Compras**
- Configuración de Compras pierde la sección de cuentas y muestra en su lugar un aviso con link a Configuración de Tesorería.
- El detalle de la orden de pago pagada muestra, por medio de pago, el movimiento de Tesorería (fecha valor y si está "a debitar").

**DataTables:** las crea el agente `table-expert` (regla del proyecto).

### 4.1 Permisos

Módulo nuevo `tesoreria` con id `d0000000-0000-0000-0000-000000000000` y tabs `d0000000-…-000000000001` a `…004`:

| Tab (slug) | Acciones |
| --- | --- |
| `cuentas` | `view` |
| `movimientos` | `view`, `create`, `update` |
| `transferencias` | `view`, `create`, `update` |
| `config-tesoreria` | `view`, `update` |

- La migración inserta el módulo, las tabs y los `role_permissions` de los 3 roles de acceso completo (`admin`, `administrador`, `full-access-provisional`), y nada más.
- Las acciones de cuentas pasan de `compras:config-compras:update` a `tesoreria:config-tesoreria:update`. La lista de cuentas activas con saldo para pagar se lee con `compras:pagos:view`.
- Las claves `tesoreria:<tab>:<acción>` de las tabs se validan contra `permissions-map.ts` con un test, como en Compras.

## 5. Errores y casos borde

| Caso | Respuesta |
| --- | --- |
| Movimiento o transferencia en una cuenta inactiva | _"La cuenta «Caja chica» está inactiva"_ |
| Transferencia a la misma cuenta | _"Elegí cuentas distintas"_ (también en el Zod) |
| Concepto con el sentido equivocado o inactivo | _"El concepto «Gastos bancarios» es solo de egresos"_ / _"…está inactivo"_ |
| Editar o anular un automático desde Tesorería | Rechazado, con el documento de origen en el mensaje |
| Segundo saldo inicial | Rechazado, nombrando la fecha del vigente |
| Anular algo ya anulado | _"El movimiento ya estaba anulado"_ / _"La TR-000004 ya estaba anulada"_ |
| Borrar una cuenta con movimientos o pagos | _"La cuenta tiene movimientos: desactivala"_ |
| Desactivar una cuenta con saldo distinto de 0 | Se permite, con confirmación mostrando el saldo |

## 6. Tests

- **Unitarios** (`balances` con datos en memoria): saldo, a debitar, a acreditar y proyectado con movimientos pasados, de hoy, futuros y anulados; saldo anterior y acumulado del extracto; signo según Ingreso/Egreso.
- **Integración** contra el Postgres del compose, con `npm run test:treasury` sumado al job `db-tests` del CI:
  - movimiento manual: alta, edición, anulación con motivo; concepto con sentido equivocado e inactivo; cuenta inactiva;
  - saldo inicial: alta, edición, segundo rechazado;
  - transferencia: dos movimientos con la misma fecha, numeración, anulación de los dos, misma cuenta rechazada;
  - Compras: pagar una orden con transferencia + e-cheq crea dos movimientos, el del e-cheq con la fecha del cheque y fuera del saldo hasta esa fecha; anular la orden anula los dos; neto 0 no crea nada;
  - un automático no se edita ni se anula desde Tesorería;
  - perímetro de empresa (cuenta, concepto y transferencia de otra empresa) y permisos.
- **pgTAP:** los CHECK de tipo y origen, `amount <> 0`, el índice del saldo inicial, la anulación completa o nada y el CHECK de transferencia; que el backfill dé un movimiento por cada pago existente.
- **Test de claves de permiso** de las tabs de Tesorería.
- **Navegador:** cada tab como admin (con sus botones de alta), extracto con saldo anterior y Excel, pago de una orden de Compras y su reflejo en la cuenta, ancho de 375 px.
- **Build:** `npx next build` completo antes del PR, además de `check-types`.

## 7. Demo

- Conceptos: gastos bancarios (egreso), impuesto a los débitos y créditos (egreso), aporte de socios (ingreso), retiro de caja (egreso), ajuste (ambos).
- Saldo inicial al primer día del mes anterior para las tres cuentas de la demo de Compras (Galicia, Nación, Caja).
- Algunos manuales (gastos bancarios del mes, un aporte) y una transferencia del banco a la caja.
- Los pagos de las órdenes de la demo de Compras generan sus movimientos por el camino normal; uno con e-cheq a fecha futura queda "a debitar".
- Una verificación controla que cada pago tenga su movimiento y que los saldos den lo esperado.

## 8. Manual

Sección nueva **Tesorería** con cinco guías:
- **Cómo funciona Tesorería**: el libro de movimientos, saldo vs. a debitar, y las etapas que vienen;
- **Cuentas y saldos**: las tarjetas y el extracto;
- **Movimientos**: manuales, automáticos y anulación;
- **Transferencias**;
- **Configuración de Tesorería**: cuentas y cajas con saldo inicial, y conceptos.

Se actualizan **Configuración de Compras** (las cuentas se mudaron) y **Órdenes de pago** (el pago ahora mueve el saldo; los cheques debitan en su fecha). Se verifica con `npm run manual:check`.

## 9. Fuera de alcance de la etapa 1

- Cobranzas, recibos y retenciones sufridas (etapa 2).
- Cartera de cheques, chequeras, depósitos, endosos, rechazos y descuentos (etapa 3). En esta etapa un pago con cheque solo deja su movimiento a la fecha del cheque.
- Importación de extractos y conciliación (etapa 4).
- Multimoneda y cotizaciones.
- Arqueo y cierre de caja.
- Asientos contables.
- Presupuesto financiero (flujo de fondos proyectado con vencimientos de clientes y proveedores).

## 10. Rama y entrega

Rama `feat/tesoreria` desde `feat/compras-etapa-1` (Tesorería depende de Compras, todavía sin mergear). Un commit por etapa; push y PR a `main` al cerrar el módulo.
