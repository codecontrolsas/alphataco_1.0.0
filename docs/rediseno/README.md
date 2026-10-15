# Rediseño de alphataco — LEER PRIMERO

> Si abrís este repo en una sesión nueva (sin la skill `/dev` ni la memoria del usuario), todo lo necesario
> para continuar está en `docs/rediseno/` y en `.claude/commands/` (`/dev`, `/rediseno`).
> Orden de lectura: este archivo → `MODELO-DE-TRABAJO.md` → `ESTADO.md` → `PROMPT-LOOP.md`.

## Objetivo (lo que el usuario realmente quiere)

alphataco es un **fork de GH** (`../gh_gestion`, GH Gestión / Grupo Horizonte). Se va a **vender como un sistema
único a una empresa**. Por lo tanto:

1. **Quien ya usa GH, al ver alphataco, no debe poder darse cuenta de que es un clon de GH.**
   Se rediseña **desde cero la experiencia visual y estructural**: navegación, sistema de tabs, composición de cada
   página, modales, fichas, listados, paneles. Las **tablas de datos se mantienen** (son la herramienta de trabajo),
   pero todo lo que "se parece a GH" se reemplaza. **No alcanza con cambiar colores ni con un mini rediseño.**
2. **Refactor profundo del código de lo que se rediseña**: más eficiente, ordenado, reutilizado y componentizado;
   eliminar código muerto y duplicado; unificar lo que está repetido.
3. **Responsive de verdad** (móvil 390 px, tablet 768 px, escritorio 1280+ px) en cada pantalla.
4. **No cambiar flujos de negocio.** El rediseño es de estructura, presentación y código. Si algo parece un bug de
   negocio, se reporta o se corrige solo si es claramente un defecto (y se informa).

Es un trabajo de **muchas iteraciones** ("loop"): módulo por módulo, vista por vista, page por page, modal por modal,
casi componente por componente. Cada iteración termina verificada (tipos, build, navegador) y con el estado
actualizado en `ESTADO.md`.

## Qué significa "no parecerse a GH" (criterio de aceptación por pantalla)

Una pantalla se considera **distinta de GH** cuando cumple TODO esto (comparada contra la pantalla equivalente en
`../gh_gestion/src/app/**` y `../gh_gestion/src/features/**`):

- **Navegación**: no usa la misma estructura de tabs horizontales por módulo (`TabsManagerServer`/`TabsManagerClient`
  con pestañas arriba). Usa navegación propia de alphataco (sub-navegación lateral por sección con contadores,
  `SectionManagerServer` + `sectionNav`), con la misma información pero otra estructura.
- **Composición de la página**: no es "Card con título + tabla dentro". Sigue la anatomía propia: cabecera
  (`RecordHeader` en fichas / título + acciones en listados), **banda de atención** sobre la tabla cuando hay
  algo accionable, tarjetas de métricas solo si aportan, tabla, **panel lateral** (Sheet) para detalle rápido en vez de
  páginas/modales encadenados.
- **Lenguaje visual**: tokens propios (`info/warn/danger/ok/brand` en `src/app/globals.css`), estados con
  `StatusUi`/`TONE_TO_BADGE`, nada de colores fijos de Tailwind (`text-blue-600`, `bg-amber-100`…), forma y densidad
  propias.
- **Flujos de interacción**: sin "modal que abre modal"; formularios largos en `Sheet`/página con secciones; confirmaciones con
  `AlertDialog`; estados de carga/vacío/error explícitos (`StateBlock`).
- **Código**: sin los patrones heredados que delatan el fork cuando son visibles al usuario (textos, rótulos, íconos, orden de
  columnas, nombres de secciones idénticos a GH sin razón de negocio).

Cuando una pantalla ya fue rediseñada pero **todavía se parece** a la de GH (misma estructura, solo otro estilo), cuenta
como **no hecha** para este objetivo.

## Cómo se trabaja (resumen; detalle en `MODELO-DE-TRABAJO.md`)

- Skill **`/dev`** (copiada en `.claude/commands/dev.md`): fases de descubrimiento → diseño → implementación → revisión.
- Comando **`/rediseno`** (`.claude/commands/rediseno.md`): una iteración del loop. Se corre con
  **`/loop /rediseno`** (autoritmo) y se detiene cuando `ESTADO.md` marca todo "Hecho y certificado".
- Agentes: Opus audita/diseña (solo lectura), Sonnet ejecuta paquetes disjuntos (máx. 3 en paralelo por RAM),
  un revisor independiente certifica.
- Nada se commitea sin pedido explícito; una vez pedido: **rama nueva + PR**, commit de **una línea**, **sin atribución a IA**.
- Sin tests nuevos hasta que el usuario dé el OK final de funcionamiento.

## Archivos de esta carpeta

| Archivo                | Para qué                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `README.md`            | Objetivo y criterio de aceptación (este archivo)                                                  |
| `MODELO-DE-TRABAJO.md` | Reglas del usuario, roles de agentes, verificación, patrones compartidos, trampas aprendidas      |
| `ESTADO.md`            | Tabla por módulo (rediseño + brecha vs GH), hecho/pendiente, decisiones abiertas                  |
| `PROMPT-LOOP.md`       | Prompt completo del loop y prompt de arranque para una sesión nueva                               |
| `referencias/`         | Blueprints y notas de las auditorías ya hechas (Mantenimiento, Operaciones, Documentos, Triggers) |
