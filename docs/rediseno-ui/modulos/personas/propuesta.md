# Módulo 1 · Personas — propuesta (PENDIENTE DE APROBACIÓN)

Base: `relevamiento.md`, `../../etapa-0/mapa-nuevo.md`, `../../etapa-0/glosario.md`. Boceto: artifact "Mapa nuevo de
alphataco", artboard "Personas". Nada de lo que hoy se puede hacer desaparece (columna "Cubre" = secciones del
inventario).

## 0. Qué cambia, en una línea

GH: lista con solapas Activos/Inactivos → ficha con 6 pestañas y un botón Editar que pone todo en edición.
alphataco: **Nómina con resumen por estado arriba**, ficha de **una sola página** con resumen fijo a la izquierda y
**secciones que se modifican de a una**, Ingresos y Rotaciones como secciones propias de Personas.

## 1. Rutas

| Hoy | Nuevo | Redirección |
|---|---|---|
| `/dashboard/employee?tab=employees&subtab=empleados-activos` | `/people` | sí |
| `…&subtab=empleados-inactivos` | `/people/departed` | sí |
| `/dashboard/employee/action?action=view&employee_id=X[&tab=…]` | `/people/X[#seccion]` (`tab=documents` → `#documentos`) | sí (incluye el mail de vencimientos) |
| `…action=edit&employee_id=X` | `/people/X` | sí |
| `…action=new` | `/people/new` | sí |
| `/dashboard/recruitment`, `/detail?action=view&pre_employee_id=X`, `?action=new` | `/people/intake`, `/people/intake/X`, `/people/intake/new` | sí |
| `/dashboard/employee?tab=diagrams&subtab=old\|new\|massive_diagram\|reports` | `/people/rotations`, `/people/rotations` (panel abierto), `/people/rotations/import`, `/people/rotations/log` | sí (con los filtros `diagOld_*`) |

Menú: **Personas** → Nómina · Ingresos · Rotaciones (Ingresos deja de ser un ítem suelto).

## 2. Fichas de unidades

### P1 · Nómina (página `/people`) — cubre `empleados.md` §Lista activos

- **Título** "Nómina" con **"Persona nueva"** al lado (no a la derecha de la tabla) y "Descargar planilla" a la derecha.
- **Resumen por estado** (chips que filtran, con contador): En nómina · Al día · Con faltantes · Con vencidos ·
  Habilitados/No habilitados (si la empresa usa aval). Un clic filtra la tabla por ese estado; "Egresados" lleva a
  P2. Contadores por `groupBy` en el servidor (una query).
- **Buscador visible** "Legajo, nombre o CUIL" (hoy la tabla no tiene buscador global).
- **Tabla** (mismo DataTable, `table-expert`): Legajo · Persona (foto + Apellido, Nombre) · Puesto · Asignada a ·
  Cumplimiento · Ingreso. Email, Sector y el resto pasan a "Vista" (ocultas por defecto, se siguen pudiendo mostrar,
  filtrar y exportar). Filtros visibles por defecto: Cumplimiento, Puesto, Asignada a.
- **Fila**: el nombre abre la ficha; menú ⋯ "Abrir" / "Modificar datos".
- Export: "Nómina al dd/mm/aaaa".

### P2 · Egresados (`/people/departed`) — cubre §Lista inactivos

Misma tabla con Legajo · Persona · Puesto · Motivo de egreso · Fecha de egreso. Chip de volver a "En nómina".
Filtros por defecto: Motivo de egreso, Puesto, Fecha de egreso.

### P3 · Ficha de persona (`/people/X`) — cubre §Ficha completa

- **Columna izquierda fija (resumen)**: foto, Apellido, Nombre, **Legajo** (hoy no aparece en el encabezado),
  estado de cumplimiento con cuántos faltan/vencen (clic → sección Documentos), Puesto, Asignada a, Rotación
  actual, En nómina/Egresada (con motivo y fecha). Acciones: **Subir documento**, **Escribirle** (mail),
  **Registrar egreso** / **Reincorporar**.
- **Derecha**: índice de secciones (anclas, se queda arriba al scrollear) y las secciones **en una sola página**:
  1. Datos personales · 2. Contacto · 3. Trabajo (incluye asignación a clientes, habilitaciones, sectores de taller) ·
  4. Documentos (Fijos / Periódicos, la misma tabla que Cumplimiento) · 5. Rotación (calendario + historial +
  "Cargar rotación") · 6. Ropa y EPP (entregas, anular, constancias).
- **Edición por sección**: cada bloque de datos tiene "Modificar" → el bloque pasa a formulario con "Guardar" /
  "Cancelar" propios. Se guarda solo esa sección (nueva action `updateEmployeeSection`, validación con el
  sub-schema **en el servidor** y permiso `empleados:employees:update`). Un legajo viejo con un dato faltante en
  Contacto ya no bloquea guardar Trabajo.
