# Inventario — Ayuda

> Ficha "ANTES" del módulo Ayuda (`/dashboard/help`). Sirve para verificar, después del rediseño, que no se
> perdió ninguna opción. Cada `- [ ]` se tilda cuando se comprobó en la versión nueva.
> Relevado del código el 2026-10-07 (rama `feat/rediseno-ui`). Permisos: `módulo:tab:acción`.
> El módulo **no usa DataTable** (ni nuevo ni viejo): todas las listas son manuales (tarjetas/filas).

Permisos del módulo (`permissions-map.ts`): `ayuda:tickets` (`view`) y `ayuda:manual` (`view`). No hay acciones
create/update/delete: todo lo que se puede hacer dentro de Tickets lo decide TaskApp (reporter / aprobador).

---

## Shell del módulo — `/dashboard/help` (`?tab=tickets` | `?tab=manual`)

- [ ] Página: `src/app/dashboard/help/page.tsx` → `src/features/Ayuda/AyudaComponent.tsx` (`SectionManagerServer`, `paramName="tab"`, default `tickets`).
- [ ] `generateMetadata`: título `Ayuda | <empresa>` (cookie `actualCompName` o `getCompanyName()`), fallback `Ayuda`.
- [ ] `loading.tsx`: `FormPageSkeleton` (3 campos, 1 columna, sin botón volver).
- [ ] Sección **Tickets** (icono `LifeBuoy`), visible con `ayuda:tickets:view`; `hideTitle: true` (el Centro de Ayuda trae su propio título). Suspense → `MyTicketsListSkeleton`.
- [ ] Sección **Manual de uso** (icono `BookOpen`), visible con `ayuda:manual:view`. Suspense → `ManualSkeleton`.
- [ ] Sin permiso a ninguna de las dos secciones → `redirect('/dashboard')`.
- [ ] Fuera de la página (globales, viven en el layout/header/sidebar pero son del módulo):
  - [ ] `SupportTicketsRealtimeProvider` en `src/app/dashboard/layout.tsx`: SSE `/api/taskapp/events`; ante `ticket.created|updated`/`comment.created` invalida mis tickets, página, aprobador, timeline y detalle; en error re-sincroniza (máx. 1 cada 15 s).
  - [ ] Badge de no leídos en el sidebar (`NavMain.tsx` → `useUnreadSupportTicketsCount`, badge `support-tickets`).
  - [ ] Botón "Ayuda sobre esta pantalla" (`CircleHelp`) en `DashboardHeader` → `ContextualHelp` / `ContextualHelpButton`: solo con `ayuda:manual:view`; lleva a la guía que matchea la ruta actual (`pathname` + `tab` + `subtab`) o a la portada; se oculta estando dentro del manual (o en `/dashboard/help` sin tab cuando el manual es la sección por defecto, i.e. sin permiso de tickets).

---

## Centro de Ayuda (Tickets) — `/dashboard/help?tab=tickets[&ticket=<id>]`

- [ ] Componente raíz: `src/features/Ayuda/Tickets/TicketsTabContent.tsx` (server: `getMyTicketsWithUnread`, `getSupportTicketById(ticket)` si viene `?ticket=`, `getReporterEmail`) → `components/HelpCenter.tsx` (client).
- [ ] Datos de TaskApp (`@/shared/lib/taskapp`), no de Prisma. Una sola query de lista (`useMyTicketsWithUnread`, con `initialData` del server).

### Encabezado
- [ ] Icono `HelpCircle` + título "Centro de Ayuda" + bajada "Reportá un problema y seguí el estado de tus solicitudes."
- [ ] Botón **Actualizar** (outline, `RefreshCcw`; spinner y deshabilitado mientras `isFetching`; texto oculto en < sm) → `refetch()`.
- [ ] Botón **Reportar** (`Plus`, solo < lg): pliega/despliega el formulario (`aria-expanded`); en mobile el form arranca oculto.
- [ ] Sin permiso adicional para ningún botón (basta `ayuda:tickets:view`).

