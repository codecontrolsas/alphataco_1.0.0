# Inventario ANTES — Formularios

Ficha funcional del módulo Formularios / Checklists antes del rediseño. Cada `- [ ]` se tilda "después" al
verificar que la pantalla rediseñada conserva el elemento. Rutas bajo `src/app/dashboard/forms/**`.

Dos "mundos" conviven en todas las rutas: **checklists normalizados** (`checklist_templates` /
`checklist_answers`, el sistema vigente) y **formularios custom viejos** (`custom_form` / `form_answers`). Cada
página intenta primero el normalizado y cae al viejo.

---

## Lista de formularios — `/dashboard/forms?tab=formularios`

- [ ] Componente raíz: `src/features/Formularios/FormulariosComponent.tsx` (page: `src/app/dashboard/forms/page.tsx`).
- [ ] `generateMetadata`: título `Formularios | <empresa>` (cookie `actualCompName` o `getCompanyName()`).
- [ ] `SectionManagerServer` con `paramName="tab"`, una sola tab `formularios` (icono `FileText`), permiso
      `formularios:formularios` (la tab se oculta sin permiso). Loading: `TabsPageSkeleton tabCount=2`;
      Suspense con `FormsTableSkeleton`.
- [ ] **No hay botón "Crear formulario"** en esta pantalla (la creación de checklists no existe en la UI; ver
      `/dashboard/forms/new` más abajo, ruta sin enlaces).

### Tabla `forms` (Formularios)

- [ ] Archivos: `Formularios/Formularios/FormsList.tsx` (server) → `components/_FormsDataTable.tsx` (client) →
      `columns.tsx`; datos `actions.server.ts` (`getFormsPaginated`, `getAllFormsForExport`, `getFormsFacets`).
- [ ] Sistema: **DataTable nuevo**, envuelto en `<Card><CardContent pt-6>`. `tableId`/`paramNamespace` = `forms`.
      Preferencias de columnas/filtros persistidas en BD. **Sin `queryFn`** (modo SSR, no client-side) y facets en
      **bulk** (`getFormsFacets` + `options`/`externalCounts`, patrón viejo).
- [ ] Datos: une `checklist_templates` + `custom_form` de la empresa activa; paginación y orden **en memoria**.
- [ ] Columnas (meta.title): Nombre · Descripción · Código (oculta por defecto) · Tipo (oculta por defecto,
      sin orden) · Estado · Fecha de creación (header "Creación") · Respuestas (sin orden) · acciones.
- [ ] Celda Nombre: badge con cantidad de respuestas + tooltip "Cantidad de respuestas: N"; link a
      `/dashboard/forms/<id>` solo si `view` y activo; inactivo → texto opaco (`opacity-50`) con title "(Inactivo)".
- [ ] Celda Tipo: icono `ClipboardCheck` (checklist) / `FileText` (custom) + label de `formSourceLabels`.
- [ ] Celda Estado: badge success "Activo" / secondary "Inactivo". Los `custom_form` siempre son activos.
- [ ] Filtros: Estado (faceted Activo/Inactivo/"Sin asignar" si hay null) · Tipo (faceted checklist/custom) ·
      Nombre (text) · Descripción (text) · Código (text) · Fecha de creación (dateRange).
      Visibles por defecto: Estado, Tipo, Fecha de creación. Toggle de filtros activo.
- [ ] Búsqueda: "Buscar formularios por nombre o descripción...".
- [ ] Orden por defecto: activos primero, luego `created_at` desc. El orden del usuario se aplica después del
      criterio "activos primero" (siempre gana el estado).
- [ ] Exportación Excel: archivo `formularios`, título "Listado de Formularios", hoja "Formularios"; formatters
      Estado (Activo/Inactivo), Tipo (label), fecha DD/MM/YYYY, respuestas, código, descripción. Usa
      `searchParams` (no `currentParams`).
