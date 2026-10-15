-- Nombres y descripciones de pestañas y acciones del editor de roles y permisos.
-- Fuente: src/features/Permissions/permissions-map.ts (nombre de cada tab y de cada acción) y
-- src/features/Permissions/permission-catalog.ts (descripciones). Tienen que coincidir: el seed
-- vuelve a escribir estos textos desde esos archivos.
-- Solo textos: no cambia ningún id ni slug, ni ningún permiso asignado. Idempotente.

-- Pestañas (por id)

-- Dashboard
UPDATE tabs SET name = 'Resumen', description = 'Tarjetas del día: personal, equipos y servicios' WHERE id = '90000000-0000-0000-0000-000000000001';
UPDATE tabs SET name = 'Vencimientos', description = 'Documentos vencidos y por vencer' WHERE id = '90000000-0000-0000-0000-000000000002';
UPDATE tabs SET name = 'Vencimientos de personal', description = 'Documentos del personal vencidos y por vencer' WHERE id = '90000000-0000-0000-0000-000000000021';
UPDATE tabs SET name = 'Vencimientos de equipos', description = 'Documentos de los equipos vencidos y por vencer' WHERE id = '90000000-0000-0000-0000-000000000022';
UPDATE tabs SET name = 'Análisis', description = 'Gráficos e indicadores de la operación, el personal y la flota' WHERE id = '90000000-0000-0000-0000-000000000003';
UPDATE tabs SET name = 'Operación', description = 'Historial de servicios, ranking de clientes y centros de costo' WHERE id = '90000000-0000-0000-0000-000000000031';
UPDATE tabs SET name = 'Personal', description = 'Ausentismo, dotación y su evolución' WHERE id = '90000000-0000-0000-0000-000000000032';
UPDATE tabs SET name = 'Flota y taller', description = 'Estado de la flota, solicitudes y tiempos de taller' WHERE id = '90000000-0000-0000-0000-000000000033';
UPDATE tabs SET name = 'Control de desvíos', description = 'Desvíos de checklist, gestión de órdenes y cumplimiento del planificador' WHERE id = '90000000-0000-0000-0000-000000000034';

