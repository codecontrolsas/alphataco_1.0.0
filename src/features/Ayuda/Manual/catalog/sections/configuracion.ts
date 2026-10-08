import { defineSection, tab } from '../define.ts';

const CONFIG = '/dashboard/configuration' as const;

export const configuracionSection = defineSection({
  key: 'configuracion',
  title: 'Configuración',
  description: 'Empresa, usuarios y roles, catálogos y datos fiscales.',
  icon: 'settings',
  guides: [
    {
      slug: 'datos-de-la-empresa',
      access: [tab('configuracion', 'general')],
      covers: [
        tab('configuracion', 'company'),
        tab('configuracion', 'cost-center'),
        tab('configuracion', 'organigrama'),
        tab('configuracion', 'documentacion'),
      ],
      screens: [
        { path: CONFIG },
        { path: CONFIG, tab: 'general' },
        { path: CONFIG, tab: 'general', subtab: 'company' },
        { path: CONFIG, tab: 'general', subtab: 'cost-center' },
        { path: CONFIG, tab: 'general', subtab: 'organigrama' },
        { path: CONFIG, tab: 'general', subtab: 'documentacion' },
        // Alta y edición de compañías (`/companies/new`, `/companies/[id]`) heredan por prefijo.
        { path: '/dashboard/configuration/companies' },
      ],
      related: ['usuarios-y-roles', 'catalogos-de-rrhh', 'documentos-de-empresa', 'empresa-usuarios-y-permisos'],
    },
    {
      slug: 'usuarios-y-roles',
      access: [tab('configuracion', 'users')],
      covers: [
        tab('configuracion', 'usuarios-empleados'),
        tab('configuracion', 'gestion-roles'),
        tab('configuracion', 'detalle-usuario'),
        tab('configuracion', 'accesos-externos'),
      ],
      screens: [{ path: CONFIG, tab: 'general', subtab: 'users' }, { path: '/dashboard/configuration/user' }],
      related: ['empresa-usuarios-y-permisos', 'ficha-del-empleado', 'datos-de-la-empresa', 'validar-solicitudes'],
    },
    {
      slug: 'kpis',
      access: [tab('configuracion', 'kpis')],
      covers: [tab('configuracion', 'indicadores'), tab('configuracion', 'graficos')],
      screens: [{ path: CONFIG, tab: 'general', subtab: 'kpis' }],
      related: ['dashboard-estadisticas', 'dashboard-principal', 'catalogos-de-rrhh'],
    },
    {
      slug: 'datos-fiscales',
      access: [tab('configuracion', 'datos-fiscales')],
      screens: [{ path: CONFIG, tab: 'general', subtab: 'datos-fiscales' }],
      related: ['facturacion', 'del-pedido-a-la-factura', 'datos-de-la-empresa'],
    },
    {
      slug: 'catalogos-de-rrhh',
      access: [tab('configuracion', 'rrhh')],
      covers: [
        tab('configuracion', 'listado'),
        tab('configuracion', 'diagrams'),
        tab('configuracion', 'convenios'),
        tab('configuracion', 'contract-types'),
        tab('configuracion', 'positions'),
        tab('configuracion', 'aptitudes'),
      ],
      screens: [
        { path: CONFIG, tab: 'rrhh' },
        { path: CONFIG, tab: 'rrhh', subtab: 'listado' },
        { path: CONFIG, tab: 'rrhh', subtab: 'diagrams' },
        { path: CONFIG, tab: 'rrhh', subtab: 'convenios' },
        { path: CONFIG, tab: 'rrhh', subtab: 'contract-types' },
        { path: CONFIG, tab: 'rrhh', subtab: 'positions' },
        { path: CONFIG, tab: 'rrhh', subtab: 'aptitudes' },
      ],
      related: ['diagramas', 'ficha-del-empleado', 'diagramas-afectaciones-y-desvios', 'tipos-de-documento'],
    },
    {
      slug: 'catalogo-de-indumentaria',
      access: [tab('configuracion', 'listado_maestro_articulos')],
      covers: [
        tab('configuracion', 'articulos_indumentaria'),
        tab('configuracion', 'marcas_indumentaria'),
        tab('configuracion', 'talles_indumentaria'),
        tab('configuracion', 'reportes_indumentaria'),
      ],
      screens: [{ path: CONFIG, tab: 'rrhh', subtab: 'items-maestro' }],
      related: ['entrega-de-indumentaria', 'ficha-del-empleado', 'catalogos-de-rrhh', 'materiales'],
    },
    {
      slug: 'catalogos-de-equipos',
      access: [tab('configuracion', 'vehicles')],
      covers: [
        tab('configuracion', 'tipos'),
        tab('configuracion', 'marcas'),
        tab('configuracion', 'modelos'),
        tab('configuracion', 'subtipos'),
        tab('configuracion', 'titulares'),
      ],
      screens: [
        { path: CONFIG, tab: 'vehicles' },
        { path: CONFIG, tab: 'vehicles', subtab: 'tipos' },
        { path: CONFIG, tab: 'vehicles', subtab: 'marcas' },
        { path: CONFIG, tab: 'vehicles', subtab: 'modelos' },
        { path: CONFIG, tab: 'vehicles', subtab: 'subtipos' },
        { path: CONFIG, tab: 'vehicles', subtab: 'titulares' },
      ],
      related: ['equipos-listado', 'ficha-del-vehiculo', 'ficha-de-otro-equipo', 'tipos-de-documento'],
    },
    {
      slug: 'catalogos-de-mantenimiento',
      access: [tab('configuracion', 'mantenimiento')],
      covers: [
        tab('configuracion', 'talleres'),
        tab('configuracion', 'sectores_taller'),
        tab('configuracion', 'type_of_repair'),
        tab('configuracion', 'maintenance_groups'),
      ],
      screens: [
        { path: CONFIG, tab: 'mantenimiento' },
        { path: CONFIG, tab: 'mantenimiento', subtab: 'talleres' },
        { path: CONFIG, tab: 'mantenimiento', subtab: 'sectores_taller' },
        { path: CONFIG, tab: 'mantenimiento', subtab: 'type_of_repair' },
        { path: CONFIG, tab: 'mantenimiento', subtab: 'maintenance_groups' },
      ],
      related: ['nuevo-pedido-de-mantenimiento', 'vista-taller', 'taller', 'del-checklist-al-taller'],
    },
    {
      slug: 'tipos-de-documento',
      access: [tab('configuracion', 'documentos')],
      covers: [
        tab('configuracion', 'tipos-docs-personas'),
        tab('configuracion', 'tipos-docs-equipos'),
        tab('configuracion', 'tipos-docs-empresa'),
      ],
      screens: [
        { path: CONFIG, tab: 'documentos' },
        { path: CONFIG, tab: 'documentos', subtab: 'Personas' },
        { path: CONFIG, tab: 'documentos', subtab: 'Equipos' },
        { path: CONFIG, tab: 'documentos', subtab: 'Empresa' },
        { path: '/dashboard/equipment', tab: 'tipos-de-documentos' },
      ],
      related: [
        'documentos-alertas-y-estado',
        'documentos-de-empleados',
        'documentos-de-equipos',
        'documentos-de-empresa',
        'candidatos',
      ],
    },
  ],
});
