# iso — figuras isométricas SVG (skill anatomy)

Kit copiado de `~/.claude/skills/anatomy/kit` (iso-kit.ts + lathe.mjs). Referencias completas de la skill:
`~/.claude/skills/anatomy/references/` (craft.md, kit.md). Ejemplo mínimo: `examples/dial-indicator/build.mjs`.

Reglas del proyecto:

- Las figuras son **funciones puras** `(datos) => string` (SVG) + `IsoFigure` (servidor). Sin WebGL, sin animación continua.
- Interactividad: `data-iso-id` en cada parte clicable + `useIsoSelect` en un wrapper cliente. Solo SVG + estado.
- Tema: `iso.css` ya mapea los grises a los tokens de la app (`.dark` incluido). Estado: tonos `green`/`amber`/`red`/`blue`
  (`data-tone`) o `style="stroke:var(--status-ok)"`. Nada de hex fijos para estado.
- Accesibilidad: `label` descriptivo en `figureSvg`, partes clicables con `role="button"`, `tabindex="0"` y `aria-label`.
- Carga diferida con `next/dynamic` donde la figura no es lo primero de la pantalla.
- Geometría en módulos `.ts` aparte del componente; coordenadas en unidades de mundo (x,y suelo, z arriba).
