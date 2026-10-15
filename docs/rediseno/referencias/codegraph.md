# LSP + CodeGraph: instalación y detalles

> Referencia movida desde `~/.claude/CLAUDE.md` el 2026-10-12. Se lee solo cuando la tarea la necesita.

Dos herramientas instaladas a nivel usuario para **entender y navegar el código sin grepear a ciegas**. Aplican a todos los proyectos. Se eligieron después de comparar Graphify, Serena, GitNexus y code-review-graph: lo visual no interesa, el criterio es que me hagan más rápido y preciso a mí.

## Qué usar para qué

| Necesidad                                                                                         | Herramienta                                                                               | Por qué no grep                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Todas las referencias exactas de una función/tipo/schema, ir a la definición, quién llama a quién | **Tool `LSP`** (`findReferences`, `goToDefinition`, `incomingCalls`, `hover`)             | Grep encuentra texto: se le escapan re-exports y alias, y da falsos positivos con nombres repetidos                           |
| Errores de tipos mientras edito                                                                   | **LSP** (diagnósticos automáticos tras cada edición)                                      | No esperar a `check-types` completo para enterarme. `check-types` sigue siendo el control final                               |
| "¿Qué se rompe si cambio esto?", entender un área que no conozco, cadena UI → action → función    | **CodeGraph** (`codegraph_explore` por MCP, o `codegraph explore "<pregunta>"` por shell) | Devuelve el código + el blast radius + la cadena de llamadas (incluido "componente renderiza componente") en una sola llamada |
| Triggers, funciones SQL, policies, lógica en la BD                                                | **MCP de la base** (`pg_get_functiondef`, etc.)                                           | **Ninguna de las dos herramientas ve la BD.** El grafo cubre solo código                                                      |

Regla práctica: **análisis de impacto previo a un cambio = CodeGraph para el mapa + LSP `findReferences` para la lista exacta**. Grep queda para texto libre (strings de UI, comentarios, SQL en migraciones).

**Regla obligatoria: la PRIMERA búsqueda es SIEMPRE CodeGraph o LSP** cuando el repo tiene `.codegraph/`, incluidos los repos hermanos del workspace (ej. leer `contable_PMS` desde `control-documental-ai`: `codegraph explore "<pregunta>"` corrido dentro de ese repo). Nada de arrancar con `find`, `ls` recursivo, `grep` ni un agente Explore. Se cae a lectura directa o grep **solo** cuando claramente conviene más: lo buscado no es código indexado (CSS, `.env`, Markdown, JSON de config, SQL de migraciones, strings de UI) o CodeGraph ya respondió algo que no tiene que ver. En ese caso se dice por qué se cambia de herramienta.

## Estado de la instalación

- **LSP**: plugin oficial `typescript-lsp@claude-plugins-official` + binario global `typescript-language-server` (npm). Sin índice: consulta el código en vivo, nunca queda desactualizado.
- **CodeGraph** (`@colbymchenry/codegraph`, MIT, npm global): MCP `codegraph` en `~/.claude.json`, permiso `mcp__codegraph__*` y un hook `UserPromptSubmit` (`codegraph.cmd prompt-hook`, ~0,4 s, no inyecta nada si el prompt no nombra código) en `settings.json`. **Telemetría apagada** (`codegraph telemetry off`). Respaldo de la config previa en `~/.claude/backup-pre-codegraph/`. Desinstalar: `codegraph uninstall`.
- **Proyectos indexados** (índice en `<repo>/.codegraph/codegraph.db`): todos los de `Workspace/CodeControl` — `gh_gestion`, `contable`, `contable_PMS`, `control-documental-ai`, `credere`, `ecokit`, `nahuel-servicios`, `s-codeControl`, `sinergia`, y los sub-repos de `pymesuit/*` y `taskapp/*`. El índice se re-sincroniza solo ante cambios (watcher del MCP).

## Reglas de uso

1. **Proyecto nuevo o sin `.codegraph/`**: ofrecer indexarlo (`codegraph init --yes`, tarda segundos) y, si es repo git, agregar `.codegraph/` a **`.git/info/exclude`** — nunca al `.gitignore` del repo (sería un cambio a commitear que nadie pidió).
2. **Sub-repos**: `pymesuit` y `taskapp` son carpetas contenedoras; se indexa cada sub-repo, no la carpeta padre.
3. **No confiar ciegamente en el grafo**: si una respuesta de CodeGraph contradice lo que veo en el archivo, manda el archivo y re-indexar (`codegraph init --yes` sobre el repo). Para listas exactas de referencias, confirmar con LSP.
4. El índice (decenas de MB) vive dentro de cada repo y no viaja entre PC (cada una indexa lo suyo con `codegraph init --yes`); no borrarlo "para limpiar".

<!-- CODEGRAPH_START -->
