# Hallazgos del rediseño v2

Bugs previos y rarezas que aparecen al relevar o rediseñar. No se arreglan en silencio: se anotan acá y se avisa.
Los del plan v1 están en `archivo-v1/PLAN.md` §9.

| Fecha | Módulo | Hallazgo | Estado |
|---|---|---|---|
| 2026-10-10 | Armazón | "Panel de administración" del menú de usuario lleva a `/admin/panel`, que no existe (heredado de GH) | Abierto |
| 2026-10-10 | Configuración | La metadata de `/dashboard/configuration` todavía dice "Empresa \| …" | Abierto |
| 2026-10-10 | Equipos | `permissions-map` declara 3 sub-solapas para Equipos › Mantenimiento y la UI monta 6 | Abierto |
| 2026-10-10 | Armazón | "Sin acceso" en voseo en el 1er nivel y en tuteo en el 2º ("No tienes permisos…") | Abierto |
| 2026-10-10 | Armazón | Selector de empresa: "compañia" sin tilde; login: "Iniciar Sesion" sin tilde | Abierto |
| 2026-10-10 | Acceso | Recuperar contraseña muestra la cita institucional de GH | Abierto |
| 2026-10-10 | Personas | Sin chequeo de permisos en el servidor: `createEmployee`, `updateEmployee`, `toggleEmployeeStatus`, mutaciones de diagramas, `createPreEmployee`, `updatePreEmployee`; la ficha `/dashboard/employee/action` no chequea permiso de página; baja/activar sin permiso | Abierto (seguridad, preguntar) |
| 2026-10-10 | Operaciones | `ServiceDetailDialog.tsx:216` linkea a `/dashboard/employee/<id>` (404) | Abierto |
| 2026-10-10 | Selección | `PRE_LEGAJOS_ROUTE='/dashboard/employee'` revalida la ruta equivocada | Abierto |
| 2026-10-10 | Personas | Huérfanos: `Diagrams/DiagramNewTypeForm.tsx`, `EmpleadoID/forms/employee-form.tsx`, `use-employee-form.ts` | Abierto |