-- Configuración
UPDATE tabs SET name = 'Organización', description = 'Datos de la empresa, usuarios, indicadores y estructura interna' WHERE id = '10000000-0000-0000-0000-000000000001';
UPDATE tabs SET name = 'Datos de la empresa', description = 'Razón social, contacto y logo de la empresa' WHERE id = '10000000-0000-0000-0000-000000000011';
UPDATE tabs SET name = 'Centros de costo', description = 'Centros de costo a los que se imputan servicios y gastos' WHERE id = '10000000-0000-0000-0000-000000000012';
UPDATE tabs SET name = 'Organigrama', description = 'Jerarquía interna de la empresa' WHERE id = '10000000-0000-0000-0000-000000000013';
UPDATE tabs SET name = 'Usuarios y accesos', description = 'Usuarios del sistema, roles y accesos de sistemas externos' WHERE id = '10000000-0000-0000-0000-000000000014';
UPDATE tabs SET name = 'Usuarios', description = 'Invitar usuarios, cambiar sus datos y darlos de baja' WHERE id = '10000000-0000-0000-0000-000000000141';
UPDATE tabs SET name = 'Roles y permisos', description = 'Crear roles y definir qué puede hacer cada uno' WHERE id = '10000000-0000-0000-0000-000000000142';
UPDATE tabs SET name = 'Ficha y permisos del usuario', description = 'Roles asignados a un usuario y sus permisos propios' WHERE id = '10000000-0000-0000-0000-000000000143';
UPDATE tabs SET name = 'Accesos externos', description = 'Credenciales de sistemas externos que consultan datos por API' WHERE id = '10000000-0000-0000-0000-000000000144';
UPDATE tabs SET name = 'Indicadores (KPIs)', description = 'Indicadores de gestión y sus gráficos' WHERE id = '10000000-0000-0000-0000-000000000004';
UPDATE tabs SET name = 'Indicadores', description = 'Definir indicadores, sus metas y su forma de cálculo' WHERE id = '10000000-0000-0000-0000-000000000041';
UPDATE tabs SET name = 'Gráficos', description = 'Gráficos de los indicadores definidos' WHERE id = '10000000-0000-0000-0000-000000000042';
UPDATE tabs SET name = 'Documentos de la empresa', description = 'Documentos propios de la empresa' WHERE id = '10000000-0000-0000-0000-000000000015';
UPDATE tabs SET name = 'Datos fiscales', description = 'Datos fiscales, puntos de venta y credenciales para facturar' WHERE id = '10000000-0000-0000-0000-000000000017';
UPDATE tabs SET name = 'Personal', description = 'Catálogos del personal: diagramas, novedades, convenios, puestos e indumentaria' WHERE id = '10000000-0000-0000-0000-000000000002';
UPDATE tabs SET name = 'Tipos de diagrama', description = 'Tipos de diagrama de trabajo (días de trabajo y franco)' WHERE id = '10000000-0000-0000-0000-000000000021';
UPDATE tabs SET name = 'Tipos de novedad', description = 'Tipos de novedad que se cargan en los diagramas (licencias, ausencias)' WHERE id = '10000000-0000-0000-0000-000000000022';
UPDATE tabs SET name = 'Convenios colectivos', description = 'Sindicatos, convenios colectivos y sus categorías' WHERE id = '10000000-0000-0000-0000-000000000023';
UPDATE tabs SET name = 'Tipos de contrato', description = 'Modalidades de contratación del personal' WHERE id = '10000000-0000-0000-0000-000000000024';
UPDATE tabs SET name = 'Puestos', description = 'Puestos de trabajo de la empresa' WHERE id = '10000000-0000-0000-0000-000000000025';
UPDATE tabs SET name = 'Aptitudes técnicas', description = 'Aptitudes técnicas que puede acreditar el personal' WHERE id = '10000000-0000-0000-0000-000000000026';
UPDATE tabs SET name = 'Indumentaria y EPP', description = 'Catálogo de indumentaria y elementos de protección personal' WHERE id = '69c7334c-84a1-4122-a83d-65e279964fcd';
UPDATE tabs SET name = 'Artículos', description = 'Artículos de indumentaria y EPP que se entregan' WHERE id = '7d36f2f7-6e56-4d61-b45a-da3ba43aaebe';
UPDATE tabs SET name = 'Marcas', description = 'Marcas de los artículos de indumentaria' WHERE id = '309aa503-3fd1-45e7-b666-23ee2bdfda2e';
UPDATE tabs SET name = 'Talles', description = 'Talles disponibles para la indumentaria' WHERE id = '88cf0886-2e20-491d-8c7a-e7b5b12759d7';
UPDATE tabs SET name = 'Reportes', description = 'Reportes de entregas de indumentaria' WHERE id = 'f377cf37-5aef-43a7-a663-3924a33cda02';
UPDATE tabs SET name = 'Flota', description = 'Catálogos de la flota: tipos, marcas, modelos y titulares' WHERE id = '10000000-0000-0000-0000-000000000003';
UPDATE tabs SET name = 'Tipos de equipo', description = 'Tipos de equipo de la flota' WHERE id = '10000000-0000-0000-0000-000000000031';
UPDATE tabs SET name = 'Marcas', description = 'Marcas de los equipos' WHERE id = '10000000-0000-0000-0000-000000000032';
UPDATE tabs SET name = 'Modelos', description = 'Modelos de cada marca' WHERE id = '10000000-0000-0000-0000-000000000033';
UPDATE tabs SET name = 'Subtipos', description = 'Subtipos de equipo' WHERE id = '10000000-0000-0000-0000-000000000034';
UPDATE tabs SET name = 'Titulares', description = 'Titulares de los equipos (propios o de terceros)' WHERE id = '10000000-0000-0000-0000-000000000035';
UPDATE tabs SET name = 'Taller', description = 'Catálogos del taller: talleres, sectores, reparaciones y grupos' WHERE id = '10000000-0000-0000-0000-000000000016';
UPDATE tabs SET name = 'Talleres', description = 'Talleres propios y externos' WHERE id = '10000000-0000-0000-0000-000000000161';
UPDATE tabs SET name = 'Sectores de taller', description = 'Sectores de trabajo dentro de cada taller' WHERE id = '10000000-0000-0000-0000-000000000162';
UPDATE tabs SET name = 'Tipos de reparación', description = 'Tipos de reparación que se piden al taller' WHERE id = '60000000-0000-0000-0000-000000000012';
UPDATE tabs SET name = 'Grupos de mantenimiento', description = 'Grupos que ordenan los tipos de reparación' WHERE id = '60000000-0000-0000-0000-000000000014';
UPDATE tabs SET name = 'Tipos de documento', description = 'Tipos de documento que se exigen al personal, los equipos y la empresa' WHERE id = '50000000-0000-0000-0000-000000000004';
UPDATE tabs SET name = 'De personal', description = 'Tipos de documento que se exigen al personal' WHERE id = '60000000-0000-0000-0000-000000000006';
UPDATE tabs SET name = 'De equipos', description = 'Tipos de documento que se exigen a los equipos' WHERE id = '60000000-0000-0000-0000-000000000007';
UPDATE tabs SET name = 'De la empresa', description = 'Tipos de documento que se exigen a la empresa' WHERE id = '60000000-0000-0000-0000-000000000018';

