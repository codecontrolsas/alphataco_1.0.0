# Rediseño de alphataco — Plan v2 (que no se pueda comparar con GH)

> Guía viva. Cualquier sesión que retome el trabajo empieza acá, después `mapa-actual.md` y la carpeta del
> módulo en curso (`modulos/<módulo>/`). El plan anterior (v1, centrado en la estética) está archivado en
> `archivo-v1/` y **no se sigue**.

Rama: `feat/rediseno-ui`. Sin commits salvo pedido explícito del usuario.

---

## 1. Las directivas (2026-10-09)

Palabras del usuario: *"cuando yo hablo de estética, hablo justamente de que no se parezca en nada a GH. Todo lo
que es colores lo vamos a tener que configurar en función de cada empresa, así que en eso no te preocupes
demasiado. Sí que las cosas no se nombren de la misma manera, por ahí cambiarles el lugar de donde están, de cómo
se llega ese dato… buscarle esa vuelta: todo lo que haga que sea muy comparable con GH, tratar de cambiarlo."*

Traducido a reglas de trabajo:

1. **Nombres propios.** Módulos, solapas, títulos, botones, columnas, filtros, estados, mensajes y rutas: ninguno se
   llama igual que en GH salvo que sea un término de dominio inevitable (CUIL, legajo, CCT…), y eso se decide en el
   glosario (Etapa 0).
2. **Otro lugar.** El menú, cómo se agrupan los módulos y dónde vive cada pantalla se repiensan. Una función puede
   cambiar de módulo, de solapa o pasar de página a panel/modal (o al revés).
3. **Otro camino.** Los recorridos para llegar a un dato o completar una tarea se rediseñan (ej. desde dónde se crea
   algo, cómo se llega al detalle, qué se ve primero).
4. **El color no es el foco.** Se va a configurar por empresa: el sistema solo tiene que estar preparado (tokens).
   No se invierte en paletas.
5. **Mismas capacidades.** Todo lo que hoy se puede hacer se sigue pudiendo hacer (el inventario funcional es el
   contrato). Puede cambiar de nombre, de lugar o de recorrido; lo que no puede es desaparecer. Si una capacidad
   se fusiona o se elimina, se pregunta.
6. **Paso a paso.** Módulo por módulo, página por página, modal por modal, tabla por tabla. Nada se implementa sin
   que el usuario haya aprobado la propuesta de ese módulo.

## 2. Qué se conserva del trabajo anterior

| Se conserva (es base, no "parecido a GH") | Se descarta |
|---|---|
| Tokens de color en `globals.css` (sirven para configurar el color por empresa) | `DISENO.md` y sus decisiones de estética (archivado) |
| Primitivos compartidos: `ResponsiveDialog`, `ConfirmDialog`, `DatePicker`, `SearchSelect`, `StatusBadge`, `EmptyState`, `Panel`/`Section`, `SimpleTable`, formatters | El orden de fases v1 y sus checkpoints |
| DataTable responsive (tarjetas en celular, filtros en panel, barra de selección) | — |
| `inventario/` (contrato funcional: 176 secciones, 2501 checks) | — |

Los primitivos y el DataTable se pueden cambiar de forma en cualquier módulo si la propuesta lo pide: se conservan
como punto de partida, no como diseño cerrado.

## 3. El ciclo de cada módulo (siempre igual)

Cada módulo vive en `modulos/<módulo>/` con estos archivos, en este orden:

| Etapa | Archivo | Qué se hace | Quién |
|---|---|---|---|
| 1. Relevamiento | `relevamiento.md` | **GH y alphataco lado a lado**: menú, rutas, nombres, cada página, solapa, modal, tabla (columnas, filtros, acciones) y cada recorrido (cómo se llega a cada dato y cómo se completa cada tarea). Se marca todo lo que hoy es igual o casi igual a GH. Base: `mapa-actual.md` + inventario del módulo + código de los dos repos (GH en `../gh_gestion`). | Claude (agentes de exploración en paralelo) |
| 2. Propuesta | `propuesta.md` | El módulo rediseñado: nombre, lugar en el menú, rutas, y **una ficha por página, modal y tabla** con su nombre nuevo, ubicación, contenido, acciones y recorrido. Cada ficha dice qué ítems del inventario cubre (nada se pierde). Incluye bocetos de las pantallas principales (artifact navegable o capturas). | Agente `ui-skills` (skills de abajo) + Claude |
| 3. Aprobación | — | El usuario revisa la propuesta y aprueba o corrige. **Sin aprobación no se implementa.** | Usuario |
| 4. Implementación | `progreso.md` | Por `/feature-dev:feature-dev`, **una unidad por vez** (página, modal o tabla), en el orden de la propuesta. Las tablas van con el agente `table-expert`. Cada unidad: implementar → `check-types` → verificar en el navegador (escritorio y celular) → tildar sus ítems del inventario. | Claude + agentes |
| 5. Impactos | `progreso.md` | Lo que el cambio arrastra fuera del módulo: nombres de solapas en la base (migración de `tabs`), `permissions-map.ts`, rutas viejas (redirecciones si hay links guardados, mails o PDFs que apunten a ellas), manual de Ayuda (`src/content/manual/`), textos de mails y PDFs, links desde otros módulos. | Claude |
| 6. Auditoría | `auditoria.md` | Auditoría `ui-skills` + `vercel-react-best-practices`, y una pasada de "¿se parece a GH?" comparando capturas lado a lado. | Agente `ui-skills` |
| 7. Cierre | — | El usuario prueba el módulo y da el OK. Se tilda en la tabla de §5. | Usuario |

