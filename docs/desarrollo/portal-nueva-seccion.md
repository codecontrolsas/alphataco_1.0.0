# Portal del empleado: cómo agregar una sección

El portal (`/portal`) es parte de la app web. Su navegación sale de **un solo registro tipado**:
`src/features/Portal/navigation/registry.ts`. De ahí se arman el menú lateral, la hoja del celular, la barra
inferior, el título de la cabecera, el ítem activo (`aria-current`), los accesos rápidos del inicio y el corte
por módulo de cada página.

## Pasos

Ejemplo: «Mis recibos», que depende de un módulo `recibos`.

1. **Registro.** Agregá una entrada a `PORTAL_SECTIONS`:

   ```ts
   {
     id: 'payslips',
     href: '/portal/payslips',
     label: 'Mis recibos',
     shortLabel: 'Recibos',          // opcional: el nombre en la barra inferior
     description: 'Tus recibos de sueldo para descargar.',
     icon: Receipt,                  // de lucide-react
     module: 'recibos',              // opcional: sin módulo, siempre visible
     order: 30,
     badge: 'payslips',              // opcional: contador de pendientes
     bottomNav: false,               // la barra inferior admite 4 o 5 destinos como máximo
     group: 'main',                  // 'main' | 'account'
   }
   ```

2. **Contador (opcional).** Sumá la clave a `PORTAL_BADGE_KEYS` (en el mismo `registry.ts`) y su resolver en
   `BADGE_RESOLVERS` de `navigation/sections.server.ts`. El resolver recibe el **mismo** objeto `employee` de la
   sesión: si la consulta usa `cache()`, se comparte con la página.

3. **Consultas.** En `src/features/Portal/actions/<seccion>.queries.ts` (`import 'server-only'`): siempre filtradas
   por `employee.employeeId` de la sesión (nunca por un id del cliente), con la RLS por empleado como segundo cerco
   (`app_enable_employee_self`, ver `.claude/rules/migrations.md`). Las escrituras, en `<seccion>.server.ts`
   (`'use server'`), y cada una llama primero a `requirePortalEmployee()`.

4. **Ruta.** Creá `src/app/portal/(panel)/payslips/page.tsx`, fina, que solo importa de la feature. El layout del
   panel ya pone el marco, la sesión y el corte del módulo `portal`.

5. **Pantalla.** En `src/features/Portal/components/payslips/`:

   - El componente de servidor empieza con `const employee = await requirePortalSection('payslips')`: 404 si el
     módulo de la sección está apagado para la empresa del legajo.
   - Encabezado con `PageHeader` (en un detalle, con `breadcrumbs`), y cada bloque con datos dentro de su
     `<Suspense>` con un esqueleto de `src/features/Portal/fallback/`.
   - Reusá `components/ui/`: `DataList` (lista responsive), `SectionCard`, `StatCard`, `StatusBadge` (con un mapa
     `StatusUi`: etiqueta, tono e ícono, nunca solo color), `EmptyState`, `ErrorState`, `KeyValueList` y
     `ConfirmDialog`.
   - Estados obligatorios: carga (esqueleto), vacío (`EmptyState`, que diga cuándo se va a llenar), error (lo
     atrapa `(panel)/error.tsx`) y «no es tuyo / no existe» (`notFound()` → `(panel)/not-found.tsx`).

6. **Inicio (opcional).** Si la sección tiene pendientes, sumá su cuenta en `lib/work-summary.ts` y un bloque en
   `components/home/PortalHome.tsx`. Los accesos rápidos aparecen solos.

## Reglas que no cambian

- La barra inferior del celular solo se muestra en los destinos de primer nivel (`href` exacto). En detalles y flujos
  la acción principal va al pie de la página, sin nada fijo encima.
- El legajo se ve siempre junto al nombre (cabecera, menú de cuenta, perfil, constancias).
- Fechas en hora argentina con `src/shared/lib/argentina-time.ts`.
- Objetivos táctiles de 44 px como mínimo en el celular, foco visible y `motion-reduce` en las transiciones.
