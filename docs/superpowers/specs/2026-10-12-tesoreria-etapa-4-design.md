# Tesorería — Etapa 4: conciliación bancaria

**Fecha:** 2026-10-12
**Estado:** decidida en sesión. El usuario pidió seguir hasta cerrar el módulo sin pararse a aprobar cada parte. Las decisiones salen de la spec de la etapa 1 (§1, fila 4) y de lo construido en las etapas 1 a 3b.
**Contexto:**
- **Etapa 1:** el libro único `treasury_movements` y los saldos calculados.
- **Etapas 2 y 3a:** cobranzas y cheques de terceros.
- **Etapa 3b:** cheques propios, con débito confirmado por un usuario (spec `2026-10-11-tesoreria-etapa-3b-design.md`). Allí quedó para esta etapa confirmar el débito desde el extracto.

Rigen las convenciones de las etapas anteriores:
- multiempresa;
- `ActionResult` y schemas Zod en `schemas/`;
- permisos por tab, solo para los 3 roles de sistema;
- lo que tiene historia no se borra;
- el libro se escribe solo por `lib/movements.ts`;
- hora argentina.

## 1. Objetivo

Comparar el extracto del banco con el libro de cada cuenta bancaria:
- qué movimientos del banco ya están registrados;
- cuáles faltan, como gastos, intereses o impuestos, que se dan de alta desde el extracto;
- qué movimientos del libro todavía no aparecen en el banco.

### Decisiones

| Tema | Decisión |
| --- | --- |
| Origen del extracto | Un archivo **Excel (.xlsx) o CSV** que baja el usuario del home banking. Se lee **en el navegador** con `exceljs` (xlsx) o un parser CSV propio. No se usa `xlsx` (SheetJS 0.18) con archivos subidos, por sus vulnerabilidades conocidas. Al servidor van las filas ya leídas, como texto, y él las valida. El archivo no se guarda. |
| Perfil de columnas | **Uno por cuenta bancaria**, y se recuerda. Guarda: fila del encabezado, columna de fecha, formato de fecha, descripción, referencia (opcional), importe (una columna con signo, o débito y crédito separados) y separador decimal. Se arma la primera vez con una vista previa del archivo. |
| Líneas | Cada línea del extracto se guarda con fecha, descripción, referencia, importe con signo y estado: **Pendiente**, **Conciliada** (unida a un movimiento), **Registrada** (se creó su movimiento desde el extracto) o **Ignorada** (con motivo). |
| Relación línea ↔ movimiento | **1 a 1.** Un movimiento se concilia con una sola línea y una línea con un solo movimiento. |
| Conciliación automática | Mismo importe exacto, fecha a ±3 días y ambos sin conciliar. Si hay un solo candidato, se concilia. Si hay más de uno, queda para la manual (con sugerencias). |
| Cheques propios | Una línea de débito con el importe de un cheque propio EMITIDO de la cuenta se sugiere como "Débito del cheque Nº …". Aceptarla confirma el débito con la fecha de la línea (la regla de la etapa 3b) y concilia el movimiento creado. |
| Alta desde el extracto | Una línea pendiente se puede **registrar**: se crea un movimiento manual con un concepto (y la descripción de la línea), en la fecha de la línea, ya conciliado. |
| Movimientos conciliados | Quedan **trabados**: no se editan ni se anulan hasta desconciliarlos. La regla vive en `cancelMovements` y en la edición de movimientos manuales, así cubre todas las anulaciones (recibos, órdenes de pago, transferencias, operaciones de cheques, débitos). |
| Repetidos | Una línea ya importada en la misma cuenta no se vuelve a importar. La clave es fecha, importe, descripción, referencia y el número de aparición dentro del archivo, porque dos comisiones iguales el mismo día son dos líneas. Se informa cuántas se saltearon. |
| Deshacer | **Desconciliar** una línea la deja pendiente. Si estaba registrada, el movimiento creado se anula con motivo. Se puede **borrar una importación** solo si ninguna de sus líneas está conciliada ni registrada. |

## 2. Modelo de datos

### 2.1 Perfil: `bank_statement_profiles`

Un perfil por cuenta (`account_id` único). Columnas:
- `id`, `company_id`, `account_id`;
- `header_row`: número de fila, desde 1;
- `date_column`, `description_column`, `reference_column` (nullable) y `amount_column` (nullable);
- `debit_column` y `credit_column` (nullables);
- `date_format`: `DD/MM/YYYY`, `YYYY-MM-DD`, `DD-MM-YYYY` o `MM/DD/YYYY`;
- `decimal_separator`: `,` o `.`;
- `updated_by` y `updated_at`.