Skills de ui-skills.com por etapa (MCP `ui-skills`, siempre `autor/slug`):

| Etapa | Skills |
|---|---|
| Propuesta (descubrir y estructurar) | `pbakaus/shape` (brief de cada pantalla), `dammyjay93/interface-design` (paneles de administración), `pbakaus/layout`, `anthropics/frontend-design` |
| Nombres y textos | `mrstev3n/balise-ux-writing`, `pbakaus/clarify`, `jakubkrehel/better-writing` |
| Implementación | `ibelick/baseline-ui`, `shadcn-ui/shadcn`, `vercel-labs/react-best-practices`, `pbakaus/harden` (vacíos, errores, casos borde), `flornkm/prefer-container-queries` |
| Auditoría | `ibelick/improve-ui`, `pbakaus/critique`, `vercel-labs/web-design-guidelines`, `wshobson/wcag-audit-patterns` |

## 4. Etapa 0 — lo transversal, antes del primer módulo

Sin esto, cada módulo inventaría nombres y lugares por su cuenta. Se hace una vez y se aprueba entero.

- [x] **0.1 Mapa general comparado.** GH y alphataco lado a lado a nivel sistema: menú lateral, módulos, rutas
      base, encabezado, buscador, ficha de empleado/equipo, patrón de listas con solapas. Archivo `etapa-0/relevamiento.md`.
- [x] **0.2 Mapa nuevo del sistema.** Propuesta de cómo se agrupa y se navega todo alphataco: módulos (nombre y
      agrupación), qué funciones cambian de módulo, rutas base nuevas, y el armazón (menú, encabezado, cómo se
      cambia de empresa, cómo se busca). Archivo `etapa-0/mapa-nuevo.md` + boceto navegable. **Aprobación del usuario.**
- [x] **0.3 Glosario y voz.** Vocabulario propio de alphataco: cada término de GH que se usa hoy → su reemplazo, y
      los términos de dominio que se mantienen (con el motivo). Reglas de escritura de botones, estados y mensajes.
      Archivo `etapa-0/glosario.md`. **Aprobación del usuario.**
- [ ] **0.4 Color por empresa (preparación).** Verificar que todo el color salga de tokens, para poder
      configurarlo por empresa más adelante. El configurador en sí queda fuera de este plan (§7).
- [ ] **0.5 Pendientes técnicos heredados del DataTable** (se conserva, así que se cierran):
      revisar el `git diff` que dejó a medias el agente cortado; F3-18 (cada fila se dibuja dos veces: fila +
      tarjeta oculta, +90% de nodos en Empleados con 100 filas); F3-19 (menú ⋯ → "Columnas…" en celular: el foco
      queda afuera y Esc no cierra). Detalle en `archivo-v1/features/fase-3-auditoria.md`.

## 5. Módulos — orden y estado

El orden va de lo más identificable con GH (lo que más pesa en la comparación) a lo más propio. El mapa nuevo
(0.2) puede mover funciones entre módulos: si pasa, este orden se ajusta. Las secciones del `mapa-actual.md` de
cada módulo son la lista de unidades a recorrer.

