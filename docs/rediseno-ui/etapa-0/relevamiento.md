# Etapa 0.1 — GH y alphataco lado a lado (nivel sistema)

Relevado el 2026-10-10 sobre `../gh_gestion` y la rama `feat/rediseno-ui` (con `main` al día: Almacenes incluido;
Compras vive en `feat/compras-etapa-1`, todavía fuera de main). Columna "¿Igual?": **=** idéntico, **≈** casi igual,
**≠** ya distinto.

## 1. Armazón

| Pieza | GH | alphataco hoy | ¿Igual? |
|---|---|---|---|
| Menú lateral | Lista plana de 10 ítems, logo arriba, ítem activo como "pestaña" naranja, colapsa a iconos, sin drawer en celular | Sidebar shadcn `sidebar-07`, rótulo "Módulos", solapas desplegables por módulo, drawer en celular | ≠ forma, **= contenido** |
| Orden del menú | Dashboard, Empresa, Empleados, Equipos, Comercial, Documentación, Operaciones, Mantenimiento, Formularios, Ayuda | Dashboard, Empleados, Selección, Equipos, Comercial, Documentación, Operaciones, Mantenimiento, Almacenes, Formularios, Ayuda, Configuración | ≈ (solo se movió Empresa→Configuración al final y se sumaron 2) |
| Iconos de módulo | LayoutDashboard, Building2, Users, Truck, Handshake, FileText, Calendar, Wrench, ClipboardList, HelpCircle | Los mismos (CalendarDays en vez de Calendar) | = |
| Encabezado | Hamburguesa, selector de empresa, "Panel", avatar, tema | Trigger, migas "alphataco › Módulo", ayuda contextual "?", tema | ≠ |
| Selector de empresa | Navbar; "Seleccionar compañía", "Buscar compañia", "Compañia actual", "Otras compañias", "Agregar compañía" | Sidebar arriba; **los mismos textos** (con las mismas faltas de tilde) + "Empresa activa" | ≈ |
| Menú de usuario | "Editar perfil" (diálogo "Aquí podrás actualizar tu imagen de perfil"), "Panel" → `/admin/panel` (no existe), "Cerrar Sesión" | Mismo menú, mismos textos, mismo link roto | = |
| Título de página | No hay (solo `<title>`: "Módulo \| Empresa") | `PageHeader` con el nombre de la sección; `<title>` con el mismo formato que GH | ≈ |
| Navegación de 1er nivel | Fila de solapas (`?tab=`) arriba de cada página | Desde el sidebar; sin fila de solapas | ≠ |
| Navegación de 2º/3º nivel | `TabsManager`, pills, `?subtab=` | El mismo `TabsManager`, pills, `?subtab=` | = |
| Buscador global / notificaciones | No hay | No hay | = |

## 2. Rutas

| GH | alphataco | ¿Igual? |
|---|---|---|
| `/dashboard`, `/dashboard/employee`, `/equipment`, `/document`, `/operations`, `/maintenance`, `/forms`, `/help`, `/comercial` | Las mismas | **=** |
| `/dashboard/company/actualCompany` | `/dashboard/configuration` | ≠ |
| — | `/dashboard/recruitment`, `/dashboard/warehouse/*`, `/dashboard/comercial/facturacion/*` | propias |
| Ficha: `/dashboard/employee/action?action=view\|edit\|new&employee_id=` y `/equipment/action?...&type=other` | Idénticas | **=** |
| `/operator/*`, `/clothing/*`, `/maintenance/*` (QR) | Idénticas | **=** |
| `/login`, `/reset_password/*` (+ `/register` en GH) | Iguales sin `/register` | = |

## 3. Módulos y solapas (nombres visibles)

| Módulo | GH | alphataco | ¿Igual? |
|---|---|---|---|
| Dashboard | Principal · Documentación (Empleados, Vehículos) · Estadísticas (Operaciones, RRHH, KPIs, Mantenimiento, Sala de Control) | Igual, sin KPIs (pasó a Configuración) | = |
| Empleados | Empleados (Activos/Inactivos) · Pre Legajos · Documentos de Empleados · Diagramas (Cargados, Cargar, Carga Masiva, Reportes) · Tipos de Documentos · CCT | Empleados (Activos/Inactivos) · Diagramas (mismas 4) | = en lo que quedó |
| Selección | (Pre Legajos dentro de Empleados) | Módulo propio: Candidatos | ≈ |
| Equipos | Equipos (Vehículos, Equipamiento, Dados de Baja) · Documentos de Equipos (Permanentes, Mensuales) · Tipos de Documentos · Mantenimiento | Idéntico | **=** |
| Comercial | Comercial → Clientes, Áreas, Equipos, Sectores, Contratos, Unidades de Medida, Partes Diarios | Clientes, Contratos, Unidades de Medida, Reglas de Precio, Certificaciones, Facturación, Partes Diarios | ≈ |
| Documentación | Docs de Empleados / Equipos / Empresa (Permanentes, Mensuales) · Tipos de Documentos | Igual sin Tipos (pasó a Configuración) | = |
| Operaciones | Gestor de Pedidos · Partes Diarios | Igual | **=** |
| Mantenimiento | Operaciones (Validar Solicitud, Seguimiento) · Vista Taller · Taller (Por Programar, Por Ingresar, En Taller, Aprobaciones) · Nuevo Pedido · Equipos con Desvíos · Gomería (Catálogo, Plantillas, Órdenes, Marcas, Tipos) · Configuración | Igual (Configuración pasó al módulo Configuración) | **=** |
| Almacenes | — | Stock, Movimientos, Préstamos, Pedidos, Materiales, Depósitos, Configuración | propio |
| Formularios | Formularios | Formularios | = |
| Ayuda | Centro de Ayuda (Mis tickets…) | Tickets · Manual de uso | ≈ |
| Empresa / Configuración | General (Empresa, Centro de Costos, Organigrama, Usuarios, Documentación, Mantenimiento) · RRHH (Tipos de Diagramas, Tipos de Novedades, CCT, Tipos de Contrato, Puestos, APT, Artículos) · Equipos (Tipos de Unidad, Marcas, Modelos, Subtipos, Titulares) | Mismas sub-solapas + KPIs, Datos fiscales, Mantenimiento y Documentos como secciones | ≈ |

