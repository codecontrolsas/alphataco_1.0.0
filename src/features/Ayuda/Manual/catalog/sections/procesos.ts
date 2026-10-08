import { defineSection } from '../define.ts';

/**
 * Guías de proceso: recorren un circuito completo entre módulos. Son generales (sin `access`)
 * y no documentan pantallas propias (sin `screens`): enlazan a las guías de cada pantalla.
 */
export const procesosSection = defineSection({
  key: 'procesos',
  title: 'Procesos de punta a punta',
  description: 'Cómo se conectan los módulos: qué pasa en uno cuando hacés algo en otro.',
  icon: 'process',
  guides: [
    {
      slug: 'documentos-alertas-y-estado',
      related: [
        'tipos-de-documento',
        'documentos-de-empleados',
        'documentos-de-equipos',
        'detalle-de-documento',
        'dashboard-vencimientos',
        'altas-y-bajas',
      ],
    },
    {
      slug: 'del-pedido-a-la-factura',
      related: [
        'gestor-de-pedidos',
        'partes-diarios',
        'detalle-del-parte',
        'partes-diarios-comercial',
        'certificaciones',
        'facturacion',
        'contratos',
        'reglas-de-precio',
      ],
    },
    {
      slug: 'del-checklist-al-taller',
      related: [
        'formularios',
        'qr-del-equipo',
        'equipos-con-desvios',
        'nuevo-pedido-de-mantenimiento',
        'validar-solicitudes',
        'taller',
        'vista-taller',
        'gomeria',
        'pedidos-de-materiales',
      ],
    },
    {
      slug: 'circuito-de-materiales',
      related: [
        'almacenes',
        'movimientos-de-stock',
        'pedidos-de-materiales',
        'prestamos-de-herramientas',
        'entrega-de-indumentaria',
        'gomeria',
        'taller',
      ],
    },
    {
      slug: 'diagramas-afectaciones-y-desvios',
      related: ['diagramas', 'clientes', 'detalle-del-parte', 'dashboard-estadisticas', 'kpis', 'del-checklist-al-taller'],
    },
    {
      slug: 'de-candidato-a-legajo',
      related: ['candidatos', 'ficha-del-empleado', 'tipos-de-documento', 'documentos-alertas-y-estado'],
    },
    {
      slug: 'altas-y-bajas',
      related: [
        'empleados-listado',
        'ficha-del-empleado',
        'equipos-listado',
        'equipos-dados-de-baja',
        'usuarios-y-roles',
        'documentos-alertas-y-estado',
      ],
    },
  ],
});
