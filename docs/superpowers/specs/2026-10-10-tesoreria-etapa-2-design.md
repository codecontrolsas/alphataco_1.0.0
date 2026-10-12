# Tesorería — Etapa 2: cobranzas, retenciones sufridas y cuenta corriente del cliente

**Fecha:** 2026-10-10
**Estado:** aprobada (2026-10-10). Ajustada al planificar: PDF a demanda como Compras, certificados por el proxy `/api/files`, `sent_to` como lista, slug `retenciones-sufridas`.
**Contexto:** la etapa 1 (commit `80a944a4`, spec `2026-10-10-tesoreria-etapa-1-design.md`) dejó el libro único `treasury_movements`. Ahí se escribe solo por `lib/movements.ts` y se lee solo por `lib/balances.ts`. Comercial emite facturas, notas de débito y notas de crédito electrónicas (`invoices`), pero nada registra su cobro.

Rigen las convenciones de la etapa 1:
- multiempresa por `company_id`, con la empresa resuelta en el servidor;
- `ActionResult` en las mutaciones;
- schemas Zod en módulos sin directiva;
- permisos por tab, cargados por migración solo a los 3 roles de sistema;
- numeración con advisory lock por empresa y `MAX()+1`;
- lo que tiene historia no se borra: se anula con motivo;
- "hoy" es `treasuryToday()` (fecha de Argentina).

## 1. Objetivo

Registrar **qué cobró la empresa, a quién y contra qué comprobantes**:
- el **recibo** (`RE-000001`), con PDF, que cancela total o parcialmente facturas y notas de débito de Comercial;
- los **medios** con los que se cobró, que mueven el saldo de las cuentas;
- las **retenciones sufridas**, con su certificado;
- los **anticipos** del cliente;
- la **cuenta corriente del cliente**.

### Decisiones

| Tema | Decisión |
| --- | --- |
| Moneda extranjera | Las cuentas siguen siendo solo en pesos. Un comprobante en USD o EUR se cobra **en pesos**, a la cotización del día del cobro, que carga el usuario. El comprobante conserva su pendiente **en su moneda**. El recibo muestra la **diferencia de cambio** contra la cotización del comprobante; es informativa, sin asiento contable. |
| Retenciones sufridas | Por cada una se guardan impuesto (Ganancias, IVA, IIBB, SUSS), jurisdicción (solo IIBB), número y fecha del certificado, importe y el **PDF del certificado**. Listado mensual por impuesto, exportable a Excel con un link a cada certificado. |
| Flujo del recibo | **Borrador** (editable, sin número, sin efecto) → **confirmado** (toma número, mueve saldos, cancela comprobantes) → **anulado** (con motivo). Se puede enviar al cliente por email con el PDF. |
| Cheques recibidos (antes de la etapa 3) | Se cargan número, banco, vencimiento y la cuenta donde se va a depositar. El movimiento queda "A acreditar" hasta su vencimiento. En la etapa 3 pasan a la cartera de cheques. |
| Ubicación | En Tesorería: tab **Cobranzas** (vistas "A cobrar" y "Recibos") y tab **Retenciones sufridas**. La cuenta corriente es una página de Tesorería por cliente, linkeada desde la ficha del cliente y desde la factura en Comercial. |
| Anticipos | Un recibo puede cobrar un importe **a cuenta**, que queda como saldo a favor del cliente. Un recibo posterior lo aplica a comprobantes sin mover plata. |
| Saldo de los comprobantes | Tabla de aplicación (líneas del recibo), a la manera de `payment_order_lines`. `invoices` **no se toca**: su trigger de inmutabilidad (`prisma/sql/invoicing.sql`) solo deja cambiar los datos del PDF y de revisión en una factura autorizada. |

## 2. Modelo de datos

### 2.1 Recibo: `customer_receipts`

