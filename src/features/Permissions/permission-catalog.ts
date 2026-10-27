/**
 * Textos del editor de roles y permisos: qué le habilita al usuario cada pestaña y cada acción.
 *
 * - El NOMBRE de la pestaña vive en `permissions-map.ts` (el seed lo upsertea en `tabs.name`).
 * - La DESCRIPCIÓN vive acá, por `tabId` (no por slug: hay slugs repetidos entre módulos).
 *   El seed la escribe en `tabs.description` y `actions.description`, y
 *   `getModulesWithTabsServer` la mezcla en lo que recibe el editor.
 * - `ACTION_OVERRIDES` reemplaza el nombre o la descripción genérica de una acción en una pestaña
 *   puntual (ej. `compras:ordenes:view_prices` = "Ver importes de las órdenes").
 *
 * Sin `'use client'` y sin imports de servidor: se usa desde el seed (tsx) y desde server actions.
 * Si cambia un nombre o una descripción, la migración de textos tiene que decir lo mismo; si no,
 * el próximo seed y la base quedan distintos.
 */

import type { ActionSlug, ModuleSlug } from './permissions-map';

/** Clave `modulo:tab:accion`, la misma que usan `PermissionGuard` y `checkPermissionServer`. */
export type PermissionOverrideKey = `${ModuleSlug}:${string}:${ActionSlug}`;

export type ActionOverride = { name?: string; description: string };

// ============================================
// ACCIONES (texto genérico)
// ============================================
export const ACTION_DESCRIPTIONS: Record<ActionSlug, string> = {
  view: 'Entrar a la vista y consultar sus datos',
  create: 'Dar de alta registros nuevos',
  update: 'Modificar, activar o desactivar registros existentes',
  delete: 'Borrar o anular registros',
  approve: 'Aprobar o rechazar lo que otros cargaron',
  view_prices: 'Ver precios, costos y totales; sin esto se muestran como "Sin permiso"',
  update_prices: 'Cambiar precios vigentes',
  view_all_requests: 'Ver también lo cargado por otros usuarios',
  view_private: 'Ver documentos marcados como privados',
  upload_private: 'Subir documentos marcados como privados',
  assign_resources: 'Asignar personal y equipos',
  adjust: 'Corregir stock sin comprobante',
  reverse: 'Revertir un movimiento ya registrado',
  direct_exit: 'Sacar stock sin pedido aprobado',
  send: 'Enviar al proveedor por correo o marcar como enviado',
  portal_access: 'Habilitar o deshabilitar el acceso del empleado al portal',
};