### Bandeja "Pendientes de tu aprobación" — `components/ApproverInbox.tsx` (lista manual)
- [ ] Solo si el usuario es aprobador y hay pendientes (`usePendingApproverTickets`); si no, no renderiza nada. Carga → `ApproverInboxSkeleton`.
- [ ] Card con borde izquierdo amarillo, `ShieldCheck`, título + badge con cantidad, bajada "Aprobá o rechazá estos tickets…".
- [ ] Por fila: punto amarillo, `TKT-<id> · <título sin [Categoría]>`, descripción (1 línea), reportante (nombre o email o "Desconocido"), categoría con icono, antigüedad (`fromNow`), "N h valorizadas" si hay `estimated_hours`, badge de prioridad.
- [ ] Click en la fila → abre el Sheet de detalle (`?ticket=<id>`).
- [ ] Acciones por fila: **Rechazar** (outline) y **Aprobar** (spinner si ocupado). **Sin confirmación** (a diferencia del banner del Sheet). Toasts "Aprobación registrada." / "Rechazo registrado." o el mensaje de error. Siempre invalida la query del aprobador.

### Panel "Mis tickets" (lista manual con pestañas propias) — `HelpCenter.tsx` + `MyTicketsList.tsx` + `TicketCard.tsx`
- [ ] Título "Mis tickets" + "N en total" (tabular).
- [ ] Pestañas propias (`components/Tabs.tsx`, WAI-ARIA, activación manual, flechas/Home/End): **Para revisar** / **En curso** / **Cerrados**, cada una con contador. Bucket: cerrado si `client_confirmed_at` o status `closed|cancelled`; "Para revisar" si demanda `approve` (status `pendiente_aprobacion`) o `confirm` (`resolved|done`); el resto "En curso".
- [ ] Pestaña inicial derivada: "Para revisar" si tiene items (o si no hay ningún ticket); si no, "En curso" si tiene; si no, "Cerrados". La elección del usuario manda después.
- [ ] Paginación cliente: 5 tarjetas por pestaña + botón "Ver N tickets más" (suma 5). En "Para revisar" se muestran todas. Cambia de pestaña → vuelve a 5.
- [ ] Estados: carga → `MyTicketsListSkeleton`; error → "No se pudieron cargar tus tickets" + botón **Reintentar** (`role="alert"`); vacío total → "Todavía no enviaste ningún reporte" + botón **Reportar un problema** (abre/scrollea al form); vacío por pestaña: "Estás al día" / "No hay nada en curso" / "Todavía no se cerró ningún ticket" (textos en `EmptyTicketsState.tsx`).
- [ ] **Tarjeta (`TicketCard`)** colapsable; la primera de "Para revisar" arranca abierta. Borde izquierdo por color de estado; sombra si demanda algo.
  - [ ] Cabecera: chip de estado (label de `constants/ticket-status.ts`: Abierto, Esperando tu aprobación, Aprobado por vos, En curso, Frenado, Planificado, Valorizado, Pendiente de planificación, Resuelto, Cerrado, Cancelado), chip "Novedad" si `unread.hasStatusChange|hasNewAgentComment`, `TKT-<id>`, categoría (solo ≥ sm), badge de prioridad (Baja/Media/Alta/Crítica).
  - [ ] Título como disclosure (botón dentro de `h3`, chevron). Abrir con novedad → `markAsRead`.
  - [ ] Línea de estado: copy por estado (`ticket-copy.ts`, incl. reapertura pendiente, propuesta de cierre pendiente/rechazada) + "· hace X" (`updated_at`).
  - [ ] Expandida: **Recorrido del ticket** (`TicketTimeline`, lazy al abrir; < 3 hitos → línea de texto; último hito en verde con sr-only "última parada"), "Lo que reportaste", aviso de propuesta de cierre (`TicketCloseProposalNotice` variante card), panel de resolución si `canDecide`, botón **Revisar el presupuesto del TKT-<id>** si demanda `approve` (abre Sheet).
  - [ ] Pie: link **Ver la conversación del TKT-<id>** (abre Sheet), **Proponer cierre** (si `canProposeClose`), "N adjunto(s)", "Reportado el D MMM YYYY".