| # | Módulo (nombre actual) | Secciones en el mapa | 1 Relev. | 2 Prop. | 3 Aprob. | 4-5 Impl. | 6 Audit. | 7 Cierre |
|---|---|---|---|---|---|---|---|---|
| 1 | Personas (Empleados + Selección) | 25 + 13 | ✓ | ✓ | | | | |
| 2 | Equipos | 46 | | | | | | |
| 3 | Documentación | 21 | | | | | | |
| 4 | Mantenimiento | 21 | | | | | | |
| 5 | Operaciones | 24 | | | | | | |
| 6 | Comercial y Facturación | 37 | | | | | | |
| 7 | Formularios y Checklists | 12 | | | | | | |
| 8 | Almacenes | 25 | | | | | | |
| 9 | Configuración | 102 | | | | | | |
| 10 | Ayuda (tickets y manual) | 19 | | | | | | |
| 11 | Dashboard / inicio | 22 | | | | | | |
| 12 | Paneles de campo (operario, taller, indumentaria) | 34 | | | | | | |
| 13 | Acceso y errores (login, recuperar, 404) | 14 | | | | | | |
| 14 | PDFs y mails | — | | | | | | |

Notas que cruzan módulos (del inventario):
- Las tablas de documentos de empleados y de equipos se repiten en Documentación y en las fichas: se diseñan una
  vez (en Documentación) y las fichas las reusan.
- Almacenes toca entregas de ropa, Gomería, la orden de mantenimiento y las cubiertas del vehículo: cada una se
  rediseña con su módulo dueño y se verifica contra `inventario/almacenes.md`.
- Las 18 tablas del sistema viejo (`BaseDataTable`) se migran al DataTable actual dentro del módulo que las monta
  (con `table-expert`); las 9 huérfanas se borran. Lista en `inventario/README.md`.

## 6. Reglas que no cambian

- El funcionamiento (lógica de negocio, server actions, triggers, permisos por acción) no cambia; cambian nombres,
  lugares, recorridos y pantallas. Si para reubicar algo hace falta tocar lógica, se pregunta.
- Un bug previo que aparezca se anota en `hallazgos.md` y se avisa; no se arregla en silencio.
- Registros que crecen con el tiempo: siempre paginados en el servidor (regla D7 del plan v1, sigue vigente;
  clasificación en `inventario/crecimiento.md`).
- Proyecto: reglas de `CLAUDE.md` y `.claude/rules/` (DataTable con `table-expert`, forms con shadcn + zod,
  moment, logger, sin `useEffect` innecesario, legajo en toda lista de empleados, etc.).
- Nada de colores fijos: todo por tokens (para el color por empresa).

## 7. Fuera de este plan

- El configurador de colores por empresa (se prepara en 0.4, se construye aparte cuando se pida).
- Cambios de lógica de negocio o de permisos.
- Los bugs de la app detectados al escribir el manual (tickets aparte).

## 8. Bitácora

| Fecha | Qué |
|---|---|
| 2026-10-09 | Plan v2 por las nuevas directivas del usuario (nombres, lugares y recorridos distintos de GH; color configurable por empresa). Se archiva el plan v1 en `archivo-v1/`; se conservan tokens, primitivos, DataTable responsive e inventario. Se genera `mapa-actual.md` (435 secciones en 14 módulos). Próximo paso: Etapa 0.1. |
| 2026-10-10 | Etapa 0.1 hecha (`etapa-0/relevamiento.md`): el armazón ya difiere de GH, pero nombres, orden de módulos, solapas, rutas, fichas, dashboard y textos son iguales. Propuestas 0.2 (`etapa-0/mapa-nuevo.md`) y 0.3 (`etapa-0/glosario.md`) escritas, con boceto navegable (artifact "Mapa nuevo de alphataco"). Esperan aprobación. Main sin novedades (Almacenes ya estaba; Compras sigue en `feat/compras-etapa-1`). |
| 2026-10-10 | Usuario aprueba 0.2 y 0.3 completos ("Está OK, me gusta, metele"): agrupación, movimientos, buscador "Ir a…", rutas nuevas con redirección, ficha con resumen fijo y edición por sección. Estados contractuales (glosario §6): sin respuesta, se aplica la propuesta y se pregunta en cada módulo si aparece uno. Siguiente: armazón (menú agrupado + nombres de espacios + buscador) y módulo 1 Personas. |
| 2026-10-10 | Armazón implementado y verificado en el navegador: menú agrupado con nombres de espacios (Hoy · Trabajo · Recursos · Control · Negocio · Ajustes/Soporte), selector de empresa y menú de usuario con textos propios (sin el link roto a `/admin/panel`), buscador "Ir a…" (Ctrl+K: personas, unidades, equipos auxiliares, clientes, pantallas). Radios de vuelta a redondeados (tokens 8/12px; pedido del usuario: "sin redondeos no me gusta"). Personas: relevamiento y propuesta escritos (`modulos/personas/`), boceto en el artifact. Espera aprobación. |
