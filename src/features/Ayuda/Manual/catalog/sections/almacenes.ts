import { defineSection, tab } from '../define.ts';

/**
 * Módulo Almacenes (`/dashboard/warehouse`). Cada sección del menú es un `?tab=`; las pantallas
 * de detalle (material, movimiento, pedido y su entrega) tienen el id en la URL y se declaran con
 * el comodín `/*` para que el botón "?" abra la guía de la sección desde la que se llega.
 */
export const almacenesSection = defineSection({
  key: 'almacenes',
  title: 'Almacenes',
  description: 'Stock por depósito, movimientos, préstamos de herramientas, pedidos de materiales y su configuración.',
  icon: 'warehouse',
  guides: [
    {
      slug: 'almacenes',
      // Guía de entrada al módulo: la ve quien tenga Ver en cualquiera de sus secciones.
      access: [
        tab('almacenes', 'stock'),
        tab('almacenes', 'movimientos'),
        tab('almacenes', 'prestamos'),
        tab('almacenes', 'pedidos'),
        tab('almacenes', 'materiales'),
        tab('almacenes', 'depositos'),
        tab('almacenes', 'config-almacen'),
      ],
      screens: [{ path: '/dashboard/warehouse' }],
      related: [
        'circuito-de-materiales',
        'stock-y-ficha-del-material',
        'movimientos-de-stock',
        'pedidos-de-materiales',
        'depositos',
        'materiales',
      ],
    },
    {
      slug: 'stock-y-ficha-del-material',
      access: [tab('almacenes', 'stock')],
      screens: [
        { path: '/dashboard/warehouse', tab: 'stock' },
        { path: '/dashboard/warehouse/materials/*' },
      ],
      related: ['almacenes', 'movimientos-de-stock', 'materiales', 'prestamos-de-herramientas'],
    },
    {
      slug: 'movimientos-de-stock',
      access: [tab('almacenes', 'movimientos')],
      screens: [
        { path: '/dashboard/warehouse', tab: 'movimientos' },
        { path: '/dashboard/warehouse/movements/*' },
      ],
      related: [
        'circuito-de-materiales',
        'pedidos-de-materiales',
        'prestamos-de-herramientas',
        'stock-y-ficha-del-material',
        'configuracion-de-almacenes',
      ],
    },
    {
      slug: 'prestamos-de-herramientas',
      access: [tab('almacenes', 'prestamos')],
      screens: [{ path: '/dashboard/warehouse', tab: 'prestamos' }],
      related: ['movimientos-de-stock', 'stock-y-ficha-del-material', 'materiales', 'circuito-de-materiales'],
    },
    {
      slug: 'pedidos-de-materiales',
      access: [tab('almacenes', 'pedidos')],
      screens: [
        { path: '/dashboard/warehouse', tab: 'pedidos' },
        { path: '/dashboard/warehouse/requests/*' },
      ],
      related: ['circuito-de-materiales', 'movimientos-de-stock', 'configuracion-de-almacenes', 'taller', 'panel-del-operario'],
    },
    {
      slug: 'materiales',
      access: [tab('almacenes', 'materiales')],
      screens: [{ path: '/dashboard/warehouse', tab: 'materiales' }],
      related: [
        'stock-y-ficha-del-material',
        'configuracion-de-almacenes',
        'catalogo-de-indumentaria',
        'gomeria',
        'movimientos-de-stock',
      ],
    },
    {
      slug: 'depositos',
      access: [tab('almacenes', 'depositos')],
      screens: [{ path: '/dashboard/warehouse', tab: 'depositos' }],
      related: ['almacenes', 'movimientos-de-stock', 'stock-y-ficha-del-material'],
    },
    {
      slug: 'configuracion-de-almacenes',
      access: [tab('almacenes', 'config-almacen')],
      screens: [{ path: '/dashboard/warehouse', tab: 'config-almacen' }],
      related: ['materiales', 'pedidos-de-materiales', 'movimientos-de-stock', 'gomeria'],
    },
  ],
});