## 4. Patrones de pantalla

| Patrón | GH | alphataco | ¿Igual? |
|---|---|---|---|
| Lista | Solapas → Card → DataTable con "Buscar…", Filtros, Columnas, Excel, botón de alta naranja a la derecha | PageHeader → Card → DataTable responsive (tarjetas en celular, filtros en panel), mismo set de botones | ≈ (misma anatomía) |
| Textos de alta | "Agregar empleado", "Agregar equipo", "Nuevo equipo", "Registrar Cliente", "Subir documento", "Crear <X>" | Los mismos | **=** |
| Acciones de fila | ⋯ → Ver / Editar; nombre como link a la ficha | Igual | **=** |
| Ficha de empleado | Card: foto + nombre + puesto + email + badge; Volver / ⋯ (Enviar Email, Dar de Baja) / Editar; 6 solapas (Datos Personales, Contacto, Laborales, Documentación, Diagramas, Indumentaria); modo edición global | Idéntica | **=** |
| Ficha de equipo | Foto + dominio + badge de condición; 7 solapas (Datos Básicos, Asignación, Documentos, QR, Historial de Mantenimiento, Checklist, Cubiertas) | Idéntica | **=** |
| Dashboard | 5 KPIs (Empleados, Equipos Activos, Flota Total, Servicios del día, Operatividad) + 4 tarjetas 2×2 | Los mismos 5 + "Equipos sin checklist", mismas 4 tarjetas | **=** |
| Login | Banner con cita de GH + "¡Es un placer verte de nuevo!" + "Iniciar Sesion" | Card centrada, mismo título, mismo botón; la cita de GH sigue en recuperar contraseña | ≈ |
| Paneles de campo | "Panel de Operario", "Sistema de Indumentaria", "Sistema de Checklist y Mantenimiento de Equipos" | Mismos nombres | = |

## 5. Vocabulario compartido (lo que más delata el clon)

Empleados Activos/Inactivos · Pre Legajo · Diagramas Cargados / Cargar Diagrama / Carga Masiva · Documentos
Permanentes/Mensuales · Tipos de Documentos · Documento Multirecurso · Dados de Baja · Equipamiento / Otros Equipos ·
Gestor de Pedidos · Preparte · Partes Diarios · Vista Taller · Por Programar / Por Ingresar / En Taller ·
Bandeja de Aprobaciones · Equipos con Desvíos · Sala de Control · Gomería · Proximos vencimientos · Operatividad ·
Flota Total · Avalado / No avalado · Completo con doc vencida · Afectado / Sin afectar · Dar de Baja / Activar ·
Agregar empleado / Agregar equipo / Registrar Cliente · Editar perfil · Cerrar Sesión · Iniciar Sesion.

## 6. Conclusión

El armazón visual ya se separó de GH (sidebar shadcn, sin navbar, migas, ayuda contextual), pero **todo lo que el
usuario lee y recorre es igual**: nombres y orden de módulos, solapas, rutas, fichas con la misma estructura,
dashboard con los mismos KPIs, textos de botones y estados. La Etapa 0.2 y 0.3 atacan exactamente eso.

## 7. Dónde se cambia cada cosa (para la implementación)

- Menú y migas: `src/features/Layout/sidebar/constants/navigation.ts` (+ `module-icons.ts`).
- Títulos de sección y pestañas: arrays `tabs` de cada `*Component.tsx` / `*TabContent.tsx`.
- Nombres en el editor de permisos: `permissions-map.ts` + migración `UPDATE modules|tabs SET name` por UUID
  (precedente `20260924160000_rename_empresa_module_to_configuracion`).
- Rutas: carpetas de `src/app`, `src/proxy.ts`, links internos, mails, PDFs, QR impresos (`/maintenance/...`),
  manual (`src/content/manual/`, 65 `.mdx` + `catalog/`), `npm run manual:check`, tests Cypress por texto.
- `<title>`: `generateMetadata` de cada `page.tsx`.