| Columna | Detalle |
| --- | --- |
| `id`, `company_id`, `customer_id` | El cliente es de la empresa. |
| `number` | `RE-000001`, único por empresa. `NULL` mientras es borrador: lo toma al confirmar. |
| `status` | enum `customer_receipt_status`: `DRAFT`, `CONFIRMED`, `CANCELLED`. |
| `date` | Fecha del cobro (`@db.Date`). No puede ser futura. |
| `notes` | Observaciones, opcional. |
| `invoices_total` | Pesos imputados a comprobantes (suma de `amount_ars` de las líneas `INVOICE`). |
| `advance_total` | Pesos cobrados a cuenta (líneas `ADVANCE`). |
| `advances_applied_total` | Pesos de anticipos anteriores aplicados (líneas `ADVANCE_APPLIED`). |
| `withholdings_total` | Pesos retenidos. |
| `received_total` | Pesos que entraron por los medios. |
| `fx_difference_total` | Suma de la diferencia de cambio de las líneas. Informativa. |
| `sent_at`, `sent_to` | Último envío por email (`sent_to` es `String[]`, como en las órdenes de Compras). |
| `created_by`, `created_at`, `updated_at` | |
| `confirmed_by`, `confirmed_at` | |
| `cancelled_by`, `cancelled_at`, `cancel_reason` | Anulación completa o nada (CHECK). |

Los totales los recalcula el servidor en cada guardado. Nunca vienen del cliente.

**Ecuación de cierre** (en pesos, exacta al centavo):

```
invoices_total + advance_total = advances_applied_total + withholdings_total + received_total
```

Un borrador puede no cerrar. Un recibo confirmado cierra siempre.

### 2.2 Líneas: `customer_receipt_lines`

| Columna | Detalle |
| --- | --- |
| `id`, `receipt_id` | `ON DELETE CASCADE` (solo se borran con el borrador). |
| `kind` | enum `customer_receipt_line_kind`: `INVOICE`, `ADVANCE`, `ADVANCE_APPLIED`. |
| `invoice_id` | Solo en `INVOICE`: factura o nota de débito autorizada del cliente. |
| `currency` | Moneda del comprobante (`ARS`, `USD`, `EUR`). `ARS` en los anticipos. |
| `applied_amount` | Lo que cancela, **en la moneda del comprobante**. Mayor a 0. |
| `exchange_rate` | Cotización del cobro. `1` en pesos. |
| `invoice_exchange_rate` | Copia de `invoices.exchange_rate` al cargar la línea. `1` en pesos. |
| `amount_ars` | `round(applied_amount × exchange_rate, 2)`. |
| `fx_difference` | `round(applied_amount × (exchange_rate − invoice_exchange_rate), 2)`. `0` en pesos. Positiva = ganancia. |
| `source_line_id` | Solo en `ADVANCE_APPLIED`: la línea `ADVANCE` de otro recibo que se consume. |
| `description` | Opcional; en `ADVANCE` describe el cobro a cuenta. |

CHECKs:
- `INVOICE` lleva `invoice_id` y no lleva `source_line_id`;
- `ADVANCE` no lleva ni `invoice_id` ni `source_line_id`, y es en pesos;
- `ADVANCE_APPLIED` lleva `source_line_id`, no lleva `invoice_id`, y es en pesos;
- `applied_amount > 0`; `exchange_rate > 0`.

Un comprobante aparece como mucho una vez por recibo (índice único parcial `(receipt_id, invoice_id)`), lo mismo que un anticipo de origen (`(receipt_id, source_line_id)`).

### 2.3 Retenciones sufridas: `customer_receipt_withholdings`

| Columna | Detalle |
| --- | --- |
| `id`, `receipt_id` | `ON DELETE CASCADE`. |
| `company_id`, `customer_id` | Copias del recibo, para el índice único y el listado. |
| `tax` | Reusa el enum `withholding_tax` (`GANANCIAS`, `IVA`, `IIBB`, `SUSS`). |
| `jurisdiction` | Texto; obligatoria si `tax = IIBB`, nula si no (CHECK). |
| `certificate_number`, `certificate_date` | |
| `amount` | En pesos, mayor a 0. |
| `file_path`, `file_name` | PDF del certificado en MinIO, bucket nuevo `customer-documents` (key `<companyId>/<customerId>/withholdings/<timestamp>-<archivo>`). Opcional. |

El certificado no se repite por `(company_id, customer_id, tax, certificate_number)` entre recibos no anulados. Como el estado vive en el recibo, esa unicidad la valida el servidor (3.4) y la base solo tiene un índice no único sobre esas columnas para buscar rápido.