- [ ] `canAct` siempre `true` en esta lista.

### Panel de resolución — `components/TicketResolutionPanel.tsx` (en tarjeta y en Sheet)
- [ ] "Qué hicimos" (`client_summary`, caja verde) si existe.
- [ ] Checklist "Qué mirar para confirmarlo" desde `verification_steps` (parseo de viñetas/números), contador "N de M", tildes solo locales ("Los tildes son sólo para vos: no se guardan.").
- [ ] Si `canDecide` (status `resolved|done`, sin confirmar, sin reapertura ni propuesta pendientes):
  - [ ] Botón **Sí, quedó resuelto** (verde) → `confirmTicket`; toast "Listo, lo marcamos como resuelto."; error inline `role="alert"` con link **Reintentar** (no toast).
  - [ ] Botón **No quedó resuelto** → abre `TicketReopenRequestDialog`.
  - [ ] Texto "Confirmar cierra el ticket. Podés pedir la reapertura más adelante."
  - [ ] Si `!canAct`: botones deshabilitados + "Sólo quien reportó el ticket o un aprobador del proyecto puede responder."

### Formulario "Reportar un problema" — `components/TicketForm.tsx` (Card fija a la derecha en ≥ lg, sticky; plegada en mobile; carga diferida `ssr:false` con placeholder pulsante)
- [ ] RHF + zod. Campos:
  - [ ] **Categoría*** (Select con icono): Dashboard, Configuración, Empleados, Equipos, Comercial, Documentación, Operaciones, Mantenimiento, Formularios, Otro. Default "Otro".
  - [ ] **Prioridad*** (`TicketPrioritySelect`): Baja, Media, Alta, Crítica. Default "Media".
  - [ ] **Asunto*** (Input): 3–200 caracteres ("Mínimo 3 caracteres" / "Máximo 200 caracteres").
  - [ ] **Descripción*** (Textarea, 6 filas, resize-y): 10–5000 ("Contanos un poco más (mínimo 10 caracteres)" / "Máximo 5000 caracteres"); contador `N/5000` (ámbar > 4500).
  - [ ] **Adjuntos** (opcional, `TicketAttachmentInput`): botón "Adjuntar archivo", máx. 3 archivos, máx. 20 MB c/u; contador `N/3 · máx. 20 MB`; lista con icono, nombre, tamaño y botón quitar (X). Toasts warning: "Ignoramos N archivo(s) que superan 20 MB." / "Solo podés adjuntar 3 archivos. Quedaron los primeros 3."
- [ ] Botón **Enviar reporte** (`Send`; "Enviando…" con spinner; deshabilita todo el form mientras envía).
- [ ] Envío: sube cada adjunto (`uploadAttachment`) → `createTicket` con título `[<Categoría>] <asunto>`. Toast "Tu reporte fue enviado. Te avisaremos cuando haya novedades."; resetea conservando la categoría; error → toast con mensaje o "No pudimos enviar tu reporte".

### Panel "Todos los tickets del proyecto" (aprobador) — `components/ApproverAllTickets.tsx` (lista manual paginada server-side)
- [ ] Solo para aprobadores (si `total === 0` no renderiza). Carga → `ApproverAllTicketsSkeleton`.
- [ ] Título con `ListChecks` + badge con total; bajada "Vista de aprobador: reportes de todos los usuarios y quién los generó."
- [ ] Fila (botón): punto de color de estado, `TKT-<id> · título`, reportante, categoría, antigüedad, badge de prioridad, badge de estado. Click → Sheet de detalle.
- [ ] Orden: más recientes primero (backend). Página de 10 (`APPROVER_ALL_PAGE_SIZE`).
- [ ] `PaginationNav` (si total > 10): "Mostrando a–b de N", anterior/siguiente, "p / total"; botones bloqueados y spinner mientras carga; `PageFetchBar` (barra indeterminada) + filas atenuadas durante la transición.