Las columnas se guardan por su letra (`A`, `B`…). El CHECK exige o bien `amount_column`, o bien `debit_column` y `credit_column`.

### 2.2 Importación: `bank_statements`

Columnas:
- `id`, `company_id`, `account_id`;
- `file_name`;
- `date_from` y `date_to`: la menor y la mayor fecha de sus líneas;
- `line_count` y `skipped_count`;
- `created_by` y `created_at`.

### 2.3 Línea: `bank_statement_lines`

| Columna | Detalle |
| --- | --- |
| `id`, `statement_id`, `company_id`, `account_id` | |
| `date` | `@db.Date`. |
| `description`, `reference` | Texto. |
| `amount` | Con signo y distinto de 0: positivo es crédito y negativo es débito. |
| `line_key` | Texto, único por cuenta (`account_id, line_key`). |
| `status` | Enum `bank_line_status`: `PENDING`, `MATCHED`, `CREATED` o `IGNORED`. |
| `movement_id` | Movimiento conciliado (único, nullable). Obligatorio en `MATCHED` y `CREATED`. |
| `ignore_reason` | Obligatorio en `IGNORED`. |
| `reconciled_by`, `reconciled_at` | |

### 2.4 Libro

`treasury_movements` no cambia de estructura. Un movimiento está conciliado si alguna línea lo apunta (`bank_statement_lines.movement_id`, índice único).

## 3. Reglas del servidor

Todo vive en `actions/reconciliation.server.ts` y `lib/reconciliation.ts`, que bloquea líneas y movimientos con `FOR UPDATE`. La lógica pura está en `lib/statement-parse.ts`: parseo de fechas e importes y armado de líneas según el perfil, con sus tests.

### 3.1 Importar

1. El navegador lee el archivo y muestra las primeras filas.
2. El usuario elige o corrige el perfil.
3. La vista previa muestra las líneas tal como van a quedar.
4. Al confirmar, el servidor:
   - guarda el perfil;
   - vuelve a parsear y validar cada fila;
   - descarta las filas vacías y las de importe 0;
   - rechaza la importación entera si una fila tiene una fecha o un importe inválidos, e indica la fila;
   - saltea las repetidas;
   - crea la importación y sus líneas;
   - corre la conciliación automática.
5. Límite: 5000 filas por archivo.

### 3.2 Conciliación automática

Para cada línea pendiente de la cuenta, en orden de fecha, busca los movimientos vigentes de esa cuenta que:
- no están conciliados;
- tienen el mismo importe;
- tienen la fecha a ±3 días de la línea.

Si encuentra exactamente uno, y ese movimiento no es candidato único de otra línea, los concilia. Se puede volver a correr desde la pantalla ("Conciliar automáticamente").

### 3.3 Conciliar a mano

Una línea pendiente y un movimiento sin conciliar de la misma cuenta, con el mismo importe. La diferencia de fecha no importa.

### 3.4 Débito de un cheque propio

- Se ofrece en una línea pendiente de débito si hay cheques propios EMITIDOS de la cuenta con ese importe.
- Usa la regla de `debitOwnChecks`: la fecha de la línea no puede ser anterior a la fecha de pago del cheque.
- Crea el movimiento `OWN_CHECK` y concilia, en la misma transacción.

### 3.5 Registrar

- Una línea pendiente, un concepto activo cuya dirección admite el sentido de la línea y una descripción (por defecto, la de la línea).
- Crea un movimiento `MANUAL` en la fecha de la línea y lo concilia: la línea pasa a REGISTRADA.

### 3.6 Ignorar

Una línea pendiente, con motivo, pasa a IGNORADA. Se puede volver a pendiente.

### 3.7 Desconciliar

- **Conciliada:** vuelve a pendiente.
- **Registrada:** se anula su movimiento, con el motivo "Desconciliado del extracto: …", y la línea vuelve a pendiente.

Permiso `delete`.

### 3.8 Movimientos trabados

- `cancelMovements` rechaza anular un movimiento conciliado: "El movimiento del DD/MM por $ … está conciliado con el extracto: desconcilialo primero". Lo hace antes de anular nada, así que la anulación del documento entero no aplica nada.
- `updateManualMovement` y `updateOpeningBalance` rechazan igual.

### 3.9 Resumen

Para la cuenta y el período de la importación:
- saldo del libro al último día;
- líneas pendientes (débitos y créditos);
- movimientos sin conciliar del período.