### 2.4 Medios: `customer_receipt_payments`

| Columna | Detalle |
| --- | --- |
| `id`, `receipt_id` | `ON DELETE CASCADE`. |
| `method` | Reusa `payment_method` (`TRANSFER`, `CHECK`, `ECHECK`, `CASH`). |
| `treasury_account_id` | Cuenta o caja de la empresa, activa. |
| `amount` | En pesos, mayor a 0. |
| `reference` | Opcional. |
| `check_number`, `check_bank`, `check_due_on` | Obligatorios en `CHECK` y `ECHECK` (CHECK en la base). |

### 2.5 Cambios en el libro

- `treasury_movement_kind` suma `CUSTOMER_RECEIPT`.
- `treasury_movements` suma `customer_receipt_payment_id` (`@unique`, FK a `customer_receipt_payments`).
- `treasury_movements_origin_check` se reemplaza. Cada tipo sigue con exactamente su origen, y se suma:
  `kind = 'CUSTOMER_RECEIPT' AND customer_receipt_payment_id IS NOT NULL AND concept_id IS NULL AND transfer_id IS NULL AND payment_order_payment_id IS NULL AND amount > 0`.
  Las ramas existentes exigen además `customer_receipt_payment_id IS NULL`.

### 2.6 Pendiente de un comprobante

Una sola función de lectura, `src/features/Treasury/lib/receivables.ts`, con el patrón de `src/features/Purchases/lib/payment-balances.ts`. Calcula en la moneda del comprobante:

```
pendiente = total
          − Σ total de las notas de crédito autorizadas con associated_invoice_id = comprobante
          − Σ applied_amount de las líneas INVOICE en recibos DRAFT o CONFIRMED
```

- Los **borradores reservan**: dos borradores no pueden cobrar lo mismo. Para un borrador que se edita, su propio aporte se excluye (`excludeReceiptId`).
- "A cobrar" distingue "En borrador" (reservado por un borrador) del pendiente libre.
- Si una nota de crédito llega después de cobrar la factura, el pendiente queda negativo. Se muestra como **saldo a favor** en la cuenta corriente y no aparece en "A cobrar". Aplicar o devolver ese saldo queda fuera de alcance.

**Disponible de un anticipo** (`lib/receivables.ts`):

```
disponible = applied_amount de la línea ADVANCE (recibo CONFIRMED)
           − Σ applied_amount de las líneas ADVANCE_APPLIED que la apuntan, en recibos DRAFT o CONFIRMED
```

Los anticipos de un recibo en borrador o anulado no tienen disponible.

## 3. Reglas del servidor

Actions en `src/features/Treasury/actions/receipts.server.ts`, `withholdings.server.ts` y `customer-statement.server.ts`. La lógica pura (cierre, conversión, diferencia de cambio, pendientes, cuenta corriente) va en `src/features/Treasury/lib/` con tests unitarios.

### 3.1 Borrador

- **Crear** pide cliente y fecha. El cliente es de la empresa y está activo.
- **Guardar** reemplaza líneas, retenciones y medios del borrador en una transacción, y recalcula los totales. Mientras guarda:
  - bloquea el recibo (`FOR UPDATE`) y verifica que siga en `DRAFT`;
  - bloquea los comprobantes y las líneas `ADVANCE` de origen en orden de id, y verifica que **nada supere el pendiente o el disponible**, sin contar este borrador;
  - cada comprobante: del cliente, de la empresa, `status = autorizada`, tipo factura o nota de débito (`cbte_type` 1, 2, 6, 7, 11, 12). Los simulados se aceptan;
  - cada anticipo de origen: del mismo cliente, de un recibo confirmado;
  - una cotización por moneda extranjera: todas las líneas de esa moneda usan la misma;
  - fecha no futura.
- El borrador **no tiene que cerrar** para guardarse.
- **Borrar** un borrador es físico (cascade). No tiene número ni movimientos.

### 3.2 Confirmación