### Sheet de detalle — `components/detail/TicketDetailSheet.tsx` (Sheet derecho, `sm:max-w-2xl`, carga diferida `ssr:false`)
- [ ] Se abre con `?ticket=<id>` (deep link; SSR del ticket inicial) o desde cualquier lista; actualiza la URL con `replaceState`; cerrar quita `ticket` de la URL; back/forward sincroniza.
- [ ] Al abrir → `markAsRead(ticketId)`.
- [ ] Estados: carga → `TicketDetailSheetSkeleton`; sin datos → `Inbox` + "Ticket no encontrado o sin acceso" + "Puede que el ticket haya sido eliminado o que no tengas permiso para verlo."
- [ ] Encabezado (`TicketDetailHeader`): título limpio, badge de categoría, estado, prioridad, "N hs estimadas", "Creado <LL a las HH:mm>".
- [ ] **Banner de aprobación** (`TicketApprovalBanner`): solo si el usuario es aprobador del ticket (está en sus pendientes) y status `pendiente_aprobacion`. Texto + "Horas valorizadas: N h". Botones **Rechazar** / **Aprobar** → **con confirmación** (`components/ConfirmDialog.tsx`, `<dialog>` nativo propio, no shadcn):
  - [ ] Aprobar: "¿Confirmás la valorización de este ticket?" + "Al aprobar confirmás la valorización de N h y el ticket pasa a planificación." (o variante sin horas); botón "Aprobar valorización".
  - [ ] Rechazar: "¿Confirmás que rechazás este ticket?" + "Al rechazar, el ticket queda cancelado y el equipo no avanzará con él."; botón destructivo "Rechazar ticket".
  - [ ] Toasts "Aprobación registrada." / "Rechazo registrado." o error.
- [ ] **Banner de reapertura** (`TicketReopenRequestBanner`): solo al reportante con `reopen_status = pending` → "Solicitud de reapertura enviada" + "hace X — un agente la va a revisar y te avisamos."
- [ ] Aviso de propuesta de cierre (`TicketCloseProposalNotice` variante sheet): pendiente ("Propuesta de cierre esperando respuesta", tipo, cuándo, "Motivo que se envió") o rechazada ("El equipo decidió seguir con el ticket", "Motivo del equipo").
- [ ] Cuerpo (`TicketDetailBody`, scroll propio):
  - [ ] Panel de resolución arriba de todo si `canDecide` (con `canAct` = true).
  - [ ] "Descripción".
  - [ ] **Adjuntos (N)** (`TicketAttachmentsList`): grilla 2/3 columnas, miniatura si es imagen (png/jpg/jpeg/gif/webp) o icono; abre en pestaña nueva.
  - [ ] Bloque **Proponer cierre** (variante panel, borde punteado) si `canProposeClose`.
  - [ ] "Conversación" (`TicketCommentsThread`): carga → `TicketCommentsThreadSkeleton`; vacío → "Todavía no hay respuestas. Sé el primero en escribir."; burbujas (`TicketCommentItem`): propias a la derecha con iniciales, las del equipo como "Soporte" con icono `Wrench`; adjuntos dentro de la burbuja; comentario optimista atenuado (`id < 0`); "nombre · hace X".
  - [ ] Ticket completado (`resolved|done|closed|cancelled`) → candado "Este ticket está cerrado. No se pueden agregar comentarios." en lugar del composer.

### Composer de comentarios — `components/detail/TicketCommentComposer.tsx` (no es RHF)
- [ ] Textarea "Escribí una respuesta… (Ctrl+Enter para enviar)"; **Ctrl/Cmd+Enter** envía. Contador `N/5000`.
- [ ] Botón adjuntar (`Paperclip`, sin límite de cantidad, 20 MB c/u — toast error `"<nombre>": supera los 20 MB`); previews en grilla con quitar (X, visible en hover).
- [ ] Botón **Enviar** habilitado si hay texto o adjuntos y texto ≤ 5000.
- [ ] Envío: limpia el campo optimista → sube adjuntos → `appendSupportTicketAttachments` (adjuntos van al ticket) + invalida detalle → crea comentario con sufijo "📎 N archivo(s) adjunto(s)". Error → restaura texto/archivos + toast.