- [ ] Selección / acciones masivas: ninguna.
- [ ] Acción por fila: botón-link "Ver formulario" → `/dashboard/forms/<id>`, solo si
      `formularios:formularios:view` y el formulario está activo.
- [ ] Vacío: "No hay formularios registrados".

---

## Detalle de formulario (respuestas) — `/dashboard/forms/[id]` (+ query params de la tabla `checklist-answers`)

- [ ] Page: `src/app/dashboard/forms/[id]/page.tsx`. Loading: `TablePageSkeleton columnCount=5`.
- [ ] Rama A — **checklist normalizado** (`fetchChecklistTemplateById`):
  - [ ] Envuelto en `<Card className="px-6">`. Header: `BackButton` · "Imprimir PDF vacío" (`ChecklistPDFButton`) ·
        link "Nueva respuesta" → `/dashboard/forms/<id>/new`. Sin control de permisos en estos botones.
  - [ ] Título = nombre del template + descripción (muted).
  - [ ] **PDF**: "Imprimir PDF vacío" abre `ChecklistPDFPreviewDialog` (Dialog `max-w-5xl h-[90vh]`, título =
        nombre del template, `PDFViewer` con `NormalizedChecklistPDFLayout` cargado por `import()` dinámico,
        botones "Cerrar" y "Descargar PDF"/"Generando..."; descarga `Checklist_<nombre>_<fecha>.pdf`).
- [ ] Rama B — **formulario custom viejo**: header `BackButton` · `PDFPreviewDialog` "Imprimir vacío" (renderiza
      uno de 3 generadores hardcodeados por nombre: `Transporte SP-ANAY - CHK - HYS - 01/03/04`; si no coincide,
      "No hay formulario seleccionado") · "Nueva respuesta". Título + descripción. Tabla vieja (ver abajo).
- [ ] Rama C — no existe: `BackButton` + "No se encontró el formulario con ID: …" en rojo.

### Tabla `checklist-answers` (Respuestas de checklist) — rama A

- [ ] Archivos: `Checklists/ChecklistAnswers/ChecklistAnswersList.tsx` → `components/_ChecklistAnswersDataTable.tsx`
      → `columns.tsx`; datos `actions.server.ts` (`getChecklistAnswersPaginated`, `getAllChecklistAnswersForExport`,
      `getChecklistAnswersFacets`). Skeleton `fallback/ChecklistAnswersTableSkeleton.tsx`.
- [ ] Sistema: **DataTable nuevo**, `tableId`/`paramNamespace` = `checklist-answers`. Sin `queryFn` (SSR), facets
      **bulk** (`useQuery` único). Filtro siempre por `template_id` + `company_id`.
- [ ] Columnas: Fecha · Equipo (sin orden) · Chofer (sin orden; nombre del JSONB, "N/A") · Cliente (oculta, sin
      orden; `customer_name` del JSONB o el id) · Kilometraje · Horómetro · Resultado · Usuario (sin orden) ·
      Observaciones (oculta, sin orden) · acciones.
- [ ] Celda Resultado: badge con icono, normalizado desde valores inconsistentes (B/passed, M/failed, null →
      pendiente).
- [ ] Filtros: Fecha (dateRange) · Resultado (faceted Aprobado/Falló/Pendiente=NULL) · Equipo (faceted, "Sin
      equipo") · Usuario (faceted, "Sin usuario") · Chofer (faceted por `chofer_employee_id`, labels con legajo,
      "Sin chofer") · Cliente (faceted, "Sin cliente") · Observaciones (text). Visibles por defecto: Fecha,
      Resultado, Equipo.
- [ ] Búsqueda: "Buscar respuestas..." (ver hallazgo: `buildSearchWhere(search, [])`).
- [ ] Orden por defecto: `created_at` desc.
- [ ] Exportación: archivo `respuestas-checklist`, título "Respuestas de Checklist", hoja "Respuestas"; formatters
      fecha, resultado (label), observaciones, km, horómetro, cliente (id).
