---
description: Desarrollo guiado por fases (feature-dev ahorrativo — 1 agente por fase como máximo; modo loop sin aprobaciones previas)
argument-hint: Descripción opcional de la tarea
---

# `/dev` — desarrollo guiado (copia portable de la skill del usuario)

Mismas fases que `/feature-dev:feature-dev`, pero con **un agente como máximo por fase** y ninguno cuando la tarea es
chica. Todo lo que se pueda resolver en el hilo principal con CodeGraph, LSP o una lectura puntual se resuelve ahí.
Aplican las reglas de `docs/rediseno/MODELO-DE-TRABAJO.md` (tests al final, sin commits automáticos, español, permisos,
fechas argentinas, `'use server'`, etc.) y el `CLAUDE.md` del repo. **Superpowers está prohibido** (no invocar skills
`superpowers:*`).

## Principios

- **Preguntar lo ambiguo** antes de diseñar (casos borde, errores, alcance, compatibilidad). En **modo loop** (ver abajo)
  solo se pregunta lo que el usuario debe decidir y no tiene default razonable; el resto se decide con la recomendación y se reporta.
- **Entender antes de actuar**: leer el código y los patrones existentes.
- **Simple y legible**, con las convenciones del repo (`.claude/rules/*.md`).
- Seguir las fases con una lista de tareas (TodoWrite).
- **Agentes**: en singular, con el contexto puntual en el prompt (archivos y extractos), nunca "leé el repo y explorá".
  Pedirles que devuelvan archivos tocados y pendientes. **Modelo por rol** (pasar siempre `model` explícito):
  - **Opus** → `feature-dev:code-architect`: planifica y decide el diseño (auditorías y blueprints, solo lectura).
  - **Sonnet** → ejecutores (`general-purpose`, `table-expert` para DataTables), `feature-dev:code-explorer` y `feature-dev:code-reviewer`.
  - **Haiku** → tareas livianas y mecánicas; si no justifican un agente, se hacen en el hilo principal.
- **DataTables → agente `table-expert`** (`.claude/agents/table-expert.md`).
- **Búsqueda de código**: primero CodeGraph (`codegraph_explore` / `codegraph explore "<pregunta>"`) y LSP; grep solo para texto libre
  (ver `docs/rediseno/referencias/codegraph.md`). Si no hay `.codegraph/`, usar grep/LSP.

## Skills de UI (React/Next/interfaz) — siempre, salvo cambio trivial de texto/color/margen

1. **`vercel-react-best-practices`** (`.claude/skills/vercel-react-best-practices/`): leer SOLO la regla puntual `rules/<slug>.md`
   que aplique (`async-`/`server-` datos y RSC, `bundle-` imports, `rerender-`/`client-` estado). Nunca leer `AGENTS.md` entero (108 KB).
2. **MCP `ui-skills`** (diseño, accesibilidad, motion, tipografía, color, estados): si está disponible
   (`claude mcp add --transport http ui-skills https://www.ui-skills.com/mcp`), leer antes `docs/rediseno/referencias/ui-skills.md`
   (gotchas de slugs). `list_skills` **siempre con `query`**, elegir 1-2 (`autor/slug`), `get_skill`. Si no está o falla 2 veces,
   aplicar el resumen de `MODELO-DE-TRABAJO.md §5` y avisar qué no se pudo cargar.

| Fase             | Qué se hace con las skills                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Descubrimiento | Declarar que aplican ambas fuentes                                                                                                                          |
| 4 Diseño         | Consultar ui-skills con query por eje (accesibilidad, formularios, motion…); pasar el extracto al arquitecto                                                |
| 5 Implementación | Leer la regla puntual de Vercel antes de escribir; cubrir carga/vacío/error/sin permiso, foco/teclado, nombres accesibles, responsive 390/768/1280 y tokens |
| 6 Revisión       | El revisor recibe el extracto de reglas y revisa waterfalls, bundle, servidor, datos y re-renders                                                           |
| 7 Resumen        | Una línea: qué skills y reglas se aplicaron                                                                                                                 |

---

## Fase 1: Descubrimiento

Pedido: $ARGUMENTS

1. Crear la lista de tareas con las fases. 2. Si no está claro, preguntar problema/alcance/restricciones. 3. Resumir lo entendido.

## Fase 2: Exploración

1. CodeGraph/LSP en el hilo principal. 2. Solo si no alcanza (área grande y desconocida): **1** `code-explorer` (Sonnet) enfocado en lo que falta.
2. Leer los archivos clave y resumir hallazgos y patrones.

## Fase 3: Preguntas de aclaración (no saltear, salvo modo loop)

Listar casos borde, errores, integración, alcance, preferencias; **presentar todas juntas** y esperar. Si el usuario dice "lo que te
parezca mejor", dar la recomendación y pedir confirmación explícita.

## Fase 4: Diseño

Tarea chica o de un solo camino → en el hilo principal. Con decisiones reales → **1** `code-architect` (Opus) con 2 enfoques
(mínimo cambio vs. equilibrio pragmático). Presentar trade-offs y **recomendación con motivo**.

## Fase 5: Implementación

**No empezar sin aprobación del usuario** (en modo loop la aprobación está dada por el prompt del loop para todo lo que no sea una
decisión marcada como "del usuario"). Implementar parte por parte verificando cada pieza (tipos con `tsc` temporal acotado,
navegador con snapshot de texto). Actualizar las tareas.

## Fase 6: Revisión

**1** `code-reviewer` (Sonnet), una pasada: bugs, simplicidad/DRY, convenciones, permisos, importes, fechas, `'use server'`.
En cambios chicos, revisar en el hilo principal. Aplicar lo de confianza alta dentro del alcance; lo demás se reporta.

## Fase 7: Resumen

Qué se hizo, decisiones, archivos, skills/reglas aplicadas, pendientes y decisiones abiertas del usuario.

---

## Modo loop (cuando lo invoca `/rediseno`)

- Las fases 1-3 se resuelven leyendo `docs/rediseno/` y el blueprint del módulo; no se pregunta lo que ya está decidido en `ESTADO.md`.
- Fase 5 sin aprobación previa para el alcance del paquete; se detiene y reporta si aparece una decisión de negocio o de permisos/migración.
- Paralelismo: hasta **3 ejecutores** con archivos disjuntos; un solo `tsc` a la vez (ver `MODELO-DE-TRABAJO.md §2`).