### Dialog "Solicitar reapertura del ticket" — `components/detail/TicketReopenRequestDialog.tsx` (shadcn `Dialog`, RHF + zod)
- [ ] Título con `RotateCcw` + descripción.
- [ ] **Justificación*** (Textarea 5 filas): 20–2000 ("Contanos un poco más, mínimo 20 caracteres" / "Máximo 2000 caracteres"), contador `N/2000`.
- [ ] **Adjuntos (opcional)**: `TicketAttachmentInput` (máx. 3, 20 MB).
- [ ] Botones **Cancelar** / **Enviar solicitud** (spinner). No se puede cerrar mientras envía.
- [ ] Envío: sube adjuntos (`uploadSupportTicketAttachment`) → `requestReopen`; toast "Solicitud enviada. Te avisamos cuando haya respuesta."; resetea y cierra.

### Dialog "Proponer el cierre del TKT-<id>" — `components/detail/TicketCloseProposalDialog.tsx` (`<dialog>` nativo propio, sin RHF)
- [ ] Abierto desde **Proponer cierre** (link en tarjeta / panel en Sheet). Solo si `canProposeClose` (en curso, sin propuesta ni reapertura pendiente).
- [ ] Radio obligatorio "¿Por qué querés cerrarlo?": **Ya está resuelto** / **Ya no lo necesito** (con descripciones). Error "Elegí una de las dos opciones."
- [ ] Textarea: "Comentario para el equipo (opcional)" si resuelto; "Motivo (obligatorio)" si cancelar (10–1000; "Contanos por qué ya no lo necesitás." / "Escribí al menos 10 caracteres." / "Acortalo un poco: puede tener hasta 1000 caracteres."). Contador `N/1000` (rojo si se pasa). Hint dinámico.
- [ ] Aviso `stale`: "El ticket cambió mientras escribías y ya no admite una propuesta de cierre…" (deshabilita enviar).
- [ ] Error del servidor inline (`role="alert"`), no solo toast.
- [ ] Botones **Volver** / **Enviar propuesta**. Click en backdrop cierra solo si el textarea está vacío; Esc cierra (sin cerrar el Sheet de abajo).
- [ ] Éxito: toast "Enviamos tu propuesta de cierre. Te avisamos cuando el equipo responda.", cierra y mueve el foco al aviso de propuesta.

---

## Manual de uso — `/dashboard/help?tab=manual[&guide=<slug>][#<ancla>]`

- [ ] Componente raíz: `src/features/Ayuda/Manual/ManualTabContent.tsx` (server). Contenido: 56 `.mdx` en `src/content/manual/` (catálogo de secciones en `Manual/catalog/`). Sin tablas ni formularios.
- [ ] Guías visibles filtradas por permiso: requiere `ayuda:manual:view` y, si la guía declara `access`, alguna de esas tabs visible (`lib/guide-access.ts`).
- [ ] Layout (`ManualLayout`): columna izquierda (índice + buscador cuando hay `guide`), contenido, columna derecha "En esta guía" (TOC, solo ≥ xl). Índice sticky en ≥ lg; en mobile, índice dentro de un `<details>` "Índice del manual".

### Índice — `components/ManualIndex.tsx`
- [ ] Secciones como `<details>` con icono, título y cantidad de guías; abierta la sección de la guía activa; guía activa resaltada (`aria-current="page"`).

### Portada (sin `guide`) — `components/ManualHome.tsx`
- [ ] Hero "¿Qué necesitás hacer en el sistema?" + "Hay N guías…" + buscador grande.
- [ ] "Empezá por acá" (guías numeradas de `START_HERE`, cards con resumen).
- [ ] "Recorridos según tu tarea" (`READING_PATHS`, solo los que tienen ≥ 2 pasos visibles).
- [ ] Bloque de procesos (sección `procesos`, barra de acento izquierda, links con flecha).
- [ ] "Módulos del sistema": card por sección (icono, descripción, "N guías", primeras 4 guías, "Y N más en el índice del manual.").