// ============================================
// PESTAÑAS (por tabId)
// ============================================
export const TAB_DESCRIPTIONS: Record<string, string> = {
  // ── Dashboard ──────────────────────────────
  '90000000-0000-0000-0000-000000000001': 'Tarjetas del día: personal, equipos y servicios',
  '90000000-0000-0000-0000-000000000002': 'Documentos vencidos y por vencer',
  '90000000-0000-0000-0000-000000000021': 'Documentos del personal vencidos y por vencer',
  '90000000-0000-0000-0000-000000000022': 'Documentos de los equipos vencidos y por vencer',
  '90000000-0000-0000-0000-000000000003': 'Gráficos e indicadores de la operación, el personal y la flota',
  '90000000-0000-0000-0000-000000000031': 'Historial de servicios, ranking de clientes y centros de costo',
  '90000000-0000-0000-0000-000000000032': 'Ausentismo, dotación y su evolución',
  '90000000-0000-0000-0000-000000000033': 'Estado de la flota, solicitudes y tiempos de taller',
  '90000000-0000-0000-0000-000000000034': 'Desvíos de checklist, gestión de órdenes y cumplimiento del planificador',

  // ── Configuración ──────────────────────────
  '10000000-0000-0000-0000-000000000001': 'Datos de la empresa, usuarios, indicadores y estructura interna',
  '10000000-0000-0000-0000-000000000011': 'Razón social, contacto y logo de la empresa',
  '10000000-0000-0000-0000-000000000012': 'Centros de costo a los que se imputan servicios y gastos',
  '10000000-0000-0000-0000-000000000013': 'Sectores de la empresa y de qué sector depende cada uno',
  '10000000-0000-0000-0000-000000000018': 'Cargos de cada sector, a quién reportan y quién es su titular',
  '10000000-0000-0000-0000-000000000014': 'Usuarios del sistema, roles y accesos de sistemas externos',
  '10000000-0000-0000-0000-000000000141': 'Invitar usuarios, cambiar sus datos y darlos de baja',
  '10000000-0000-0000-0000-000000000142': 'Crear roles y definir qué puede hacer cada uno',
  '10000000-0000-0000-0000-000000000143': 'Roles asignados a un usuario y sus permisos propios',
  '10000000-0000-0000-0000-000000000144': 'Credenciales de sistemas externos que consultan datos por API',
  '10000000-0000-0000-0000-000000000004': 'Indicadores de gestión y sus gráficos',
  '10000000-0000-0000-0000-000000000041': 'Definir indicadores, sus metas y su forma de cálculo',
  '10000000-0000-0000-0000-000000000042': 'Gráficos de los indicadores definidos',
  '10000000-0000-0000-0000-000000000015': 'Documentos propios de la empresa',
  '10000000-0000-0000-0000-000000000017': 'Datos fiscales, puntos de venta y credenciales para facturar',
  '10000000-0000-0000-0000-000000000002':
    'Catálogos del personal: diagramas, novedades, convenios, puestos e indumentaria',
  '10000000-0000-0000-0000-000000000021': 'Tipos de diagrama de trabajo (días de trabajo y franco)',
  '10000000-0000-0000-0000-000000000022': 'Tipos de novedad que se cargan en los diagramas (licencias, ausencias)',
  '10000000-0000-0000-0000-000000000023': 'Sindicatos, convenios colectivos y sus categorías',
  '10000000-0000-0000-0000-000000000024': 'Modalidades de contratación del personal',
  '10000000-0000-0000-0000-000000000025': 'Puestos de trabajo de la empresa',
  '10000000-0000-0000-0000-000000000026': 'Aptitudes técnicas que puede acreditar el personal',
  '69c7334c-84a1-4122-a83d-65e279964fcd': 'Catálogo de indumentaria y elementos de protección personal',
  '7d36f2f7-6e56-4d61-b45a-da3ba43aaebe': 'Artículos de indumentaria y EPP que se entregan',
  '309aa503-3fd1-45e7-b666-23ee2bdfda2e': 'Marcas de los artículos de indumentaria',
  '88cf0886-2e20-491d-8c7a-e7b5b12759d7': 'Talles disponibles para la indumentaria',
  'f377cf37-5aef-43a7-a663-3924a33cda02': 'Reportes de entregas de indumentaria',
  '10000000-0000-0000-0000-000000000003': 'Catálogos de la flota: tipos, marcas, modelos y titulares',
  '10000000-0000-0000-0000-000000000031': 'Tipos de equipo de la flota',
  '10000000-0000-0000-0000-000000000032': 'Marcas de los equipos',
  '10000000-0000-0000-0000-000000000033': 'Modelos de cada marca',
  '10000000-0000-0000-0000-000000000034': 'Subtipos de equipo',
  '10000000-0000-0000-0000-000000000035': 'Titulares de los equipos (propios o de terceros)',
  '10000000-0000-0000-0000-000000000016': 'Catálogos del taller: talleres, sectores, reparaciones y grupos',
  '10000000-0000-0000-0000-000000000161': 'Talleres propios y externos',
  '10000000-0000-0000-0000-000000000162': 'Sectores de trabajo dentro de cada taller',
  '60000000-0000-0000-0000-000000000012': 'Tipos de reparación que se piden al taller',
  '60000000-0000-0000-0000-000000000014': 'Grupos que ordenan los tipos de reparación',
  '50000000-0000-0000-0000-000000000004': 'Tipos de documento que se exigen al personal, los equipos y la empresa',
  '60000000-0000-0000-0000-000000000006': 'Tipos de documento que se exigen al personal',
  '60000000-0000-0000-0000-000000000007': 'Tipos de documento que se exigen a los equipos',
  '60000000-0000-0000-0000-000000000018': 'Tipos de documento que se exigen a la empresa',

  // ── Empleados ──────────────────────────────
  '20000000-0000-0000-0000-000000000001': 'Listado del personal y alta de empleados',
  '20000000-0000-0000-0000-000000000011': 'Personal en actividad',
  '20000000-0000-0000-0000-000000000012': 'Personal dado de baja',
  '20000000-0000-0000-0000-000000000003': 'Diagramas de trabajo del personal',
  '20000000-0000-0000-0000-000000000031': 'Diagramas ya cargados, por empleado y período',
  '20000000-0000-0000-0000-000000000032': 'Cargar y corregir el diagrama de un empleado',
  '20000000-0000-0000-0000-000000000033': 'Cargar diagramas de muchos empleados a la vez',
  '20000000-0000-0000-0000-000000000034': 'Reportes de diagramas y novedades',
  '20000000-0000-0000-0000-000000000006': 'Ficha del empleado y edición de sus datos',
  '20000000-0000-0000-0000-000000000061': 'Datos personales del empleado',
  '20000000-0000-0000-0000-000000000062': 'Teléfono, correo y domicilio del empleado',
  '20000000-0000-0000-0000-000000000063': 'Puesto, convenio, categoría y afectaciones del empleado',
  '20000000-0000-0000-0000-000000000065': 'Diagrama de trabajo del empleado',
  '3df67b2a-f5e7-47e0-849b-88698d055863': 'Entregas de indumentaria y EPP al empleado',
  '9bd3625c-4245-4428-b2cf-fec178038f90': 'Acceso del empleado al portal: estado, invitación y bitácora',

  // ── HSE ────────────────────────────────────
  '81aed398-6ca8-47ce-93a2-57fae115c921': 'Normas y procedimientos: alta, versiones, destinatarios y publicación',
  '933d0164-aca5-4ece-83f8-789ee008bf8b': 'Quién aceptó, quién tiene pendiente y quién rechazó cada documento',
  '5120f8e0-e97d-4ce1-be3f-e86b85dd7199': 'Tipos de documento HSE',

  // ── Equipos ────────────────────────────────
  '30000000-0000-0000-0000-000000000001': 'Listado de la flota y alta de equipos',
  '30000000-0000-0000-0000-000000000011': 'Vehículos de la flota',
  '30000000-0000-0000-0000-000000000012': 'Equipamiento que no es vehículo (contenedores, tráileres, herramientas)',
  '30000000-0000-0000-0000-000000000013': 'Equipos dados de baja',
  '30000000-0000-0000-0000-000000000056': 'Checklists respondidos del equipo',
  '30000000-0000-0000-0000-000000000057': 'Cubiertas montadas en el equipo y sus cambios',
  'e8604848-24d4-4f23-a466-700b43b24202': 'Ficha del equipamiento y edición de sus datos',
  'e59f78dc-269c-4280-b5a6-d16076e304a9': 'Datos básicos del equipamiento',
  '5f038bbf-8547-4a4a-b1c7-0e3b1c08ff63': 'A qué cliente está asignado el equipamiento',
  'b635efcb-e558-4709-8037-f5d3f3761c84': 'Documentos del equipamiento',
  'aecb923c-460f-4009-83df-667da0518a82': 'Código QR del equipamiento',
  '30000000-0000-0000-0000-000000000005': 'Ficha del vehículo y edición de sus datos',
  '30000000-0000-0000-0000-000000000051': 'Datos básicos del vehículo',
  '30000000-0000-0000-0000-000000000052': 'A qué cliente está asignado el vehículo',
  '30000000-0000-0000-0000-000000000055': 'Código QR del vehículo',
  '30000000-0000-0000-0000-000000000058': 'Solicitudes y órdenes de mantenimiento del vehículo',

  // ── Operaciones ────────────────────────────
  '70000000-0000-0000-0000-000000000001': 'Planificar los servicios del día siguiente con personal y equipos',
  '70000000-0000-0000-0000-000000000002': 'Partes diarios de operaciones',
  '70000000-0000-0000-0000-000000000003': 'Ficha del parte diario: servicios, personal y equipos',

  // ── Formularios ────────────────────────────
  '80000000-0000-0000-0000-000000000001': 'Formularios y checklists, y sus respuestas',

  // ── Ayuda ──────────────────────────────────
  'a0000000-0000-0000-0000-000000000001': 'Tickets de soporte enviados al equipo del sistema',
  'a0000000-0000-0000-0000-000000000002': 'Manual de uso del sistema',

  // ── Documentación ──────────────────────────
  '50000000-0000-0000-0000-000000000001': 'Documentos del personal y su vigencia',
  '60000000-0000-0000-0000-000000000003': 'Documentos del personal que no se renuevan por mes',
  '60000000-0000-0000-0000-000000000002': 'Documentos del personal que se presentan cada mes',
  '50000000-0000-0000-0000-000000000002': 'Documentos de los equipos y su vigencia',
  '60000000-0000-0000-0000-000000000004': 'Documentos de los equipos que no se renuevan por mes',
  '60000000-0000-0000-0000-000000000005': 'Documentos de los equipos que se presentan cada mes',
  '50000000-0000-0000-0000-000000000003': 'Documentos de la empresa y su vigencia',
  '60000000-0000-0000-0000-000000000016': 'Documentos de la empresa que no se renuevan por mes',
  '60000000-0000-0000-0000-000000000017': 'Documentos de la empresa que se presentan cada mes',
  '50000000-0000-0000-0000-000000000005': 'Ficha de un documento: archivo, vencimiento e historial',
  '60000000-0000-0000-0000-000000000008': 'Ficha de un documento de la empresa',
  '60000000-0000-0000-0000-000000000009': 'Ficha de un documento del personal',
  '60000000-0000-0000-0000-000000000010': 'Datos del documento y sus versiones',

  // ── Mantenimiento ──────────────────────────
  '60000000-0000-0000-0000-000000000071': 'Tablero del taller con los trabajos en curso',
  '60000000-0000-0000-0000-000000000024': 'Pedir un mantenimiento para un equipo',
  '60000000-0000-0000-0000-000000000030': 'Validar solicitudes y seguir los equipos en taller',
  '60000000-0000-0000-0000-000000000015': 'Equipos con desvíos detectados en los checklists',
  '60000000-0000-0000-0000-000000000020': 'Solicitudes de mantenimiento a validar',
  '60000000-0000-0000-0000-000000000023': 'En desuso: no habilita ninguna pantalla',
  '60000000-0000-0000-0000-000000000025': 'En desuso: no habilita ninguna pantalla',
  '60000000-0000-0000-0000-000000000026': 'Equipos que están en el taller y su avance',
  '60000000-0000-0000-0000-000000000040': 'Pedidos, órdenes de trabajo y aprobaciones del taller',
  '60000000-0000-0000-0000-000000000021': 'Pedidos de mantenimiento que recibe el taller',
  '60000000-0000-0000-0000-000000000211': 'Pedidos todavía sin turno en el taller',
  '60000000-0000-0000-0000-000000000212': 'Pedidos con turno confirmado',
  '60000000-0000-0000-0000-000000000043': 'Armar y seguir las órdenes de trabajo',
  '60000000-0000-0000-0000-000000000044': 'Trabajos que esperan aprobación',
  '60000000-0000-0000-0000-000000000045': 'Órdenes de mantenimiento emitidas',
  '60000000-0000-0000-0000-000000000041': 'En desuso: no habilita ninguna pantalla',
  '60000000-0000-0000-0000-000000000070': 'Cubiertas, plantillas por equipo y órdenes de gomería',
  '60000000-0000-0000-0000-000000000061': 'Cubiertas en stock y montadas',
  '60000000-0000-0000-0000-000000000062': 'Disposición de cubiertas por tipo de equipo',
  '60000000-0000-0000-0000-000000000063': 'Órdenes de trabajo de gomería',
  '60000000-0000-0000-0000-000000000064': 'Marcas de cubiertas',
  '60000000-0000-0000-0000-000000000065': 'Tipos y medidas de cubierta',

  // ── Comercial ──────────────────────────────
  '40000000-0000-0000-0000-000000000001': 'Clientes, contratos, certificación y facturación',
  '40000000-0000-0000-0000-000000000011': 'Listado de clientes y alta de clientes',
  '40000000-0000-0000-0000-000000000111': 'Datos del cliente y su edición',
  '40000000-0000-0000-0000-000000000112': 'Personal afectado al cliente',
  '40000000-0000-0000-0000-000000000114': 'Áreas en las que se organiza el cliente',
  '40000000-0000-0000-0000-000000000115': 'Sectores dentro de las áreas del cliente',
  '40000000-0000-0000-0000-000000000113': 'Equipos afectados al cliente',
  '40000000-0000-0000-0000-000000000015': 'Listado de contratos y alta de contratos',
  '40000000-0000-0000-0000-000000000151': 'Datos del contrato y su edición',
  '40000000-0000-0000-0000-000000000152': 'Documentos adjuntos al contrato',
  '40000000-0000-0000-0000-000000000153': 'Ítems que se cotizan y certifican en el contrato',
  '40000000-0000-0000-0000-000000000016': 'Unidades de medida de los ítems de contrato',
  '40000000-0000-0000-0000-000000000154': 'Reglas que actualizan los precios de los contratos',
  '40000000-0000-0000-0000-000000000018': 'Certificaciones de servicios a los clientes',
  '40000000-0000-0000-0000-000000000019': 'Borradores y emisión de facturas electrónicas',
  '40000000-0000-0000-0000-000000000017': 'Líneas de los partes diarios para certificar',

  // ── Selección ──────────────────────────────
  '20000000-0000-0000-0000-000000000007': 'Candidatos en proceso de ingreso y su aprobación',

  // ── Almacenes ──────────────────────────────
  'b0000000-0000-0000-0000-000000000001': 'Saldos por material y depósito',
  'b0000000-0000-0000-0000-000000000002': 'Entradas, salidas, transferencias y ajustes de stock',
  'b0000000-0000-0000-0000-000000000006': 'Herramientas en poder de empleados, equipos o clientes',
  'b0000000-0000-0000-0000-000000000007': 'Pedidos de materiales con aprobación y entregas',
  'b0000000-0000-0000-0000-000000000003': 'Catálogo de materiales',
  'b0000000-0000-0000-0000-000000000004': 'Depósitos de la empresa',
  'b0000000-0000-0000-0000-000000000005': 'Categorías de materiales y unidades de medida',

  // ── Compras ────────────────────────────────
  'c0000000-0000-0000-0000-000000000001': 'Solicitudes de compra y su aprobación',
  'c0000000-0000-0000-0000-000000000004': 'Pedidos de cotización a proveedores',
  'c0000000-0000-0000-0000-000000000005': 'Órdenes de compra, aprobación y envío al proveedor',
  'c0000000-0000-0000-0000-000000000006': 'Recepción de lo comprado y entrada a Almacenes',
  'c0000000-0000-0000-0000-000000000007': 'Facturas, notas de débito y de crédito de proveedores',
  'c0000000-0000-0000-0000-000000000009': 'Vencimientos, órdenes de pago y cuenta corriente de proveedores',
  'c0000000-0000-0000-0000-000000000010': 'Retenciones practicadas, certificados y archivos para declarar',
  'c0000000-0000-0000-0000-000000000008': 'Libro IVA Compras y archivos del Libro IVA Digital',
  'c0000000-0000-0000-0000-000000000002': 'Ficha de proveedores',
  'c0000000-0000-0000-0000-000000000003': 'Rubros, conceptos de gasto, cuentas y cajas, y regímenes de retención',

  // ── Tesorería ──────────────────────────────
  'd0000000-0000-0000-0000-000000000001': 'Saldos de cuentas bancarias y cajas, y su extracto',
  'd0000000-0000-0000-0000-000000000002': 'Movimientos de las cuentas y cajas',
  'd0000000-0000-0000-0000-000000000003': 'Transferencias entre cuentas y cajas',
  'd0000000-0000-0000-0000-000000000004': 'Cuentas, cajas y conceptos de Tesorería',
  'd0000000-0000-0000-0000-000000000005': 'Recibos de clientes, comprobantes a cobrar y cuenta corriente',
  'd0000000-0000-0000-0000-000000000007': 'Cartera de cheques de terceros: depósitos, descuentos y rechazos',
  'd0000000-0000-0000-0000-000000000008': 'Chequeras y cheques emitidos: débitos, rechazos y números inutilizados',
  'd0000000-0000-0000-0000-000000000009': 'Extractos bancarios importados y su conciliación con los movimientos',
  'd0000000-0000-0000-0000-000000000006': 'Retenciones que practicaron los clientes, con su certificado',
};