-- Empleados
UPDATE tabs SET name = 'Empleados', description = 'Listado del personal y alta de empleados' WHERE id = '20000000-0000-0000-0000-000000000001';
UPDATE tabs SET name = 'Empleados activos', description = 'Personal en actividad' WHERE id = '20000000-0000-0000-0000-000000000011';
UPDATE tabs SET name = 'Empleados inactivos', description = 'Personal dado de baja' WHERE id = '20000000-0000-0000-0000-000000000012';
UPDATE tabs SET name = 'Diagramas', description = 'Diagramas de trabajo del personal' WHERE id = '20000000-0000-0000-0000-000000000003';
UPDATE tabs SET name = 'Diagramas cargados', description = 'Diagramas ya cargados, por empleado y período' WHERE id = '20000000-0000-0000-0000-000000000031';
UPDATE tabs SET name = 'Cargar diagramas', description = 'Cargar y corregir el diagrama de un empleado' WHERE id = '20000000-0000-0000-0000-000000000032';
UPDATE tabs SET name = 'Carga masiva', description = 'Cargar diagramas de muchos empleados a la vez' WHERE id = '20000000-0000-0000-0000-000000000033';
UPDATE tabs SET name = 'Reportes', description = 'Reportes de diagramas y novedades' WHERE id = '20000000-0000-0000-0000-000000000034';
UPDATE tabs SET name = 'Detalle de empleado', description = 'Ficha del empleado y edición de sus datos' WHERE id = '20000000-0000-0000-0000-000000000006';
UPDATE tabs SET name = 'Datos personales', description = 'Datos personales del empleado' WHERE id = '20000000-0000-0000-0000-000000000061';
UPDATE tabs SET name = 'Datos de contacto', description = 'Teléfono, correo y domicilio del empleado' WHERE id = '20000000-0000-0000-0000-000000000062';
UPDATE tabs SET name = 'Datos laborales', description = 'Puesto, convenio, categoría y afectaciones del empleado' WHERE id = '20000000-0000-0000-0000-000000000063';
UPDATE tabs SET name = 'Diagramas', description = 'Diagrama de trabajo del empleado' WHERE id = '20000000-0000-0000-0000-000000000065';
UPDATE tabs SET name = 'Indumentaria', description = 'Entregas de indumentaria y EPP al empleado' WHERE id = '3df67b2a-f5e7-47e0-849b-88698d055863';