### Buscador — `components/ManualSearch.tsx` (client, React Query + server action `searchManual`)
- [ ] Combobox accesible; mínimo 2 letras; debounce 250 ms; atajo de teclado **/** (kbd visible); flechas/Enter/Esc.
- [ ] Estado (`role="status"` siempre montado): "Buscando…", "No se pudo buscar." (+ **Reintentar**), "Sin resultados para «q»." (+ sugerencia y **Limpiar búsqueda**), "N resultados".
- [ ] Resultado: título, "Sección › encabezado", snippet con coincidencias resaltadas (`mark` amarillo). Navega a la guía con ancla.

### Guía (`?guide=<slug>`) — `components/GuideView.tsx` (MDX compilado en server con `next-mdx-remote`, `remark-gfm`, `rehype-slug`)
- [ ] Breadcrumb "Manual › Sección › Guía".
- [ ] Título, resumen, "N minutos de lectura", "Actualizada el D de MMMM de YYYY" (si hay `updated`).
- [ ] TOC plegable "En esta guía" en < xl; TOC lateral con resaltado por scroll en ≥ xl (`GuideToc`). `ScrollToHash` lleva al ancla del hash.
- [ ] Componentes MDX: `Callout` (Para tener en cuenta / Consejo / Atención / Cuidado), `Steps`/`Step`, `OpenScreen` (botón "Abrir <pantalla>"; deshabilitado con candado + "Tu rol no tiene acceso a esa pantalla."), `GuideLink` (link a otra guía; sin acceso → texto gris "No tenés acceso a esta guía"), `Flow`/`FlowStep`, `States`/`State`, `Kbd`, y estilos de h2/h3/p/listas/code/pre/blockquote/hr/a/tablas.
- [ ] "Ver también" (guías relacionadas) y navegación **Anterior / Siguiente**.
- [ ] Error de compilación MDX → aviso "No se pudo mostrar esta guía" (sin acción).

### Avisos (`components/ManualNotice.tsx`)
- [ ] Guía existente sin permiso → `Lock` "No tenés acceso a esta guía" + **Ir a la portada del manual**.
- [ ] Slug inexistente → `FileQuestion` "No encontramos esa guía" + **Ir a la portada del manual**.
- [ ] Ninguna guía visible → `BookDashed` "Todavía no hay guías publicadas"; con `ayuda:tickets:view` ofrece **Escribir a soporte** (`/dashboard/help?tab=tickets`), si no, "consultala con un administrador".
- [ ] Carga → `Manual/fallback/ManualSkeleton.tsx`.

---

## Rarezas encontradas

- `components/ReportAnIssue.tsx`: formulario viejo (useState, envío por mail `sendHelpRequestEmail`, botón "Cancelar" sin `type="button"`, campo Asunto que no se envía) **sin ningún importador**: huérfano.
- `hooks/useMyTicketsPage.ts`: solo se usa su query key para invalidar; ninguna pantalla lo consume.
- Aprobar/Rechazar desde la bandeja (`ApproverInbox`) es **sin confirmación**; desde el banner del Sheet es **con confirmación**. Asimetría existente (no cambiar sin preguntar).
- Dos diálogos usan `<dialog>` nativo propio (`ConfirmDialog`, `TicketCloseProposalDialog`) y no shadcn; el de reapertura sí usa shadcn `Dialog`. Lo mismo las pestañas (`components/Tabs.tsx` propio, por compatibilidad con el CLI de TaskApp que instala el módulo en otras apps: tocar estos archivos puede divergir del módulo upstream).
- Límite de adjuntos distinto: formulario de alta y reapertura máx. 3; composer de comentarios sin límite de cantidad.
- `TicketApprovalBanner` recibe `currentUserEmail` y lo descarta (`void`).
- Colores hardcodeados abundantes (amarillo/ámbar/esmeralda, `shadow-[...#0000000d...]`, `mark` amarillo) — candidatos del conteo de la Fase 0.

<!-- estado: completo -->