Una transacción:
1. bloquea el recibo y verifica `DRAFT`;
2. bloquea comprobantes y anticipos de origen en orden de id y **recalcula** pendientes y disponibles;
3. verifica que el recibo tenga al menos una línea y que **cierre exacto**. Si no: _"El recibo no cierra: faltan $ 1.250,00"_ (o _"sobran"_);
4. verifica cuentas activas y de la empresa, y datos completos de los cheques;
5. toma el número `RE-` con el advisory lock por empresa;
6. crea un movimiento `CUSTOMER_RECEIPT` positivo por cada medio, por `lib/movements.ts`:
   - cuenta e importe: los del medio;
   - fecha: la del cobro. En `CHECK` y `ECHECK`, el **vencimiento** del cheque, o la del cobro si el cheque ya venció. Un vencimiento futuro deja el movimiento "A acreditar";
   - descripción: `RE-000001 — <cliente>` y, si es cheque, su número;
7. guarda `status = CONFIRMED`, `confirmed_by`, `confirmed_at`.

Si falla cualquier paso, no se confirma nada.

**No hay regla de medio contra tipo de cuenta**: igual que en el pago de Compras, cualquier medio puede ir a cualquier cuenta o caja.

Un recibo confirmado **no se edita**. Si hay un error, se anula y se hace otro. Lo único que cambia en un recibo confirmado es el **certificado de una retención** (3.4) y los datos de envío.

### 3.3 Anulación

- Solo de un recibo `CONFIRMED`, con motivo obligatorio. Conserva su número.
- En una transacción: bloquea el recibo, verifica el estado, anula sus movimientos por `lib/movements.ts` con el mismo motivo y pasa a `CANCELLED`. Comprobantes y anticipos quedan liberados porque los recibos anulados no cuentan en 2.6.
- **Se bloquea** si una línea `ADVANCE` de este recibo está aplicada en otro recibo `DRAFT` o `CONFIRMED`: _"El anticipo de este recibo se aplicó en RE-000005: anulá ese recibo primero"_ (en un borrador: _"…en un recibo en borrador: quitalo de ahí primero"_).
- La etapa 3 sumará el bloqueo de un cheque ya depositado o endosado.
- Un recibo anulado no se reactiva ni se envía.

### 3.4 Retenciones y certificados

- El PDF del certificado es **opcional**: suele llegar días después del cobro. Se puede adjuntar o reemplazar en cualquier estado salvo `CANCELLED`, con `retenciones-sufridas:update` o `cobranzas:update`.
- Solo se aceptan PDF, hasta 10 MB. Al reemplazar, se borra el archivo anterior de MinIO después de guardar.
- Número de certificado repetido para el mismo cliente e impuesto (en un recibo no anulado) se rechaza al guardar el borrador y al confirmar, con un advisory lock por cliente: _"El certificado 0001-00001234 de IIBB ya está cargado en RE-000002"_.

### 3.5 PDF y envío

- El PDF se genera **a demanda**, como el de la orden de pago de Compras (`renderPaymentOrderPdf` + `getPaymentOrderPdf`): no se guarda en MinIO, así que siempre refleja el estado actual. Lleva:
  - empresa y cliente (razón social, CUIT, condición de IVA);
  - número y fecha;
  - comprobantes cancelados, con moneda, importe aplicado, cotización e importe en pesos;
  - cobros a cuenta y anticipos aplicados;
  - retenciones;
  - medios, con los datos del cheque;
  - diferencia de cambio total, si la hay;
  - marca de agua **ANULADO** en un recibo anulado.
- **Enviar al cliente**: dialog con los destinatarios (propone `customers.client_email`; al menos uno, válidos, sin repetir — reusa `sendDocumentSchema` de Compras) y un mensaje opcional; adjunta el PDF. Template nuevo en `src/shared/lib/mail/templates/`, con el patrón de `sendSupplierDocumentEmail`. Guarda `sent_at` y `sent_to`. Si el mail falla, no guarda nada y lo informa.

### 3.6 Cuenta corriente del cliente

