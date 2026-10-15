# Gestor de remitos

Remitos y documentos de cada línea del parte diario (`dailyreportrows`). Una línea puede tener varios
remitos y cada remito varios documentos (PDF o imagen).

## Una sola fuente

El remito de una línea vive **solo** en la tabla `remitos` (+ `remito_documents` para los archivos).
La columna vieja `dailyreportrows.remit_number` se eliminó en la migración
`20261019100000_unify_remitos_source` (que copió sus valores a `remitos`).

- Toda lectura, filtro o búsqueda de remitos usa `lib/remit-numbers.ts`:
  - `REMIT_NUMBERS_SELECT`: el `select` de los números de la línea, en orden de carga.
  - `remitNumbersOf(row)`: los números como `string[]`.
  - `remitNumberContainsWhere(term)`: "algún remito de la línea contiene `term`".
- Toda escritura pasa por `actions/remitos.server.ts`. Ningún formulario escribe el remito por su cuenta
  (el formulario de Comercial llama a `createRemito`).

Consumidores de lectura: detalle del parte en Operaciones (`detail/lib/row-query.ts`,
`detail/form-data.server.ts`) y Comercial / Certificación (`Certificacion/actions/queries.server.ts`).
`Dashboard/Principal/actions/services.server.ts` también busca y filtra por remito, pero ninguna pantalla
del Dashboard lo muestra hoy.

## Dónde se usa el gestor

`RemitosManagerModal` se abre desde dos pantallas, con el mismo componente:

| Pantalla | Acción | Cuándo aparece |
|---|---|---|
| Operaciones → detalle del parte | **Remitos** (`detail/columns/row-actions-cell.tsx`) | Línea **Ejecutada** o **En certificación**, con `operaciones:detalle-parte-diario:update` |
| Comercial → Partes Diarios | **Gestionar Remitos** (`Certificacion/components/EnhancedComercialReportTable.tsx`) | Línea **En certificación**, con `comercial:daily_reports:update` |

La regla de estado vive en la UI de cada pantalla. El servidor exige el permiso **Editar** de cualquiera
de las dos (`assertCanWriteRemitos`), y no exige estado: Comercial también crea el primer remito al dar
de alta una línea ("Crear Línea"), cuando todavía puede estar "Sin recursos". Por eso `createRemito`
acepta además **Crear** en `comercial:daily_reports`.

```tsx
<RemitosManagerModal dailyReportRowId={row.id} customerName={row.customers?.name} isOpen onClose={close} />
```

Props: `dailyReportRowId` (la línea, no el parte), `customerName` (opcional, solo se muestra en el
encabezado), `isOpen`, `onClose`.

## Server actions (`actions/remitos.server.ts`)

| Acción | Qué hace |
|---|---|
| `createRemito(rowId, number)` | Alta de remito. El número no se repite dentro de la línea. |
| `uploadDocumentToRemito(remitId, formData)` | Valida tipo y tamaño en el servidor, sube el archivo al bucket `daily-reports` (carpeta del cliente de la línea, resuelta en el servidor) y crea el documento. Si falla la BD, borra el archivo subido. |
| `linkExistingRemito(sourceRemitId, targetRowId)` | Copia el remito a otra línea **del mismo cliente** (`is_linked = true`) con referencias a los MISMOS archivos. `getAvailableRemitosForLinking` ya trae solo candidatos de ese cliente. |
| `updateRemitoNumber`, `replaceDocument`, `linkExistingDocument` | **Sin pantalla todavía** (sus hooks existen pero ningún componente los usa). Cambiar el número, reemplazar el archivo y agregar un archivo ya subido de la empresa, con las mismas validaciones. |
| `deleteRemitDocument(documentId)` / `deleteRemito(remitId)` | Bajas. Los archivos se borran del storage solo si quedaron huérfanos (`removeUnreferencedFiles`): un remito vinculado comparte archivos con el original. |
| `unlinkRemito(remitId)` | Quita una copia vinculada; nunca toca los archivos. |

Todas validan el perímetro de empresa (`dailyreport.company_id`) y lanzan `Error` con mensaje en español.
Las escrituras corren en `withSessionActor`, así el historial guarda quién hizo cada cambio.

## Historial

Los triggers `tr_remitos_history` y `tr_remito_documents_history` (`prisma/sql/daily-report.sql`) escriben
en `dailyreportrows_history` con `related_table` `remitos` / `remito_documents`:

- `LINK` / `UNLINK`: alta y baja de un remito (`changed_data.remito_numero`, `vinculado`) o de un documento
  (`documento_nombre`).
- `UPDATE`: cambio de número (`changed_fields.remit_number` con `old` / `new`). Hoy solo se alcanza por
  `updateRemitoNumber`, que no tiene pantalla.

Los documentos que caen por cascada al borrar el remito no generan bajas propias. Lo cubre
`prisma/tests/10_remitos.sql`.

## Refresco de pantallas

Cada mutación llama a `invalidateRemitConsumers` (`hooks/useRemitos.ts`), que invalida el gestor y todo lo
que muestra remitos: el detalle del parte de Operaciones, el detalle y el historial de la línea, la tabla
de Comercial y la lista de remitos para vincular.

## Archivos

- Tipos y tamaños permitidos (PDF, JPG, PNG, WebP, hasta 10 MB): `types/index.ts`. Se validan en el
  cliente (`useFileValidation`) y otra vez en el servidor (`requireValidFile`); la extensión sale del tipo.
- Ver y descargar: `getRemitDocumentUrl` / `getRemitDocumentDownloadUrl`. La ruta `/api/files/...`
  revalida la empresa con `storage-perimeter.ts` a partir de `remito_documents`.

## Manual de uso

- `src/content/manual/operaciones/detalle-del-parte.mdx` → "Remitos de una línea" (paso a paso).
- `src/content/manual/comercial/partes-diarios-comercial.mdx` → "Gestionar remitos".
- `src/content/manual/procesos/del-pedido-a-la-factura.mdx`.