-- Equipos
UPDATE tabs SET name = 'Equipos', description = 'Listado de la flota y alta de equipos' WHERE id = '30000000-0000-0000-0000-000000000001';
UPDATE tabs SET name = 'Vehículos', description = 'Vehículos de la flota' WHERE id = '30000000-0000-0000-0000-000000000011';
UPDATE tabs SET name = 'Equipamiento', description = 'Equipamiento que no es vehículo (contenedores, tráileres, herramientas)' WHERE id = '30000000-0000-0000-0000-000000000012';
UPDATE tabs SET name = 'Dados de baja', description = 'Equipos dados de baja' WHERE id = '30000000-0000-0000-0000-000000000013';
UPDATE tabs SET name = 'Checklist', description = 'Checklists respondidos del equipo' WHERE id = '30000000-0000-0000-0000-000000000056';
UPDATE tabs SET name = 'Cubiertas', description = 'Cubiertas montadas en el equipo y sus cambios' WHERE id = '30000000-0000-0000-0000-000000000057';
UPDATE tabs SET name = 'Detalle de otro equipo', description = 'Ficha del equipamiento y edición de sus datos' WHERE id = 'e8604848-24d4-4f23-a466-700b43b24202';
UPDATE tabs SET name = 'Datos básicos', description = 'Datos básicos del equipamiento' WHERE id = 'e59f78dc-269c-4280-b5a6-d16076e304a9';
UPDATE tabs SET name = 'Asignación', description = 'A qué cliente está asignado el equipamiento' WHERE id = '5f038bbf-8547-4a4a-b1c7-0e3b1c08ff63';
UPDATE tabs SET name = 'Documentos', description = 'Documentos del equipamiento' WHERE id = 'b635efcb-e558-4709-8037-f5d3f3761c84';
UPDATE tabs SET name = 'QR', description = 'Código QR del equipamiento' WHERE id = 'aecb923c-460f-4009-83df-667da0518a82';
UPDATE tabs SET name = 'Detalle de equipo', description = 'Ficha del vehículo y edición de sus datos' WHERE id = '30000000-0000-0000-0000-000000000005';
UPDATE tabs SET name = 'Datos básicos', description = 'Datos básicos del vehículo' WHERE id = '30000000-0000-0000-0000-000000000051';
UPDATE tabs SET name = 'Asignación', description = 'A qué cliente está asignado el vehículo' WHERE id = '30000000-0000-0000-0000-000000000052';
UPDATE tabs SET name = 'QR', description = 'Código QR del vehículo' WHERE id = '30000000-0000-0000-0000-000000000055';
UPDATE tabs SET name = 'Historial de mantenimiento', description = 'Solicitudes y órdenes de mantenimiento del vehículo' WHERE id = '30000000-0000-0000-0000-000000000058';

-- Operaciones
UPDATE tabs SET name = 'Planificador', description = 'Planificar los servicios del día siguiente con personal y equipos' WHERE id = '70000000-0000-0000-0000-000000000001';
UPDATE tabs SET name = 'Partes de operaciones', description = 'Partes diarios de operaciones' WHERE id = '70000000-0000-0000-0000-000000000002';
UPDATE tabs SET name = 'Detalle de parte diario', description = 'Ficha del parte diario: servicios, personal y equipos' WHERE id = '70000000-0000-0000-0000-000000000003';

-- Formularios
UPDATE tabs SET name = 'Formularios', description = 'Formularios y checklists, y sus respuestas' WHERE id = '80000000-0000-0000-0000-000000000001';

-- Ayuda
UPDATE tabs SET name = 'Tickets de soporte', description = 'Tickets de soporte enviados al equipo del sistema' WHERE id = 'a0000000-0000-0000-0000-000000000001';
UPDATE tabs SET name = 'Manual de uso', description = 'Manual de uso del sistema' WHERE id = 'a0000000-0000-0000-0000-000000000002';