`getCustomerStatement(customerId, from, to)`, una consulta por bloque (no N+1):
- **por moneda**, sin convertir: saldo anterior a `from`, movimientos del período y saldo acumulado;
- movimientos: facturas y notas de débito autorizadas al **debe**; notas de crédito autorizadas y líneas `INVOICE` de recibos confirmados al **haber** (en la moneda del comprobante);
- en pesos, además: cobros a cuenta al haber y anticipos aplicados al debe, para que el saldo a favor se vea en la misma columna;
- los recibos anulados no figuran;
- encabezado: saldo por moneda, anticipos disponibles y saldo a favor por notas de crédito.

### 3.7 Concurrencia

- Toda transición (guardar, confirmar, anular, adjuntar) bloquea el recibo con `FOR UPDATE` y falla con mensaje si el estado cambió: _"El recibo ya fue confirmado"_, _"El recibo ya está anulado"_.
- Guardar y confirmar bloquean, en orden de id, los comprobantes y las líneas `ADVANCE` de origen. Así dos recibos no reservan el mismo pendiente.
- Las transacciones largas usan `TRANSACTION_OPTIONS` como Compras.

## 4. Pantallas

### 4.1 Permisos

| Tab (slug) | id | Acciones |
| --- | --- | --- |
| `cobranzas` | `d0000000-0000-0000-0000-000000000005` | `view`; `create` (crear borrador); `update` (editar y confirmar, enviar, adjuntar certificado); `delete` (borrar borrador y anular) |
| `retenciones-sufridas` | `d0000000-0000-0000-0000-000000000006` | `view`; `update` (adjuntar o reemplazar el certificado) |

- Migración con las tabs y los permisos de `admin`, `administrador` y `full-access-provisional`. Los roles custom se asignan a mano.
- Las dos tabs van en `permissions-map.ts`. Un test valida las claves `tesoreria:<tab>:<acción>` escritas en las pantallas contra el mapa, como el de Compras.
- La cuenta corriente se ve con `cobranzas:view`.

### 4.2 Tab Cobranzas

Toggle entre dos vistas, recordado en la URL.

**A cobrar** (DataTable, hecha por `table-expert`):
- facturas y notas de débito autorizadas con pendiente mayor a 0;
- columnas: cliente, comprobante (`FA-A 0001-00000123`), fecha, vencimiento, moneda, total, pendiente, días de atraso y estado (**Vencido**, **Por vencer**, **En borrador**);
- arriba, totales por moneda: vencido y a vencer en 30 días;
- acción **Cobrar**: abre un recibo nuevo con el cliente y ese comprobante cargados.

**Recibos** (DataTable, hecha por `table-expert`):
- columnas: número (o "Borrador"), fecha, cliente, estado, comprobantes, retenciones, total recibido, enviado;
- botón **Nuevo recibo** (`cobranzas:create`);
- cada fila abre el recibo: el editor si es borrador, el detalle si no.

Un selector de cliente lleva a su cuenta corriente.

### 4.3 Editor del recibo

Páginas `/dashboard/treasury/receipts/new` y `/dashboard/treasury/receipts/[id]` (borrador). Un solo formulario (RHF + Zod), sin modales encadenados, en secciones separadas por `<Separator />`:

1. **Cabecera**: cliente (con CUIT), fecha (date picker con escritura directa) y observaciones. Debajo, una cotización por cada moneda extranjera presente.
2. **Comprobantes pendientes del cliente**: lista con check e importe a aplicar. Propone el pendiente completo y admite parcial. En moneda extranjera el importe se carga en la moneda del comprobante o en pesos, y se muestran los dos y la diferencia de cambio.
3. **Anticipos disponibles** del cliente, con check e importe a aplicar.
4. **Cobro a cuenta**: importe y descripción.
5. **Retenciones**: impuesto, jurisdicción (si IIBB), número, fecha, importe y PDF del certificado.
6. **Medios**:
   - medio, cuenta (con su saldo, como el pago de Compras), importe y referencia;
   - en cheques y e-cheqs, además: número, banco y vencimiento.
7. **Resumen** fijo (`sticky`): comprobantes + a cuenta contra anticipos + retenciones + medios, con **"Faltan $X"**, **"Sobran $X"** o **"Cierra"**.

Botones **Guardar borrador** y **Confirmar** (deshabilitado si no cierra; pide confirmación con un `AlertDialog` que resume el recibo). Todo botón que no guarda lleva `type="button"`.