- [ ] Selección / masivas: ninguna.
- [ ] Acción por fila: botón "Ver" (icono `Eye`) → `/dashboard/forms/<templateId>/view/<answerId>`. Sin permiso.
- [ ] Vacío: "No hay respuestas registradas para este checklist".

### Tabla de respuestas de formulario viejo — rama B

- [ ] Archivos: `Formularios/components/forms/CheckListAnwersTable.tsx` → `components/tables/data-table-answer.tsx`
      (`CheckListAnswerTable`) + `checkListAnswerColumns.tsx` + `data-table-toolbar-answer.tsx` +
      `data-table-answers-filters.tsx` + `data-table-view-options.tsx` + `data-table-pagination.tsx`.
- [ ] Sistema: **manual** (TanStack Table client-side, no `BaseDataTable` ni DataTable nuevo).
- [ ] Columnas: Dominio · (id, header vacío) · Chofer · Kilometraje · Horómetro ("-" si vacío) · Creación (Fecha).
- [ ] Filtros: faceted "Choferes" y "Dominios" (valores únicos de la página) + "Limpiar filtros" + selector de
      columnas visibles (`DataTableViewOptions`). Sin búsqueda, sin exportación, sin selección.
- [ ] Click en fila → `/dashboard/forms/<answerId>/view`. Paginación client-side.

---

## Nueva respuesta — `/dashboard/forms/[id]/new`

- [ ] Page: `src/app/dashboard/forms/[id]/new/page.tsx`. Loading: `FormPageSkeleton fieldCount=8`.
- [ ] Rama normalizada: `BackButton` + título/descr. del template + `NormalizedChecklistForm`
      (`Checklists/components/NormalizedChecklistForm.tsx`) con equipos filtrados por el template
      (`fetchFilteredEquipmentForChecklist`), clientes activos y empleados activos; `shouldDisabledInputs=false`.
- [ ] Rama vieja: aviso "Formulario de estructura antigua detectado. La nueva implementación de checklists está en
      desarrollo." + nombre (no permite responder).
- [ ] No existe: "No se encontró el formulario con ID: …".

### Formulario `NormalizedChecklistForm` (compartido con `/maintenance/equipment/[id]/checklists/[checklistId]`)