-- Documentación
UPDATE tabs SET name = 'Documentos de empleados', description = 'Documentos del personal y su vigencia' WHERE id = '50000000-0000-0000-0000-000000000001';
UPDATE tabs SET name = 'Permanentes', description = 'Documentos del personal que no se renuevan por mes' WHERE id = '60000000-0000-0000-0000-000000000003';
UPDATE tabs SET name = 'Mensuales', description = 'Documentos del personal que se presentan cada mes' WHERE id = '60000000-0000-0000-0000-000000000002';
UPDATE tabs SET name = 'Documentos de equipos', description = 'Documentos de los equipos y su vigencia' WHERE id = '50000000-0000-0000-0000-000000000002';
UPDATE tabs SET name = 'Permanentes', description = 'Documentos de los equipos que no se renuevan por mes' WHERE id = '60000000-0000-0000-0000-000000000004';
UPDATE tabs SET name = 'Mensuales', description = 'Documentos de los equipos que se presentan cada mes' WHERE id = '60000000-0000-0000-0000-000000000005';
UPDATE tabs SET name = 'Documentos de empresa', description = 'Documentos de la empresa y su vigencia' WHERE id = '50000000-0000-0000-0000-000000000003';
UPDATE tabs SET name = 'Permanentes', description = 'Documentos de la empresa que no se renuevan por mes' WHERE id = '60000000-0000-0000-0000-000000000016';
UPDATE tabs SET name = 'Mensuales', description = 'Documentos de la empresa que se presentan cada mes' WHERE id = '60000000-0000-0000-0000-000000000017';
UPDATE tabs SET name = 'Detalle de documento', description = 'Ficha de un documento: archivo, vencimiento e historial' WHERE id = '50000000-0000-0000-0000-000000000005';
UPDATE tabs SET name = 'Empresa', description = 'Ficha de un documento de la empresa' WHERE id = '60000000-0000-0000-0000-000000000008';
UPDATE tabs SET name = 'Empleado', description = 'Ficha de un documento del personal' WHERE id = '60000000-0000-0000-0000-000000000009';
UPDATE tabs SET name = 'Documento', description = 'Datos del documento y sus versiones' WHERE id = '60000000-0000-0000-0000-000000000010';