### 4.4 Detalle del recibo

`/dashboard/treasury/receipts/[id]` para confirmados y anulados:
- datos del recibo, líneas, retenciones, medios y diferencia de cambio total;
- sus movimientos, con link al extracto de la cuenta y el badge "A acreditar";
- si está anulado: quién, cuándo y motivo;
- acciones: **Descargar PDF**, **Enviar al cliente**, **Anular** (`CancelReasonDialog` de la etapa 1), **Adjuntar certificado** por retención.

### 4.5 Tab Retenciones sufridas

DataTable (hecha por `table-expert`):
- columnas: fecha del certificado, impuesto, jurisdicción, número, cliente, CUIT, recibo, importe y certificado ("Ver" o badge **Sin certificado**);
- solo retenciones de recibos confirmados;
- el mes se elige con el filtro de rango de fechas (por defecto, el mes en curso); totales por impuesto del rango filtrado;
- **Export Excel** con una columna de link al certificado. El link es la URL estable del proxy de archivos (`storagePublicUrl` → `/api/files/customer-documents/<key>`, absoluta con el origen de la app): no vence y valida sesión y empresa en cada pedido. El bucket se suma a `STORAGE_BUCKETS` y a `COMPANY_PREFIXED_BUCKETS` (`src/shared/lib/storage-buckets.ts`) y a la lista de buckets del `docker-compose.yml`.

### 4.6 Cuenta corriente del cliente

`/dashboard/treasury/customers/[id]`:
- encabezado con el saldo por moneda, anticipos disponibles y saldo a favor;
- detalle cronológico por moneda con saldo anterior y acumulado, filtrado por rango de fechas;
- cada fila linkea a su comprobante o recibo;
- export Excel.

Links de entrada, visibles solo con `tesoreria:cobranzas:view`:
- **Cuenta corriente** en la ficha del cliente (Comercial);
- en el detalle de la factura (Comercial): _"Pendiente: $X"_ y el link a la cuenta corriente.

### 4.7 Cambios en lo existente

- Extracto de cuenta y tabla de Movimientos: el origen de un `CUSTOMER_RECEIPT` se muestra como _"RE-000001 — Cliente"_ con link al recibo. No se edita ni se anula desde ahí: _"Este movimiento es del recibo RE-000001. Para revertirlo, anulá el recibo"_.
- `invalidateTreasury` invalida también las queries de cobranzas; las mutaciones revalidan `/dashboard/treasury`.
- Comercial no cambia salvo los dos links.

## 5. Errores y casos borde

| Caso | Comportamiento |
| --- | --- |
| Dos borradores cargan el mismo comprobante | El segundo en guardar se rechaza: _"FA-A 0001-00000123: el pendiente es $ 50.000,00 y está reservado en otro borrador"_. |
| Una NC se autoriza mientras el recibo está en borrador | Al confirmar se recalcula y, si ya no alcanza, se rechaza con el pendiente nuevo. |
| Cheque con vencimiento anterior a la fecha del cobro | Se acepta; el movimiento toma la fecha del cobro. |
| Cliente inactivo | No se crean recibos nuevos; los existentes se confirman y anulan igual. |
| Cuenta desactivada después de cargar el borrador | La confirmación se rechaza: _"La cuenta Galicia está inactiva"_. |
| Comprobante en USD sin cotización | El borrador no guarda: _"Indicá la cotización del USD"_. |
| Recibo solo con anticipo aplicado (sin plata) | Válido: no crea movimientos. |
| Recibo solo a cuenta | Válido: no aplica comprobantes. |
| Confirmar dos veces (doble click o dos pestañas) | La segunda falla: _"El recibo ya fue confirmado"_. |

## 6. Tests

- **pgTAP** (`prisma/tests/05_treasury_collections.sql`):
  - el origen de `CUSTOMER_RECEIPT` (solo su medio, importe mayor a 0) y que los otros tipos rechacen `customer_receipt_payment_id`;
  - `RE-` único por empresa; movimiento único por medio;
  - los CHECK de las líneas por `kind`, de los cheques, de la jurisdicción de IIBB, de la anulación completa;
  - un recibo confirmado exige número; uno anulado, motivo.