- [ ] Esquema Zod dinámico: `Checklists/lib/checklist-form-schema.ts`.
- [ ] Sección "información general" (`sections/ChecklistGeneralInfoSection.tsx`):
  - [ ] Equipo* (Select "Seleccionar equipo"; "Debe seleccionar un equipo") + ficha resumen del equipo (`dl`).
  - [ ] Enganche (solo si el equipo es tractor con `has_hitch`): botón "Agregar enganche"/"Cambiar enganche"
        (deshabilitado sin equipo) + botón X para quitar; texto "Enganche seleccionado: …"; Alert explicando las
        secciones ocultas del acoplado (ticket 677). Abre **`HitchEquipmentDialog`** ("Seleccionar Equipo
        Enganchado", Command con búsqueda "Buscar equipo enganchado...", carga
        `getCompatibleEquipmentForHitch`; toasts "Debes seleccionar un equipo primero" / "No se encontraron
        equipos compatibles para enganche" / "Error al cargar equipos compatibles").
  - [ ] Cliente (Select opcional "Seleccionar cliente (opcional)", solo si hay clientes).
  - [ ] Chofer* (Combobox de empleados "Buscar por nombre o documento..." → guarda `chofer` + `chofer_employee_id`;
        si no hay empleados, Input libre "Nombre del chofer"; "Debe ingresar el nombre del chofer").
  - [ ] Kilometraje (opcional, muestra "(mín: N km)"; error inline si es menor al actual del equipo) y Horómetro
        (idem con hs).
  - [ ] Fecha* (`<Input type="date">`) y Hora* (`type="time"`). Observaciones (Textarea).
- [ ] Link tenue "Ver diagrama de partes" (si el template tiene diagrama) → `ChecklistPartsDiagramDialog` (imagen).
- [ ] Secciones en Accordion `multiple` (Card por sección, botón "Cerrar" al pie). La del enganche se oculta hasta
      declararlo. Ítems (`sections/ChecklistItemField.tsx`): RadioGroup Bueno/Malo/N/A (default), doble lado
      izquierda/derecha, select, text, number ("Debe ser un número válido"), date; todos obligatorios; badge de
      crítico; observación por ítem (Textarea) si el template la habilita.
- [ ] Alert destructivo "Items críticos fallidos" (lista) tras guardar con fallos.
- [ ] Botones: "Limpiar" (`form.reset()`) · "Guardar Checklist"/"Guardando...".
- [ ] Submit inválido: toast "Falta(n) responder N items" + abre la sección y hace scroll/focus al primero.
- [ ] Submit: valida km/horómetro ≥ actual (toast "Error de validación"); `CreateChecklistAnswer` para el equipo y,
      si hay enganche, otro para el acoplado con sus desvíos (toast de error si falla, no corta).
  - [ ] Con fallos → toast "Checklist guardado" (N fallos, M críticos) + **`CriticalDeviationsRepairModal`**
        (`Mantenimiento/shared/components/critical-deviations-repair-modal.tsx`): "Registrar Desvíos",
        Supervisor de Turno* (combobox, no disponibles deshabilitados), comentario opcional por desvío, ítems
        manuales (`ManualItemsInput`), botones "Cancelar" / "Registrar Desvíos" → `createOrUpdateMaintenanceRequest`.
        Al cerrar/completar redirige a `/dashboard/forms/<id>` (o a `/maintenance/equipment/<eq>/checklists`
        si viene del QR).
  - [ ] Sin fallos → toast "Checklist guardado correctamente" + **`AllGoodDeviationPromptDialog`** (AlertDialog
        "No, continuar" / "Sí, registrar desvío") → opcional **`AdditionalDeviationModal`** ("Registrar desvío
        adicional": supervisor*, picker de ítems del checklist, ítems manuales;
        `createManualDeviationsFromChecklist`; toast "Solicitud de mantenimiento creada").
- [ ] `DevAutoFillButton` (autocompletar) solo si `NEXT_PUBLIC_SHOW_LOGS === 'true'`.

---

## Ver respuesta (ruta vieja) — `/dashboard/forms/[id]/view` (`[id]` = id de la RESPUESTA)

- [ ] Page: `src/app/dashboard/forms/[id]/view/page.tsx`. Usada por la tabla vieja (rama B) y por
      `Equipos/EquipoID/components/vehicle-checklists-tab-content.tsx` (abre en pestaña nueva).
- [ ] Respuesta normalizada: `BackButton` + título del template + `NormalizedChecklistForm readOnly` con
      `defaultAnswers` (sin clientes/empleados, sin enganche ni PDF). Template ausente → "No se encontró el
      template del checklist".
- [ ] Respuesta vieja: "Visualización de respuestas de estructura antigua en desarrollo." (placeholder).
- [ ] No existe: "No se encontró la respuesta con ID: …".

## Ver respuesta (ruta nueva) — `/dashboard/forms/[id]/view/[answerId]`

- [ ] Page: `src/app/dashboard/forms/[id]/view/[answerId]/page.tsx`. `notFound()` si la respuesta no existe o no
      pertenece al template de la URL.
- [ ] Header: `BackButton` · título/descr. · **"Descargar PDF"** (`ChecklistPDFDownloadButton`): Dialog con
      `PDFViewer` (`NormalizedChecklistPDFLayout` con dominio, tipo de equipo, cliente, chofer, fecha,
      observaciones, respuestas y observaciones por ítem), "Cerrar" / "Descargar PDF"; archivo
      `Checklist_<nombre>_<dominio>_<fecha>.pdf`.
- [ ] Cuerpo: `NormalizedChecklistForm readOnly` con cliente, enganche (`defaultHitchEquipmentId`, se muestra como
      chip con subtipo) y badges "N items fallidos" por sección. Sin botones de guardado.

---

## Constructor de formularios custom (legacy) — `/dashboard/forms/new`

- [ ] Page: `src/app/dashboard/forms/new/page.tsx` → `FormCustomContainer` → `FormCardContainer`
      (`Formularios/components/forms/`). **Sin enlaces en la app** (solo URL directa). Contenedor
      `hidden md:flex`: **no se ve en mobile**.
- [ ] Tabs internas (estado local, no query param): Empleados · Vehículos · Empresa · Documentos (formularios custom
      agrupados por `apply`).
- [ ] Por formulario: `FormCard` con Drawer "Completar formulario" (`SubmitCustomForm`, ver abajo) + texto "N
      secciones" + gráfico de barras `FormUseChart` ("Grafico de barras", respuestas por mes).
- [ ] Query param `form_id`: muestra la tabla **manual** de respuestas (columnas dinámicas = claves del JSON,
      fechas ISO formateadas, arrays como badges) con botón "Volver" (borra `form_id`) y botón "Imprimir" por fila.

## Responder formulario custom (legacy) — `/dashboard/forms/new/example?formid=<id>`

- [ ] Page: `src/app/dashboard/forms/new/example/page.tsx` → `SubmitCustomForm` (`Formularios/components/forms/SubmitCustomForm.tsx`).
      Sin enlaces en la app. Loading `FormPageSkeleton fieldCount=4`.
- [ ] Campos dinámicos (`utils/fieldRenderer.tsx` + `Inputs.tsx`): Sección, Si-No, Texto, Área de texto, Archivo,
      Radio, Selección múltiple, Fecha, Selección, Selección Predefinida, SectionDate, SectionObservaciones, Nombre
      del formulario, Título, Subtítulo, Separador. Esquema Zod generado por `buildFormSchema`.
- [ ] Botón "Submit" → `createFormAnswer(formId, JSON)`; toast.promise "Guardando..." / "Respuesta guardada
      exitosamente" y cierra el drawer (click en `#close-drawer`).

---

## Hallazgos a anotar (no se arreglan en el rediseño sin preguntar)

1. **Búsqueda de `checklist-answers` probablemente rota**: `buildSearchWhere(state.search, [])` genera
   `{ OR: [] }`; en Prisma un `OR` vacío no matchea nada → al escribir en "Buscar respuestas..." la tabla queda
   vacía. Verificar en navegador.
2. `NormalizedChecklistForm.onSubmit`: el `catch` general solo loguea (`// TODO: Mostrar toast de error`): si
   `CreateChecklistAnswer` falla, el usuario no ve ningún mensaje.
3. Botón "Imprimir" de la tabla de respuestas en `FormCardContainer` sin `onClick` (no hace nada).
4. Rutas sin enlaces (probable código muerto): `/dashboard/forms/new` y `/dashboard/forms/new/example`, junto con
   `FormCustomContainer`, `FormCardContainer`, `FormCard`, `FormUseChart`, `SubmitCustomForm`, `Inputs.tsx`,
   `fieldRenderer.tsx`. Las vistas viejas de `/view` y `/new` muestran placeholders "en desarrollo".
5. Dos rutas para ver una respuesta normalizada: `/forms/[answerId]/view` (sin PDF, sin cliente/enganche) y
   `/forms/[id]/view/[answerId]` (completa). La tabla vieja y la ficha del equipo usan la incompleta.
6. Las tablas `forms` y `checklist-answers` usan facets **bulk** y no tienen `queryFn` (patrón deprecado según
   `datatable.md`); el orden de `forms` es en memoria y "activos primero" anula el orden del usuario.
7. Los botones "Nueva respuesta" / "Imprimir PDF vacío" / "Ver" no chequean permisos.
8. `TransporteSPANAYCHKHYS01/03/04` se eligen por nombre exacto del formulario (texto hardcodeado).

<!-- estado: completo -->