-- Mantenimiento
UPDATE tabs SET name = 'Vista taller', description = 'Tablero del taller con los trabajos en curso' WHERE id = '60000000-0000-0000-0000-000000000071';
UPDATE tabs SET name = 'Nuevo pedido', description = 'Pedir un mantenimiento para un equipo' WHERE id = '60000000-0000-0000-0000-000000000024';
UPDATE tabs SET name = 'Supervisión', description = 'Validar solicitudes y seguir los equipos en taller' WHERE id = '60000000-0000-0000-0000-000000000030';
UPDATE tabs SET name = 'Equipos con desvíos', description = 'Equipos con desvíos detectados en los checklists' WHERE id = '60000000-0000-0000-0000-000000000015';
UPDATE tabs SET name = 'Solicitudes de mantenimiento', description = 'Solicitudes de mantenimiento a validar' WHERE id = '60000000-0000-0000-0000-000000000020';
UPDATE tabs SET name = 'Pendientes de ejecutar (en desuso)', description = 'En desuso: no habilita ninguna pantalla' WHERE id = '60000000-0000-0000-0000-000000000023';
UPDATE tabs SET name = 'Para taller (en desuso)', description = 'En desuso: no habilita ninguna pantalla' WHERE id = '60000000-0000-0000-0000-000000000025';
UPDATE tabs SET name = 'Seguimiento en taller', description = 'Equipos que están en el taller y su avance' WHERE id = '60000000-0000-0000-0000-000000000026';
UPDATE tabs SET name = 'Taller', description = 'Pedidos, órdenes de trabajo y aprobaciones del taller' WHERE id = '60000000-0000-0000-0000-000000000040';
UPDATE tabs SET name = 'Pedidos de mantenimiento', description = 'Pedidos de mantenimiento que recibe el taller' WHERE id = '60000000-0000-0000-0000-000000000021';
UPDATE tabs SET name = 'Pendientes', description = 'Pedidos todavía sin turno en el taller' WHERE id = '60000000-0000-0000-0000-000000000211';
UPDATE tabs SET name = 'Confirmados', description = 'Pedidos con turno confirmado' WHERE id = '60000000-0000-0000-0000-000000000212';
UPDATE tabs SET name = 'Gestión de órdenes', description = 'Armar y seguir las órdenes de trabajo' WHERE id = '60000000-0000-0000-0000-000000000043';
UPDATE tabs SET name = 'Bandeja de aprobaciones', description = 'Trabajos que esperan aprobación' WHERE id = '60000000-0000-0000-0000-000000000044';
UPDATE tabs SET name = 'Órdenes de mantenimiento', description = 'Órdenes de mantenimiento emitidas' WHERE id = '60000000-0000-0000-0000-000000000045';
UPDATE tabs SET name = 'Planificación (en desuso)', description = 'En desuso: no habilita ninguna pantalla' WHERE id = '60000000-0000-0000-0000-000000000041';
UPDATE tabs SET name = 'Gomería', description = 'Cubiertas, plantillas por equipo y órdenes de gomería' WHERE id = '60000000-0000-0000-0000-000000000070';
UPDATE tabs SET name = 'Catálogo de cubiertas', description = 'Cubiertas en stock y montadas' WHERE id = '60000000-0000-0000-0000-000000000061';
UPDATE tabs SET name = 'Plantillas de cubiertas', description = 'Disposición de cubiertas por tipo de equipo' WHERE id = '60000000-0000-0000-0000-000000000062';
UPDATE tabs SET name = 'Órdenes de gomería', description = 'Órdenes de trabajo de gomería' WHERE id = '60000000-0000-0000-0000-000000000063';
UPDATE tabs SET name = 'Marcas de cubiertas', description = 'Marcas de cubiertas' WHERE id = '60000000-0000-0000-0000-000000000064';
UPDATE tabs SET name = 'Tipos de Cubierta', description = 'Tipos y medidas de cubierta' WHERE id = '60000000-0000-0000-0000-000000000065';

-- Comercial
UPDATE tabs SET name = 'Gestión comercial', description = 'Clientes, contratos, certificación y facturación' WHERE id = '40000000-0000-0000-0000-000000000001';
UPDATE tabs SET name = 'Clientes', description = 'Listado de clientes y alta de clientes' WHERE id = '40000000-0000-0000-0000-000000000011';
UPDATE tabs SET name = 'Ficha del cliente', description = 'Datos del cliente y su edición' WHERE id = '40000000-0000-0000-0000-000000000111';
UPDATE tabs SET name = 'Empleados', description = 'Personal afectado al cliente' WHERE id = '40000000-0000-0000-0000-000000000112';
UPDATE tabs SET name = 'Áreas del cliente', description = 'Áreas en las que se organiza el cliente' WHERE id = '40000000-0000-0000-0000-000000000114';
UPDATE tabs SET name = 'Sectores del cliente', description = 'Sectores dentro de las áreas del cliente' WHERE id = '40000000-0000-0000-0000-000000000115';
UPDATE tabs SET name = 'Equipos', description = 'Equipos afectados al cliente' WHERE id = '40000000-0000-0000-0000-000000000113';
UPDATE tabs SET name = 'Contratos', description = 'Listado de contratos y alta de contratos' WHERE id = '40000000-0000-0000-0000-000000000015';
UPDATE tabs SET name = 'Ficha del contrato', description = 'Datos del contrato y su edición' WHERE id = '40000000-0000-0000-0000-000000000151';
UPDATE tabs SET name = 'Documentos', description = 'Documentos adjuntos al contrato' WHERE id = '40000000-0000-0000-0000-000000000152';
UPDATE tabs SET name = 'Ítems del contrato', description = 'Ítems que se cotizan y certifican en el contrato' WHERE id = '40000000-0000-0000-0000-000000000153';
UPDATE tabs SET name = 'Unidades de medida', description = 'Unidades de medida de los ítems de contrato' WHERE id = '40000000-0000-0000-0000-000000000016';
UPDATE tabs SET name = 'Reglas de precio', description = 'Reglas que actualizan los precios de los contratos' WHERE id = '40000000-0000-0000-0000-000000000154';
UPDATE tabs SET name = 'Certificaciones', description = 'Certificaciones de servicios a los clientes' WHERE id = '40000000-0000-0000-0000-000000000018';
UPDATE tabs SET name = 'Facturación', description = 'Borradores y emisión de facturas electrónicas' WHERE id = '40000000-0000-0000-0000-000000000019';
UPDATE tabs SET name = 'Partes diarios', description = 'Líneas de los partes diarios para certificar' WHERE id = '40000000-0000-0000-0000-000000000017';