- **Unitarios** (vitest):
  - cierre del recibo (cierra, faltan, sobran);
  - `amount_ars` y su redondeo; conversión desde pesos al importe en moneda del comprobante;
  - diferencia de cambio (ganancia, pérdida, pesos);
  - pendiente con notas de crédito, recibos anulados y exclusión del propio borrador;
  - disponible de un anticipo;
  - cuenta corriente: saldo anterior, acumulado por moneda, anticipos;
  - fecha del movimiento de un cheque (futuro, vencido);
  - claves de permisos de las tabs.
- **Integración** (`test:treasury`, contra el Postgres del compose):
  - confirmar crea los movimientos con la fecha correcta;
  - dos borradores no reservan más que el pendiente;
  - dos confirmaciones concurrentes no cobran de más ni duplican número;
  - anular libera comprobantes y anticipos y anula los movimientos;
  - anular se bloquea si el anticipo se aplicó;
  - aplicar un anticipo no mueve saldos;
  - un recibo confirmado no se edita;
  - fecha futura y recibo que no cierra se rechazan;
  - comprobantes de otro cliente o de otra empresa se rechazan;
  - una NC posterior al cobro deja saldo a favor;
  - certificado repetido se rechaza.
- **Navegador**, como admin P4: cada tab nueva con sus botones de alta; un recibo completo desde "A cobrar"; PDF, envío y anulación; export de retenciones y apertura de un link de certificado; cuenta corriente desde Comercial.

## 7. Demo

`scripts/demo/domains/customer-receipts.ts`, después de Comercial y de Tesorería. La demo hoy no tiene facturas de clientes, así que el dominio crea **comprobantes autorizados simulados** (`simulated = true`, CAE ficticio) para 3 o 4 clientes: facturas en pesos (algunas vencidas), una nota de débito, una nota de crédito asociada a una factura y una factura en USD. Recibos:

- **RE-000001**: cobro total por transferencia.
- **RE-000002**: cobro parcial con retenciones de Ganancias e IIBB (Neuquén); una con PDF de certificado de ejemplo, la otra sin certificado.
- **RE-000003**: factura en USD cobrada en pesos a una cotización distinta de la de la factura, con un e-cheq a 30 días ("A acreditar").
- **RE-000004**: cobro con excedente a cuenta. **RE-000005** aplica ese anticipo a otra factura.
- **RE-000006**: anulado con motivo.
- Un **borrador** que reserva una factura.

`verify`: cada medio tiene su movimiento; los saldos de las cuentas dan lo esperado; el pendiente de cada comprobante coincide con el calculado a mano; ningún anticipo queda con disponible negativo. El borrado de la demo es genérico (vacía toda tabla de negocio): `reset.ts` solo suma el bucket `customer-documents` a `ensureBuckets` y a la poda de objetos.

## 8. Manual

Sección `tesoreria.ts`, guías nuevas:
- Cobrar facturas: el recibo;
- Cobros en moneda extranjera;
- Anticipos de clientes;
- Retenciones sufridas y certificados;
- Cuenta corriente del cliente;
- Anular un recibo.

Se actualiza la guía de facturas de Comercial (pendiente y link a la cuenta corriente). Verificación con `npm run manual:check`.

## 9. Fuera de alcance de la etapa 2

- Cartera de cheques de terceros, depósito, endoso y rechazo (etapa 3).
- Aplicar o devolver el saldo a favor que deja una nota de crédito posterior al cobro.
- Asiento contable de la diferencia de cambio.
- Anular comprobantes autorizados de Comercial.
- Cuentas en moneda extranjera.
- Datos de agente de retención de la empresa (`company_fiscal_profiles`) y validación de alícuotas de lo retenido.

## 10. Rama y entrega

Rama `feat/tesoreria`, sobre la etapa 1. Un commit: `feat(tesoreria): etapa 2 - cobranzas, retenciones sufridas y cuenta corriente`. Antes del commit: `check-types`, unitarios, `test:db`, `test:treasury`, `test:purchases` y `manual:check`. Push y PR a `main` recién al cerrar el módulo, con `npx next build` antes.