// ============================================
// ACCIONES PUNTUALES POR PESTAÑA
// ============================================
export const ACTION_OVERRIDES: Partial<Record<PermissionOverrideKey, ActionOverride>> = {
  // Compras
  'compras:solicitudes:view_all_requests': { description: 'Ver también las solicitudes cargadas por otros usuarios' },
  'compras:solicitudes:approve': { description: 'Aprobar o rechazar solicitudes de compra' },
  'compras:solicitudes:view_prices': { description: 'Ver los importes estimados de las solicitudes' },
  'compras:cotizaciones:send': { description: 'Enviar el pedido de cotización al proveedor o marcarlo como enviado' },
  'compras:cotizaciones:view_prices': { description: 'Ver los importes cotizados por los proveedores' },
  'compras:ordenes:approve': { description: 'Aprobar o rechazar órdenes antes de enviarlas' },
  'compras:ordenes:send': { description: 'Enviar la orden al proveedor por correo o marcarla como enviada' },
  'compras:ordenes:view_prices': { description: 'Ver los importes de las órdenes, también en el PDF' },
  'compras:recepciones:view_prices': { description: 'Ver los importes de lo recibido' },
  'compras:pagos:approve': { description: 'Aprobar o rechazar órdenes de pago' },
  'compras:pagos:send': { description: 'Enviar la orden de pago al proveedor o marcarla como enviada' },
  'compras:facturas:approve': { description: 'Aprobar facturas de proveedores para pagarlas' },

  // Tesorería
  'tesoreria:config-tesoreria:create': { description: 'Dar de alta cuentas, cajas y conceptos' },
  'tesoreria:config-tesoreria:update': { description: 'Editar, activar o desactivar cuentas, cajas y conceptos' },
  'tesoreria:config-tesoreria:delete': { description: 'Borrar cuentas, cajas y conceptos' },
  'hse:documentos-hse:approve': {
    name: 'Publicar',
    description: 'Publicar documentos y versiones nuevas (las aceptaciones vuelven a pendiente)',
  },
  'hse:documentos-hse:delete': { name: 'Retirar', description: 'Retirar documentos publicados (quedan archivados)' },

  // Comercial
  'comercial:facturacion:create': { description: 'Armar borradores de factura y notas de crédito o débito' },
  'comercial:facturacion:update': { description: 'Editar borradores y quitarles certificaciones' },
  'comercial:facturacion:delete': { description: 'Descartar borradores de factura' },
  'comercial:facturacion:approve': { name: 'Emitir', description: 'Emitir la factura' },
  'comercial:facturacion:view_prices': { description: 'Ver los importes de las facturas' },
  'comercial:certificaciones:approve': { description: 'Aprobar o rechazar certificaciones' },
  'comercial:certificaciones:view_prices': { description: 'Ver los importes certificados' },
  'comercial:items-contrato:view_prices': { description: 'Ver los precios de los ítems del contrato' },
  'comercial:items-contrato:update_prices': { description: 'Cambiar los precios de los ítems del contrato' },
  'comercial:documentos-contrato:create': { description: 'Subir documentos al contrato' },
  'comercial:documentos-contrato:delete': { description: 'Borrar documentos del contrato' },
  'comercial:mensure_units:delete': { description: 'Borrar unidades de medida' },
  'comercial:daily_reports:update': { description: 'Editar y certificar líneas de partes ejecutados' },

  // Configuración: tipos de documento privados
  'configuracion:tipos-docs-personas:view_private': { description: 'Ver tipos de documento privados' },
  'configuracion:tipos-docs-equipos:view_private': { description: 'Ver tipos de documento privados' },
  'configuracion:tipos-docs-empresa:view_private': { description: 'Ver tipos de documento privados' },

  // Operaciones
  'operaciones:detalle-parte-diario:assign_resources': { description: 'Asignar personal y equipos al parte' },

  // Mantenimiento
  'mantenimiento:maintenance_requests:view_all_requests': {
    description: 'Ver también las solicitudes de equipos que no tiene asignados',
  },

  // Almacenes
  'almacenes:pedidos:view_all_requests': { description: 'Ver también los pedidos cargados por otros usuarios' },
  'almacenes:pedidos:approve': { description: 'Aprobar o rechazar pedidos de materiales' },
  'almacenes:stock:view_prices': { description: 'Ver costos y valorización del stock' },
  'almacenes:movimientos:view_prices': { description: 'Ver los costos de los movimientos' },

  // Selección
  'seleccion:candidatos:approve': { description: 'Aprobar o rechazar candidatos' },
};