-- Selección
UPDATE tabs SET name = 'Candidatos', description = 'Candidatos en proceso de ingreso y su aprobación' WHERE id = '20000000-0000-0000-0000-000000000007';

-- Almacenes
UPDATE tabs SET name = 'Stock', description = 'Saldos por material y depósito' WHERE id = 'b0000000-0000-0000-0000-000000000001';
UPDATE tabs SET name = 'Movimientos', description = 'Entradas, salidas, transferencias y ajustes de stock' WHERE id = 'b0000000-0000-0000-0000-000000000002';
UPDATE tabs SET name = 'Préstamos', description = 'Herramientas en poder de empleados, equipos o clientes' WHERE id = 'b0000000-0000-0000-0000-000000000006';
UPDATE tabs SET name = 'Pedidos', description = 'Pedidos de materiales con aprobación y entregas' WHERE id = 'b0000000-0000-0000-0000-000000000007';
UPDATE tabs SET name = 'Materiales', description = 'Catálogo de materiales' WHERE id = 'b0000000-0000-0000-0000-000000000003';
UPDATE tabs SET name = 'Depósitos', description = 'Depósitos de la empresa' WHERE id = 'b0000000-0000-0000-0000-000000000004';
UPDATE tabs SET name = 'Configuración', description = 'Categorías de materiales y unidades de medida' WHERE id = 'b0000000-0000-0000-0000-000000000005';

-- Compras
UPDATE tabs SET name = 'Solicitudes', description = 'Solicitudes de compra y su aprobación' WHERE id = 'c0000000-0000-0000-0000-000000000001';
UPDATE tabs SET name = 'Cotizaciones', description = 'Pedidos de cotización a proveedores' WHERE id = 'c0000000-0000-0000-0000-000000000004';
UPDATE tabs SET name = 'Órdenes de compra', description = 'Órdenes de compra, aprobación y envío al proveedor' WHERE id = 'c0000000-0000-0000-0000-000000000005';
UPDATE tabs SET name = 'Recepciones', description = 'Recepción de lo comprado y entrada a Almacenes' WHERE id = 'c0000000-0000-0000-0000-000000000006';
UPDATE tabs SET name = 'Facturas', description = 'Facturas, notas de débito y de crédito de proveedores' WHERE id = 'c0000000-0000-0000-0000-000000000007';
UPDATE tabs SET name = 'Pagos', description = 'Vencimientos, órdenes de pago y cuenta corriente de proveedores' WHERE id = 'c0000000-0000-0000-0000-000000000009';
UPDATE tabs SET name = 'Retenciones', description = 'Retenciones practicadas, certificados y archivos para declarar' WHERE id = 'c0000000-0000-0000-0000-000000000010';
UPDATE tabs SET name = 'Libro IVA', description = 'Libro IVA Compras y archivos del Libro IVA Digital' WHERE id = 'c0000000-0000-0000-0000-000000000008';
UPDATE tabs SET name = 'Proveedores', description = 'Ficha de proveedores' WHERE id = 'c0000000-0000-0000-0000-000000000002';
UPDATE tabs SET name = 'Configuración', description = 'Rubros, conceptos de gasto, cuentas y cajas, y regímenes de retención' WHERE id = 'c0000000-0000-0000-0000-000000000003';

