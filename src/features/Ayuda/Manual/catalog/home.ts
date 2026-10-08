import type { ReadingPath } from './types.ts';

/** Guías de la tarjeta "Empezá por acá" de la portada, en orden. */
export const START_HERE: string[] = [
  'primeros-pasos',
  'empresa-usuarios-y-permisos',
  'como-usar-el-manual',
  'glosario',
];

/**
 * Recorridos sugeridos por perfil. En la portada se muestran solo los pasos que el usuario puede
 * abrir, y un recorrido con menos de dos pasos visibles no se muestra.
 */
export const READING_PATHS: ReadingPath[] = [
  {
    id: 'administrador',
    title: 'Poner en marcha el sistema',
    audience: 'Administración',
    steps: [
      'datos-de-la-empresa',
      'usuarios-y-roles',
      'catalogos-de-rrhh',
      'catalogos-de-equipos',
      'tipos-de-documento',
      'clientes',
      'contratos',
      'datos-fiscales',
    ],
  },
  {
    id: 'rrhh',
    title: 'Personal y legajos',
    audience: 'Recursos Humanos',
    steps: [
      'candidatos',
      'de-candidato-a-legajo',
      'empleados-listado',
      'ficha-del-empleado',
      'diagramas',
      'documentos-de-empleados',
      'altas-y-bajas',
    ],
  },
  {
    id: 'control-documental',
    title: 'Documentación y vencimientos',
    audience: 'Control documental',
    steps: [
      'documentos-alertas-y-estado',
      'tipos-de-documento',
      'documentos-de-empleados',
      'documentos-de-equipos',
      'documentos-de-empresa',
      'detalle-de-documento',
      'dashboard-vencimientos',
    ],
  },
  {
    id: 'operaciones',
    title: 'El día a día de la operación',
    audience: 'Operaciones',
    steps: [
      'gestor-de-pedidos',
      'partes-diarios',
      'detalle-del-parte',
      'diagramas-afectaciones-y-desvios',
      'dashboard-principal',
    ],
  },
  {
    id: 'mantenimiento',
    title: 'Del desvío a la reparación',
    audience: 'Mantenimiento y taller',
    steps: [
      'del-checklist-al-taller',
      'formularios',
      'equipos-con-desvios',
      'validar-solicitudes',
      'taller',
      'vista-taller',
      'pedidos-de-materiales',
      'gomeria',
    ],
  },
  {
    id: 'almacen',
    title: 'Inventario y pañol',
    audience: 'Almacén y pañol',
    steps: [
      'almacenes',
      'circuito-de-materiales',
      'depositos',
      'materiales',
      'movimientos-de-stock',
      'stock-y-ficha-del-material',
      'pedidos-de-materiales',
      'prestamos-de-herramientas',
      'configuracion-de-almacenes',
    ],
  },
  {
    id: 'comercial',
    title: 'Certificar y facturar',
    audience: 'Comercial y facturación',
    steps: [
      'del-pedido-a-la-factura',
      'contratos',
      'reglas-de-precio',
      'partes-diarios-comercial',
      'certificaciones',
      'facturacion',
    ],
  },
];