// ============================================
// APP MÓVIL
// ============================================
/**
 * Permisos que también aplica la API de la app móvil (`/api/mobile/v1`). Son los MISMOS de la web: un usuario sin
 * uno de estos permisos no puede hacer en la app lo que no puede hacer en la web. La API solo consulta claves de esta
 * lista (su tipo lo exige), y el editor de roles y permisos las marca con la insignia «Móvil». Si la API empieza a
 * usar otra clave, se agrega acá.
 */
export const MOBILE_PERMISSION_KEYS = [
  // Partes diarios (líneas, recursos y estado)
  'operaciones:detalle-parte-diario:view',
  'operaciones:detalle-parte-diario:update',
  'operaciones:detalle-parte-diario:delete',
  'operaciones:detalle-parte-diario:assign_resources',
  // Empleados (solo lectura): listados de activos y bajas, legajo y sus bloques
  'empleados:empleados-activos:view',
  'empleados:empleados-inactivos:view',
  'empleados:employees:view',
  'empleados:datos-personales:view',
  'empleados:datos-contacto:view',
  'empleados:datos-laborales:view',
  'empleados:diagramas-empleado:view',
  'empleados:new:view',
  'empleados:indumentaria_empleado:view',
  // Documentación del legajo
  'documentacion:documentos-de-empleados:view',
  'documentacion:documentos-de-empleados:view_private',
  'documentacion:docs-empleados-permanentes:view',
  'documentacion:docs-empleados-mensuales:view',
] as const satisfies readonly PermissionOverrideKey[];