-- Tesorería
UPDATE tabs SET name = 'Cuentas', description = 'Saldos de cuentas bancarias y cajas, y su extracto' WHERE id = 'd0000000-0000-0000-0000-000000000001';
UPDATE tabs SET name = 'Movimientos', description = 'Movimientos de las cuentas y cajas' WHERE id = 'd0000000-0000-0000-0000-000000000002';
UPDATE tabs SET name = 'Transferencias', description = 'Transferencias entre cuentas y cajas' WHERE id = 'd0000000-0000-0000-0000-000000000003';
UPDATE tabs SET name = 'Configuración', description = 'Cuentas, cajas y conceptos de Tesorería' WHERE id = 'd0000000-0000-0000-0000-000000000004';
UPDATE tabs SET name = 'Cobranzas', description = 'Recibos de clientes, comprobantes a cobrar y cuenta corriente' WHERE id = 'd0000000-0000-0000-0000-000000000005';
UPDATE tabs SET name = 'Cheques', description = 'Cartera de cheques de terceros: depósitos, descuentos y rechazos' WHERE id = 'd0000000-0000-0000-0000-000000000007';
UPDATE tabs SET name = 'Cheques propios', description = 'Chequeras y cheques emitidos: débitos, rechazos y números inutilizados' WHERE id = 'd0000000-0000-0000-0000-000000000008';
UPDATE tabs SET name = 'Conciliación', description = 'Extractos bancarios importados y su conciliación con los movimientos' WHERE id = 'd0000000-0000-0000-0000-000000000009';
UPDATE tabs SET name = 'Retenciones sufridas', description = 'Retenciones que practicaron los clientes, con su certificado' WHERE id = 'd0000000-0000-0000-0000-000000000006';

-- Acciones (por slug)
UPDATE actions SET name = 'Ver', description = 'Entrar a la vista y consultar sus datos' WHERE slug = 'view';
UPDATE actions SET name = 'Crear', description = 'Dar de alta registros nuevos' WHERE slug = 'create';
UPDATE actions SET name = 'Editar', description = 'Modificar, activar o desactivar registros existentes' WHERE slug = 'update';
UPDATE actions SET name = 'Eliminar', description = 'Borrar o anular registros' WHERE slug = 'delete';
UPDATE actions SET name = 'Ver las de todos', description = 'Ver también lo cargado por otros usuarios' WHERE slug = 'view_all_requests';
UPDATE actions SET name = 'Ver privados', description = 'Ver documentos marcados como privados' WHERE slug = 'view_private';
UPDATE actions SET name = 'Subir privados', description = 'Subir documentos marcados como privados' WHERE slug = 'upload_private';
UPDATE actions SET name = 'Asignar recursos', description = 'Asignar personal y equipos' WHERE slug = 'assign_resources';
UPDATE actions SET name = 'Aprobar', description = 'Aprobar o rechazar lo que otros cargaron' WHERE slug = 'approve';
UPDATE actions SET name = 'Ver importes', description = 'Ver precios, costos y totales; sin esto se muestran como "Sin permiso"' WHERE slug = 'view_prices';
UPDATE actions SET name = 'Modificar precios', description = 'Cambiar precios vigentes' WHERE slug = 'update_prices';
UPDATE actions SET name = 'Ajustar stock', description = 'Corregir stock sin comprobante' WHERE slug = 'adjust';
UPDATE actions SET name = 'Anular movimiento', description = 'Revertir un movimiento ya registrado' WHERE slug = 'reverse';
UPDATE actions SET name = 'Salida directa', description = 'Sacar stock sin pedido aprobado' WHERE slug = 'direct_exit';
UPDATE actions SET name = 'Enviar', description = 'Enviar al proveedor por correo o marcar como enviado' WHERE slug = 'send';