Con eso el usuario explica la diferencia con el banco. No se pide el saldo del banco: muchos extractos no lo traen.

## 4. Pantallas y permisos

### 4.1 Permisos

Tab `conciliacion` (`d0000000-0000-0000-0000-000000000009`), "Conciliación", después de Cheques propios. Retenciones sufridas pasa al orden 8. Por migración a los 3 roles de sistema y en `permissions-map.ts`:
- **view:** ver;
- **create:** importar;
- **update:** conciliar, registrar e ignorar;
- **delete:** desconciliar y borrar importaciones.

### 4.2 Tab Conciliación

- **Selector de cuenta bancaria.** Arranca en la primera.
- **Importaciones de la cuenta:**
  - una tabla simple con fecha, archivo, período, líneas, pendientes y usuario;
  - "Borrar", si corresponde;
  - el botón **"Importar extracto"**: un solo diálogo con archivo, perfil y vista previa, en secciones.
- **Panel de conciliación**, en dos columnas:
  - **Extracto:** las líneas pendientes, con las sugerencias de cada una y sus acciones: conciliar con…, débito del cheque…, registrar e ignorar. Un filtro para ver también las conciliadas, registradas e ignoradas, con "Desconciliar" o "Volver a pendiente".
  - **Libro:** los movimientos sin conciliar de la cuenta en el rango de la importación ±5 días. Elegir una línea y un movimiento habilita "Conciliar".
- Botón **"Conciliar automáticamente"**.

### 4.3 Cambios en lo existente

- **Extracto de la cuenta y tabla de Movimientos:** un ícono de "Conciliado" en los movimientos conciliados.


## 5. Errores y casos borde

- Archivo sin filas, columna inexistente o formato de fecha que no corresponde → error con el número de fila.
- Importe con separadores mezclados (`1.234,56` o `1,234.56`) → se interpreta según el separador decimal del perfil.
- Movimiento ya conciliado por otro usuario → error claro.
- Cuenta que no es bancaria o es de otra empresa → inexistente.
- Movimiento anulado → no se ofrece ni se acepta.

## 6. Tests

**Unitarios:**
- `statement-parse`:
  - fechas en los 4 formatos e inválidas;
  - importes con coma y con punto, negativos con signo o entre paréntesis;
  - columna única o débito/crédito;
  - filas vacías;
  - clave con apariciones repetidas;
- schemas.

**Integración** (`reconciliation.integration.test.ts`):
- importar y saltear las repetidas al reimportar;
- conciliación automática única y ambigua;
- conciliar a mano;
- registrar con concepto (movimiento creado y conciliado);
- ignorar;
- débito de un cheque propio desde la línea;
- desconciliar una conciliada y una registrada;
- un movimiento conciliado no se anula (recibo u orden) ni se edita;
- borrar una importación sin conciliadas;
- conciliación simultánea del mismo movimiento: gana una sola.

**pgTAP** (`09_treasury_reconciliation.sql`):
- CHECK de estado de la línea;
- índice único de `line_key` y de `movement_id`;
- CHECK del perfil.

**Navegador:** importar un CSV de prueba, conciliar, registrar una comisión y desconciliar.

## 7. Demo

Dominio `scripts/demo/domains/bank-reconciliation.ts`:
- perfil del Galicia;
- un extracto de los últimos 20 días, con:
  - líneas que concilian con movimientos existentes (automática);
  - el débito de un cheque propio ya debitado;
  - una comisión bancaria registrada con su concepto;
  - una pendiente: un impuesto a los débitos y créditos sin registrar;
  - una ignorada.

## 8. Manual

**Guías nuevas:**
- `conciliacion-bancaria`: importar, conciliar, registrar, ignorar y desconciliar;
- `perfil-de-extracto`: cómo armar el perfil de columnas.

**Guías que se actualizan:**
- `tesoreria`, que hoy menciona la conciliación como pendiente;
- `cheques-propios`, por el débito desde el extracto;
- `movimientos-de-tesoreria`, por los conciliados, que no se anulan.

## 9. Fuera de alcance

- Conectarse al banco (API u homebanking).
- Conciliar una línea contra varios movimientos.
- Diferencias de importe con tolerancia.
- Leer extractos en PDF.
- Guardar el archivo original.

## 10. Entrega

Un commit `feat(tesoreria): etapa 4 - conciliacion bancaria`. Después:
- `npx next build`, con el dev server parado y `tsconfig.tsbuildinfo` borrado;
- push de `feat/tesoreria` y PR a `main` del módulo completo.