export type MobilePermissionKey = (typeof MOBILE_PERMISSION_KEYS)[number];

const MOBILE_PERMISSION_SET: ReadonlySet<string> = new Set(MOBILE_PERMISSION_KEYS);

/** `true` si la acción de esa pestaña la usa también la app móvil. */
export function isMobilePermission(moduleSlug: string | null, tabSlug: string, actionSlug: string): boolean {
  if (!moduleSlug) return false;
  return MOBILE_PERMISSION_SET.has(`${moduleSlug}:${tabSlug}:${actionSlug}`);
}

/** `true` si alguna acción de la pestaña la usa la app móvil (para marcar la pestaña en el editor). */
export function isMobileTab(moduleSlug: string | null, tabSlug: string): boolean {
  if (!moduleSlug) return false;
  const prefix = `${moduleSlug}:${tabSlug}:`;
  return MOBILE_PERMISSION_KEYS.some((key) => key.startsWith(prefix));
}

/** Nombre y descripción de una acción en una pestaña: override puntual, si no el genérico. */
export function resolveActionCopy(
  moduleSlug: string,
  tabSlug: string,
  action: { slug: string; name: string; description: string | null }
): { name: string; description: string | null } {
  const override = (ACTION_OVERRIDES as Record<string, ActionOverride | undefined>)[
    `${moduleSlug}:${tabSlug}:${action.slug}`
  ];
  const generic = (ACTION_DESCRIPTIONS as Record<string, string | undefined>)[action.slug];
  return {
    name: override?.name ?? action.name,
    description: override?.description ?? generic ?? action.description,
  };
}