- Documentos, Rotación y Ropa cargan aparte (Suspense) para que la ficha abra rápido.

### P4 · Persona nueva (`/people/new`) — cubre §Alta

Una página con las tres secciones de datos apiladas y un indicador de avance a la izquierda ("Datos personales ✓ ·
Contacto · Trabajo"); un solo "Guardar persona" (el alta necesita todo: misma action de hoy). Al guardar abre la
ficha en `#documentos` con aviso "Ahora subí su documentación".

### P5 · Ingresos (`/people/intake`) — cubre `seleccion.md` §Lista

Lista con chips por estado (contador): **Cargando datos** · **Para revisar** · **Descartados** · **Incorporados**
(hoy: En proceso / Pre ingreso / Rechazado / Legajo creado). Botón "Ingreso nuevo".

### P6 · Ficha de ingreso (`/people/intake/X`) — cubre §Detalle candidato

Mismo esqueleto que P3 (resumen a la izquierda, secciones a la derecha). Arriba del resumen, el **recorrido del
ingreso** como pasos (Cargando datos → Para revisar → Incorporado) con la acción siguiente como botón principal:
"Enviar a revisión" · "Incorporar a la nómina" · "Descartar" · "Reabrir". Documentos como checklist (igual que hoy).
Incorporado: link "Ver en la nómina · Legajo N".

### P7 · Rotaciones (`/people/rotations`) — cubre §Diagramas cargados + cargar

Calendario de personas × días (el de hoy) con los filtros arriba y **"Cargar rotación" como panel lateral** sobre el
mismo calendario (hoy es otra solapa): elegís persona, motivo y fechas, el panel muestra duplicados y correctos y al
confirmar el calendario se actualiza sin cambiar de pantalla. Leyenda de colores por motivo.

### P8 · Importar planilla (`/people/rotations/import`) — cubre §Carga masiva

Mismo flujo de 3 pasos, con título "Cargar rotaciones a varias personas" y pasos "Elegir · Revisar choques · Listo".

### P9 · Registro de novedades (`/people/rotations/log`) — cubre §Reportes

La tabla de hoy (con legajo), título "Registro de rotaciones y ausencias".

### Modales

| Modal | Hoy | Nuevo |
|---|---|---|
| Baja | "¿Dar de baja empleado?" (AlertDialog) | **"Registrar egreso de Apellido, Nombre (Legajo N)"**: Motivo de egreso, Fecha de egreso, aviso de lo que pasa (se le corta el acceso al sistema). Botón "Registrar egreso" |
| Activar | "¿Activar empleado?" | "Reincorporar a Apellido, Nombre" · botón "Reincorporar" |
| Rechazar candidato | "Rechazar candidato" | "Descartar ingreso" · motivo · "Descartar" |
| Aprobar y crear legajo (Sheet) | "Aprobar y crear legajo" | "Incorporar a la nómina" · datos de trabajo · "Incorporar" |
| Subir documento del candidato | título = tipo | igual, texto "Subí el documento de la persona." |
| Anular entrega de ropa | "¿Anular la entrega a …?" | se mantiene (ya es propio) |

`TerminationFormFields` es compartido con Usuarios y Flota: se parametrizan los textos (prop), cada módulo pone los
suyos; no cambia para Usuarios/Flota hasta su módulo.

## 3. Textos de estado (glosario aplicado)

Cumplimiento: Completo → **Al día**, Incompleto → **Con faltantes**, Completo con doc vencida → **Con vencidos**,
Avalado/No avalado → **Habilitado/No habilitado**. Son los mismos estados que usa Flota: el cambio de etiqueta va al
mapper compartido y se ve también en Flota (coherente con el glosario).

## 4. Impactos (se hacen en este módulo)

- Rutas nuevas + redirecciones (incluido el mail de vencimientos y `RrhhSectionClient`), links internos (≈15),
  `revalidatePath` (6 archivos), buscador "Ir a…".
- Migración `tabs.name` (Nómina, Egresados, Rotaciones, Ingresos…) por UUID + `permissions-map.ts`.
- Manual: catálogo `empleados.ts`/`seleccion.ts` y los `.mdx` de empleados, selección y procesos.
- Nueva action `updateEmployeeSection` (con permiso y Zod en servidor).

## 5. Decisiones que necesito

1. ¿Aprobás la ficha de una sola página con edición por sección (P3)?
2. Ingresos: ¿te sirven los nombres de estado (Cargando datos / Para revisar / Descartados / Incorporados)?
3. Hallazgo de seguridad: las acciones de Personas no validan permisos en el servidor. ¿Las agrego en este módulo
   (es chico y lo dejo anotado) o va aparte?
