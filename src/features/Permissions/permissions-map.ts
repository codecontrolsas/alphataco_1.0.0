/**
 * Mapa de permisos del sistema
 *
 * Este archivo contiene la estructura completa de módulos, tabs y subtabs
 * con tipado fuerte para autocompletado en TypeScript.
 *
 * Es la FUENTE de los modulos/tabs/acciones: `scripts/seed-company.ts` los upsertea a partir
 * de este mapa. (Nacio de los seeds `seed-modules.sql`/`seed-tabs-structure.sql` del directorio
 * `supabase/`, que P5 borro por historicos.)
 *
 * @example
 * ```tsx
 * <PermissionGuard
 *   module="empleados"  // ← Autocompleta módulos
 *   tab="documentos-de-empleados"  // ← Autocompleta tabs del módulo
 *   action="view"  // ← Autocompleta acciones
 * >
 *   <Button>Ver Documentos</Button>
 * </PermissionGuard>
 * ```
 */

// ============================================
// ACCIONES DISPONIBLES
// ============================================
export const ACTIONS = {
  view: { slug: 'view', name: 'Ver' },
  create: { slug: 'create', name: 'Crear' },
  update: { slug: 'update', name: 'Editar' },
  delete: { slug: 'delete', name: 'Eliminar' },
  view_all_requests: { slug: 'view_all_requests', name: 'Ver todas las solicitudes' },
  view_private: { slug: 'view_private', name: 'Ver privados' },
  upload_private: { slug: 'upload_private', name: 'Subir privados' },
  assign_resources: { slug: 'assign_resources', name: 'Asignar Recursos' },
  approve: { slug: 'approve', name: 'Aprobar' },
  // Un precio no es un dato como los otros: ver un parte y ver lo que vale son dos permisos
  // distintos, y poder tocar el precio es otro más.
  view_prices: { slug: 'view_prices', name: 'Ver precios e importes' },
  update_prices: { slug: 'update_prices', name: 'Modificar precios' },
  // Almacenes: un ajuste corrige el inventario sin respaldo documental, y una anulacion
  // revierte un movimiento ya registrado. Ninguno de los dos es "registrar movimientos".
  adjust: { slug: 'adjust', name: 'Ajustar stock' },
  reverse: { slug: 'reverse', name: 'Anular movimiento' },
  // Salida de stock sin pedido. Sin esta accion, una salida pasa por un pedido aprobado.
  direct_exit: { slug: 'direct_exit', name: 'Salida directa' },
} as const;

export type ActionSlug = keyof typeof ACTIONS;

// ============================================
// ESTRUCTURA DE PERMISOS
// ============================================
export const PERMISSIONS = {
  // ============================================
  // 1. DASHBOARD
  // ============================================
  dashboard: {
    slug: 'dashboard',
    name: 'Dashboard',
    moduleId: '91ed9ae4-6713-41ac-a87e-6b156e079948',
    tabs: {
      principal: {
        slug: 'principal',
        name: 'Principal',
        tabId: '90000000-0000-0000-0000-000000000001',
        parent: null,
        allowedActions: ['view'],
        subtabs: {},
      },
      documentacion: {
        slug: 'documentacion',
        name: 'Documentacion',
        tabId: '90000000-0000-0000-0000-000000000002',
        parent: null,
        allowedActions: ['view'],
        subtabs: {
          empleados: {
            slug: 'empleados',
            name: 'Empleados',
            tabId: '90000000-0000-0000-0000-000000000021',
            parent: 'documentacion',
            allowedActions: ['view'],
          },
          vehiculos: {
            slug: 'vehiculos',
            name: 'Vehiculos',
            tabId: '90000000-0000-0000-0000-000000000022',
            parent: 'documentacion',
            allowedActions: ['view'],
          },
        },
      },
      estadisticas: {
        slug: 'estadisticas',
        name: 'Estadisticas',
        tabId: '90000000-0000-0000-0000-000000000003',
        parent: null,
        allowedActions: ['view'],
        subtabs: {
          operaciones: {
            slug: 'operaciones',
            name: 'Operaciones',
            tabId: '90000000-0000-0000-0000-000000000031',
            parent: 'estadisticas',
            allowedActions: ['view'],
          },
          rrhh: {
            slug: 'rrhh',
            name: 'RRHH',
            tabId: '90000000-0000-0000-0000-000000000032',
            parent: 'estadisticas',
            allowedActions: ['view'],
          },
          mantenimiento: {
            slug: 'mantenimiento',
            name: 'Mantenimiento',
            tabId: '90000000-0000-0000-0000-000000000033',
            parent: 'estadisticas',
            allowedActions: ['view'],
          },
          desvios: {
            slug: 'desvios',
            name: 'Sala de Control',
            tabId: '90000000-0000-0000-0000-000000000034',
            parent: 'estadisticas',
            allowedActions: ['view'],
          },
        },
      },
    },
  },

  // ============================================
  // 2. EMPRESA
  // ============================================
  // El modulo se llamaba "Empresa". Paso a "Configuracion" porque es lo que realmente contiene:
  // los catalogos que configuran el sistema (tipos de documento, puestos, diagramas, aptitudes,
  // tipos de equipo, marcas, modelos...). El `moduleId` NO cambia: `role_permissions` y
  // `user_permissions` apuntan por UUID, asi que ningun permiso asignado se pierde con el rename.
  configuracion: {
    slug: 'configuracion',
    name: 'Configuración',
    moduleId: 'e0478383-1287-4b5e-a727-985baf867173',
    tabs: {
      general: {
        slug: 'general',
        name: 'General',
        tabId: '10000000-0000-0000-0000-000000000001',
        parent: null,
        allowedActions: ['view', 'update'],
        subtabs: {
          company: {
            slug: 'company',
            name: 'Empresa',
            tabId: '10000000-0000-0000-0000-000000000011',
            parent: 'general',
            allowedActions: ['view'],
          },
          'cost-center': {
            slug: 'cost-center',
            name: 'Centro de Costos',
            tabId: '10000000-0000-0000-0000-000000000012',
            parent: 'general',
            allowedActions: ['view', 'create', 'update'],
          },
          organigrama: {
            slug: 'organigrama',
            name: 'Organigrama',
            tabId: '10000000-0000-0000-0000-000000000013',
            parent: 'general',
            allowedActions: ['view', 'create', 'update'],
          },
          users: {
            slug: 'users',
            name: 'Usuarios',
            tabId: '10000000-0000-0000-0000-000000000014',
            parent: 'general',
            allowedActions: ['view'],
            subtabs: {
              'usuarios-empleados': {
                slug: 'usuarios-empleados',
                name: 'Usuarios',
                tabId: '10000000-0000-0000-0000-000000000141',
                parent: 'users',
                allowedActions: ['view', 'create', 'update', 'delete'],
              },
              'gestion-roles': {
                slug: 'gestion-roles',
                name: 'Gestión de Roles',
                tabId: '10000000-0000-0000-0000-000000000142',
                parent: 'users',
                allowedActions: ['view', 'create', 'update', 'delete'],
              },
              'detalle-usuario': {
                slug: 'detalle-usuario',
                name: 'Detalle de Usuario',
                tabId: '10000000-0000-0000-0000-000000000143',
                parent: 'users',
                allowedActions: ['view', 'update'],
              },
              'accesos-externos': {
                slug: 'accesos-externos',
                name: 'Accesos Externos',
                tabId: '10000000-0000-0000-0000-000000000144',
                parent: 'users',
                allowedActions: ['view', 'create', 'update', 'delete'],
              },
            },
          },
          // Venia de Dashboard > Estadisticas. Definir los KPIs es configurar que se mide;
          // el Dashboard los MUESTRA, que es otra cosa. El `tabId` ya tenia el prefijo del
          // modulo Configuracion (10000000-...), senal de que nacio aca.
          kpis: {
            slug: 'kpis',
            name: 'KPIs',
            tabId: '10000000-0000-0000-0000-000000000004',
            parent: 'general',
            allowedActions: ['view', 'create', 'update'],
            subtabs: {
              indicadores: {
                slug: 'indicadores',
                name: 'Indicadores',
                tabId: '10000000-0000-0000-0000-000000000041',
                parent: 'kpis',
                allowedActions: ['view', 'create', 'update'],
              },
              graficos: {
                slug: 'graficos',
                name: 'Gráficos',
                tabId: '10000000-0000-0000-0000-000000000042',
                parent: 'kpis',
                allowedActions: ['view'],
              },
            },
          },
          documentacion: {
            slug: 'documentacion',
            name: 'Documentación',
            tabId: '10000000-0000-0000-0000-000000000015',
            parent: 'general',
            allowedActions: ['view', 'create'],
          },
          // Facturación electrónica ARCA: datos fiscales del emisor, puntos de venta y certificado.
          'datos-fiscales': {
            slug: 'datos-fiscales',
            name: 'Datos fiscales',
            tabId: '10000000-0000-0000-0000-000000000017',
            parent: 'general',
            allowedActions: ['view', 'update'],
          },
        },
      },
      rrhh: {
        slug: 'rrhh',
        name: 'RRHH',
        tabId: '10000000-0000-0000-0000-000000000002',
        parent: null,
        allowedActions: ['view'],
        subtabs: {
          listado: {
            slug: 'listado',
            name: 'Tipos de Diagramas',
            tabId: '10000000-0000-0000-0000-000000000021',
            parent: 'rrhh',
            allowedActions: ['view', 'create', 'update'],
          },
          diagrams: {
            slug: 'diagrams',
            name: 'Tipos de Novedades',
            tabId: '10000000-0000-0000-0000-000000000022',
            parent: 'rrhh',
            allowedActions: ['view', 'create', 'update'],
          },
          convenios: {
            slug: 'convenios',
            name: 'CCT',
            tabId: '10000000-0000-0000-0000-000000000023',
            parent: 'rrhh',
            allowedActions: ['view', 'create'],
          },
          'contract-types': {
            slug: 'contract-types',
            name: 'Tipos de Contrato',
            tabId: '10000000-0000-0000-0000-000000000024',
            parent: 'rrhh',
            allowedActions: ['view', 'create', 'update'],
          },
          positions: {
            slug: 'positions',
            name: 'Puestos',
            tabId: '10000000-0000-0000-0000-000000000025',
            parent: 'rrhh',
            allowedActions: ['view', 'create', 'update'],
          },
          aptitudes: {
            slug: 'aptitudes',
            name: 'Aptitudes Técnicas',
            tabId: '10000000-0000-0000-0000-000000000026',
            parent: 'rrhh',
            allowedActions: ['view', 'create', 'update'],
          },
          listado_maestro_articulos: {
            slug: 'listado_maestro_articulos',
            name: 'Listado Maestro de Artículos',
            tabId: '69c7334c-84a1-4122-a83d-65e279964fcd',
            parent: 'rrhh',
            allowedActions: ['view'],
            subtabs: {
              articulos_indumentaria: {
                slug: 'articulos_indumentaria',
                name: 'Artículos',
                tabId: '7d36f2f7-6e56-4d61-b45a-da3ba43aaebe',
                parent: 'listado_maestro_articulos',
                allowedActions: ['view', 'create', 'update', 'delete'],
              },
              marcas_indumentaria: {
                slug: 'marcas_indumentaria',
                name: 'Marcas',
                tabId: '309aa503-3fd1-45e7-b666-23ee2bdfda2e',
                parent: 'listado_maestro_articulos',
                allowedActions: ['view', 'create', 'update', 'delete'],
              },
              talles_indumentaria: {
                slug: 'talles_indumentaria',
                name: 'Talles',
                tabId: '88cf0886-2e20-491d-8c7a-e7b5b12759d7',
                parent: 'listado_maestro_articulos',
                allowedActions: ['view', 'create', 'update', 'delete'],
              },
              reportes_indumentaria: {
                slug: 'reportes_indumentaria',
                name: 'Reportes',
                tabId: 'f377cf37-5aef-43a7-a663-3924a33cda02',
                parent: 'listado_maestro_articulos',
                allowedActions: ['view'],
              },
            },
          },
        },
      },
      vehicles: {
        slug: 'vehicles',
        name: 'Vehículos',
        tabId: '10000000-0000-0000-0000-000000000003',
        parent: null,
        allowedActions: ['view'],
        subtabs: {
          tipos: {
            slug: 'tipos',
            name: 'Tipos de Unidad',
            tabId: '10000000-0000-0000-0000-000000000031',
            parent: 'vehicles',
            allowedActions: ['view', 'create', 'update'],
          },
          marcas: {
            slug: 'marcas',
            name: 'Marcas',
            tabId: '10000000-0000-0000-0000-000000000032',
            parent: 'vehicles',
            allowedActions: ['view', 'create', 'update'],
          },
          modelos: {
            slug: 'modelos',
            name: 'Modelos',
            tabId: '10000000-0000-0000-0000-000000000033',
            parent: 'vehicles',
            allowedActions: ['view', 'create', 'update'],
          },
          subtipos: {
            slug: 'subtipos',
            name: 'Subtipos',
            tabId: '10000000-0000-0000-0000-000000000034',
            parent: 'vehicles',
            allowedActions: ['view', 'create', 'update'],
          },
          titulares: {
            slug: 'titulares',
            name: 'Titulares',
            tabId: '10000000-0000-0000-0000-000000000035',
            parent: 'vehicles',
            allowedActions: ['view', 'create', 'update'],
          },
        },
      },
      // Era subtab de `general`. Sube a primer nivel: configura talleres y sectores, que no
      // tienen nada que ver con los datos generales de la empresa. El `tabId` no cambia.
      mantenimiento: {
        slug: 'mantenimiento',
        name: 'Mantenimiento',
        tabId: '10000000-0000-0000-0000-000000000016',
        parent: null,
        allowedActions: ['view'],
        subtabs: {
          talleres: {
            slug: 'talleres',
            name: 'Talleres',
            tabId: '10000000-0000-0000-0000-000000000161',
            parent: 'mantenimiento',
            allowedActions: ['view', 'create', 'update', 'delete'],
          },
          sectores_taller: {
            slug: 'sectores_taller',
            name: 'Sectores',
            tabId: '10000000-0000-0000-0000-000000000162',
            parent: 'mantenimiento',
            allowedActions: ['view', 'create', 'update', 'delete'],
          },
          // Venian de la seccion "Taller", que se fusiono con esta: configurar un taller y
          // configurar las reparaciones que ese taller hace es lo mismo. Sus `tabId` no
          // cambiaron, asi que los permisos ya asignados siguen valiendo.
          type_of_repair: {
            slug: 'type_of_repair',
            name: 'Tipos de Reparación',
            tabId: '60000000-0000-0000-0000-000000000012',
            parent: 'mantenimiento',
            allowedActions: ['view', 'create', 'update'],
          },
          maintenance_groups: {
            slug: 'maintenance_groups',
            name: 'Grupos',
            tabId: '60000000-0000-0000-0000-000000000014',
            parent: 'mantenimiento',
            allowedActions: ['view', 'create', 'update'],
          },
        },
      },
      // Venia de Documentacion > Tipos de Documentos. Ojo: esta tab la MONTAN tambien Equipos
      // y Empleados, que declaran `moduleSlug: 'configuracion'` para heredar este permiso en
      // vez de tener uno propio. Si se mueve o renombra de nuevo, hay que tocar esos dos
      // lugares (`EquiposComponent`, `app/dashboard/employee/page.tsx`) y los sub-items del
      // sidebar que la declaran con `permissionModuleSlug`.
      documentos: {
        slug: 'documentos',
        name: 'Documentos',
        tabId: '50000000-0000-0000-0000-000000000004',
        parent: null,
        allowedActions: ['view', 'create'], // create para el botón de crear
        subtabs: {
          'tipos-docs-personas': {
            slug: 'tipos-docs-personas',
            name: 'Personas',
            tabId: '60000000-0000-0000-0000-000000000006',
            parent: 'documentos',
            allowedActions: ['view', 'update', 'create', 'view_private'],
          },
          'tipos-docs-equipos': {
            slug: 'tipos-docs-equipos',
            name: 'Equipos',
            tabId: '60000000-0000-0000-0000-000000000007',
            parent: 'documentos',
            allowedActions: ['view', 'update', 'create', 'view_private'],
          },
          'tipos-docs-empresa': {
            slug: 'tipos-docs-empresa',
            name: 'Empresa',
            tabId: '60000000-0000-0000-0000-000000000018',
            parent: 'documentos',
            allowedActions: ['view', 'update', 'create', 'view_private'],
          },
        },
      },
    },
  },

  // ============================================
  // 3. EMPLEADOS
  // ============================================
  empleados: {
    slug: 'empleados',
    name: 'Empleados',
    moduleId: '3c54a757-162c-4afc-8ea5-dca462f92e0c',
    tabs: {
      employees: {
        slug: 'employees',
        name: 'Empleados',
        tabId: '20000000-0000-0000-0000-000000000001',
        parent: null,
        allowedActions: ['view', 'create', 'update'],
        subtabs: {
          'empleados-activos': {
            slug: 'empleados-activos',
            name: 'Empleados Activos',
            tabId: '20000000-0000-0000-0000-000000000011',
            parent: 'employees',
            allowedActions: ['view'],
          },
          'empleados-inactivos': {
            slug: 'empleados-inactivos',
            name: 'Empleados Inactivos',
            tabId: '20000000-0000-0000-0000-000000000012',
            parent: 'employees',
            allowedActions: ['view'],
          },
        },
      },
      diagrams: {
        slug: 'diagrams',
        name: 'Diagramas',
        tabId: '20000000-0000-0000-0000-000000000003',
        parent: null,
        allowedActions: ['view'],
        subtabs: {
          old: {
            slug: 'old',
            name: 'Diagramas Cargados',
            tabId: '20000000-0000-0000-0000-000000000031',
            parent: 'diagrams',
            allowedActions: ['view'],
          },
          new: {
            slug: 'new',
            name: 'Cargar Diagramas',
            tabId: '20000000-0000-0000-0000-000000000032',
            parent: 'diagrams',
            allowedActions: ['view'],
          },
          massive_diagram: {
            slug: 'massive_diagram',
            name: 'Carga Masiva',
            tabId: '20000000-0000-0000-0000-000000000033',
            parent: 'diagrams',
            allowedActions: ['view'],
          },
          reports: {
            slug: 'reports',
            name: 'Reportes',
            tabId: '20000000-0000-0000-0000-000000000034',
            parent: 'diagrams',
            allowedActions: ['view'],
          },
        },
      },
      // 'tipos-de-documentos': HEREDA permisos de 'documentacion/tipos-de-documentos'
      // Esta tab no debe estar aquí porque hereda permisos del módulo de documentación.
      // Ver implementación en: src/app/dashboard/employee/page.tsx
      'detalle-empleado': {
        slug: 'detalle-empleado',
        name: 'Detalle de Empleado',
        tabId: '20000000-0000-0000-0000-000000000006',
        parent: null,
        allowedActions: ['view', 'update'],
        subtabs: {
          'datos-personales': {
            slug: 'datos-personales',
            name: 'Datos Personales',
            tabId: '20000000-0000-0000-0000-000000000061',
            parent: 'detalle-empleado',
            allowedActions: ['view'],
          },
          'datos-contacto': {
            slug: 'datos-contacto',
            name: 'Datos de Contacto',
            tabId: '20000000-0000-0000-0000-000000000062',
            parent: 'detalle-empleado',
            allowedActions: ['view'],
          },
          'datos-laborales': {
            slug: 'datos-laborales',
            name: 'Datos Laborales',
            tabId: '20000000-0000-0000-0000-000000000063',
            parent: 'detalle-empleado',
            allowedActions: ['view'],
          },
          // 'documentacion-empleado': HEREDA permisos de 'documentacion/documentos-de-empleados'
          // Esta tab no debe estar aquí porque hereda permisos del módulo de documentación.
          // Ver implementación en: src/features/Employees/EmpleadoID/components/employee-tabs.tsx
          'diagramas-empleado': {
            slug: 'diagramas-empleado',
            name: 'Diagramas',
            tabId: '20000000-0000-0000-0000-000000000065',
            parent: 'detalle-empleado',
            allowedActions: ['view'],
          },
          indumentaria_empleado: {
            slug: 'indumentaria_empleado',
            name: 'Indumentaria',
            tabId: '3df67b2a-f5e7-47e0-849b-88698d055863',
            parent: 'detalle-empleado',
            // `delete`: anular una entrega de ropa (Almacenes etapa 5).
            allowedActions: ['view', 'create', 'delete'],
          },
        },
      },
    },
  },

  // ============================================
  // 4. EQUIPOS
  // ============================================
  equipos: {
    slug: 'equipos',
    name: 'Equipos',
    moduleId: '34d7f9e5-7c01-4def-9446-6b3f52d761a0',
    tabs: {
      equipos: {
        slug: 'equipos',
        name: 'Equipos',
        tabId: '30000000-0000-0000-0000-000000000001',
        parent: null,
        allowedActions: ['view', 'create'],
        subtabs: {
          vehicles: {
            slug: 'vehicles',
            name: 'Vehículos',
            tabId: '30000000-0000-0000-0000-000000000011',
            parent: 'equipos',
            allowedActions: ['view', 'create'],
          },
          others: {
            slug: 'others',
            name: 'Equipamiento',
            tabId: '30000000-0000-0000-0000-000000000012',
            parent: 'equipos',
            allowedActions: ['view', 'create'],
          },
          inactive: {
            slug: 'inactive',
            name: 'Dados de Baja',
            tabId: '30000000-0000-0000-0000-000000000013',
            parent: 'equipos',
            allowedActions: ['view'],
          },
        },
      },
      'documentos-de-equipos': {
        slug: 'documentos-de-equipos',
        name: 'Documentos de Equipos',
        tabId: '30000000-0000-0000-0000-000000000002',
        parent: null,
        allowedActions: ['view', 'create'],
        subtabs: {
          'docs-equipos-permanentes': {
            slug: 'docs-equipos-permanentes',
            name: 'Permanentes',
            tabId: '30000000-0000-0000-0000-000000000021',
            parent: 'documentos-de-equipos',
            allowedActions: ['view', 'update'],
          },
          'docs-equipos-mensuales': {
            slug: 'docs-equipos-mensuales',
            name: 'Mensuales',
            tabId: '30000000-0000-0000-0000-000000000022',
            parent: 'documentos-de-equipos',
            allowedActions: ['view', 'update'],
          },
        },
      },
      // 'tipos-de-documentos': HEREDA permisos de 'documentacion/tipos-de-documentos'
      // Esta tab no debe estar aquí porque hereda permisos del módulo de documentación.
      // Ver implementación en: src/features/Equipos/EquiposComponent.tsx
      type_of_repairs: {
        slug: 'type_of_repairs',
        name: 'Mantenimiento',
        tabId: '30000000-0000-0000-0000-000000000004',
        parent: null,
        allowedActions: ['view'],
        subtabs: {
          type_of_repair: {
            slug: 'type_of_repair',
            name: 'Tipos de Reparación',
            tabId: '30000000-0000-0000-0000-000000000042',
            parent: 'type_of_repairs',
            allowedActions: ['view', 'create', 'update'],
          },
          equipments_with_deviations: {
            slug: 'equipments_with_deviations',
            name: 'Equipos con Desvíos',
            // UUID propio: antes compartía '...015' con mantenimiento/equipments_with_deviations
            // (mismo id de tab en dos módulos distintos). El seed hacía upsert por `id`, así que
            // la última fila en pisar ganaba (mantenimiento) y esta entrada quedaba sin fila en BD.
            tabId: '60000000-0000-0000-0000-000000000019',
            parent: 'type_of_repairs',
            allowedActions: ['view'],
          },
          maintenance_groups: {
            slug: 'maintenance_groups',
            name: 'Grupos',
            tabId: '30000000-0000-0000-0000-000000000044',
            parent: 'type_of_repairs',
            allowedActions: ['view', 'create', 'update'],
          },
        },
      },
      'checklist-equipo': {
        slug: 'checklist-equipo',
        name: 'Checklist',
        tabId: '30000000-0000-0000-0000-000000000056',
        parent: 'detalle-equipo',
        allowedActions: ['view'],
      },
      'cubiertas-equipo': {
        slug: 'cubiertas-equipo',
        name: 'Cubiertas',
        tabId: '30000000-0000-0000-0000-000000000057',
        parent: 'detalle-equipo',
        allowedActions: ['view', 'update'],
        subtabs: {},
      },
      'detalle-otro-equipo': {
        slug: 'detalle-otro-equipo',
        name: 'Detalle de Otro Equipo',
        tabId: 'e8604848-24d4-4f23-a466-700b43b24202',
        parent: null,
        allowedActions: ['view', 'update'],
        subtabs: {
          'datos-basicos-otro': {
            slug: 'datos-basicos-otro',
            name: 'Datos Básicos',
            tabId: 'e59f78dc-269c-4280-b5a6-d16076e304a9',
            parent: 'detalle-otro-equipo',
            allowedActions: ['view'],
          },
          'asignacion-otro': {
            slug: 'asignacion-otro',
            name: 'Asignación',
            tabId: '5f038bbf-8547-4a4a-b1c7-0e3b1c08ff63',
            parent: 'detalle-otro-equipo',
            allowedActions: ['view'],
          },
          'certificaciones-otro': {
            slug: 'certificaciones-otro',
            name: 'Documentos',
            tabId: 'b635efcb-e558-4709-8037-f5d3f3761c84',
            parent: 'detalle-otro-equipo',
            allowedActions: ['view'],
          },
          'qr-otro-equipo': {
            slug: 'qr-otro-equipo',
            name: 'QR',
            tabId: 'aecb923c-460f-4009-83df-667da0518a82',
            parent: 'detalle-otro-equipo',
            allowedActions: ['view'],
          },
        },
      },
      'detalle-equipo': {
        slug: 'detalle-equipo',
        name: 'Detalle de Equipo',
        tabId: '30000000-0000-0000-0000-000000000005',
        parent: null,
        allowedActions: ['view', 'update'],
        subtabs: {
          'datos-basicos': {
            slug: 'datos-basicos',
            name: 'Datos Básicos',
            tabId: '30000000-0000-0000-0000-000000000051',
            parent: 'detalle-equipo',
            allowedActions: ['view'],
          },
          asignacion: {
            slug: 'asignacion',
            name: 'Asignación',
            tabId: '30000000-0000-0000-0000-000000000052',
            parent: 'detalle-equipo',
            allowedActions: ['view'],
          },
          // 'documentos-equipo': HEREDA permisos de 'documentacion/documentos-de-equipos'
          // Esta tab no debe estar aquí porque hereda permisos del módulo de documentación.
          // Ver implementación en: src/features/Equipos/EquipoID/components/vehicle-tabs.tsx
          // 'reparaciones': HEREDA permisos de 'equipos/type_of_repairs'
          // Esta tab no debe estar aquí porque hereda permisos del módulo de equipos.
          // Ver implementación en: src/features/Equipos/EquipoID/components/vehicle-tabs.tsx
          'qr-equipo': {
            slug: 'qr-equipo',
            name: 'QR',
            tabId: '30000000-0000-0000-0000-000000000055',
            parent: 'detalle-equipo',
            allowedActions: ['view'],
          },
          'historial-mantenimiento-equipo': {
            slug: 'historial-mantenimiento-equipo',
            name: 'Historial de Mantenimiento',
            tabId: '30000000-0000-0000-0000-000000000058',
            parent: 'detalle-equipo',
            allowedActions: ['view'],
          },
        },
      },
    },
  },

  // ============================================
  // 8. OPERACIONES
  // ============================================
  operaciones: {
    slug: 'operaciones',
    name: 'Operaciones',
    moduleId: '5563157e-fc3e-470f-b90b-dadd7cc38417',
    tabs: {
      preparte: {
        slug: 'preparte',
        name: 'Preparte',
        tabId: '70000000-0000-0000-0000-000000000001',
        parent: null,
        allowedActions: ['view', 'create', 'update', 'delete'],
        subtabs: {},
      },
      dailyreportstable: {
        slug: 'dailyreportstable',
        name: 'Partes Diarios',
        tabId: '70000000-0000-0000-0000-000000000002',
        parent: null,
        allowedActions: ['view', 'create', 'delete'],
        subtabs: {},
      },
      'detalle-parte-diario': {
        slug: 'detalle-parte-diario',
        name: 'Detalle de Parte Diario',
        tabId: '70000000-0000-0000-0000-000000000003',
        parent: null,
        allowedActions: ['view', 'create', 'update', 'delete', 'assign_resources'],
        subtabs: {},
      },
    },
  },

  // ============================================
  // 9. FORMULARIOS
  // ============================================
  formularios: {
    slug: 'formularios',
    name: 'Formularios',
    moduleId: '6674268f-0d4f-581f-c91c-ebbe8dd49528',
    tabs: {
      formularios: {
        slug: 'formularios',
        name: 'Formularios',
        tabId: '80000000-0000-0000-0000-000000000001',
        parent: null,
        allowedActions: ['view'],
        subtabs: {},
      },
    },
  },

  // ============================================
  // 10. AYUDA
  // ============================================
  ayuda: {
    slug: 'ayuda',
    name: 'Ayuda',
    moduleId: '7785379f-1e5f-692f-da2d-fccf9ee5af39',
    tabs: {
      tickets: {
        slug: 'tickets',
        name: 'Tickets de Soporte',
        tabId: 'a0000000-0000-0000-0000-000000000001',
        parent: null,
        allowedActions: ['view'],
        subtabs: {},
      },
      manual: {
        slug: 'manual',
        name: 'Manual de uso',
        tabId: 'a0000000-0000-0000-0000-000000000002',
        parent: null,
        allowedActions: ['view'],
        subtabs: {},
      },
    },
  },

  // ============================================
  // 11. COMERCIAL
  // ============================================
  // ============================================
  // 6. DOCUMENTACIÓN
  // ============================================
  documentacion: {
    slug: 'documentacion',
    name: 'Documentación',
    moduleId: '4783f7df-3580-4f54-bf8f-6ef7f252d038',
    tabs: {
      'documentos-de-empleados': {
        slug: 'documentos-de-empleados',
        name: 'Documentos de Empleados',
        tabId: '50000000-0000-0000-0000-000000000001',
        parent: null,
        allowedActions: ['view', 'create', 'view_private', 'upload_private'],
        subtabs: {
          'docs-empleados-permanentes': {
            slug: 'docs-empleados-permanentes',
            name: 'Permanentes',
            tabId: '60000000-0000-0000-0000-000000000003',
            parent: 'documentos-de-empleados',
            allowedActions: ['view', 'update'],
          },
          'docs-empleados-mensuales': {
            slug: 'docs-empleados-mensuales',
            name: 'Mensuales',
            tabId: '60000000-0000-0000-0000-000000000002',
            parent: 'documentos-de-empleados',
            allowedActions: ['view', 'update'],
          },
        },
      },
      'documentos-de-equipos': {
        slug: 'documentos-de-equipos',
        name: 'Documentos de Equipos',
        tabId: '50000000-0000-0000-0000-000000000002',
        parent: null,
        allowedActions: ['view', 'create', 'view_private', 'upload_private'],
        subtabs: {
          'docs-equipos-permanentes': {
            slug: 'docs-equipos-permanentes',
            name: 'Permanentes',
            tabId: '60000000-0000-0000-0000-000000000004',
            parent: 'documentos-de-equipos',
            allowedActions: ['view', 'update'],
          },
          'docs-equipos-mensuales': {
            slug: 'docs-equipos-mensuales',
            name: 'Mensuales',
            tabId: '60000000-0000-0000-0000-000000000005',
            parent: 'documentos-de-equipos',
            allowedActions: ['view', 'update'],
          },
        },
      },
      'documentos-de-empresa': {
        slug: 'documentos-de-empresa',
        name: 'Documentos de Empresa',
        tabId: '50000000-0000-0000-0000-000000000003',
        parent: null,
        allowedActions: ['view', 'create', 'view_private', 'upload_private'],
        subtabs: {
          'docs-empresa-permanentes': {
            slug: 'docs-empresa-permanentes',
            name: 'Permanentes',
            tabId: '60000000-0000-0000-0000-000000000016',
            parent: 'documentos-de-empresa',
            allowedActions: ['view', 'update'],
          },
          'docs-empresa-mensuales': {
            slug: 'docs-empresa-mensuales',
            name: 'Mensuales',
            tabId: '60000000-0000-0000-0000-000000000017',
            parent: 'documentos-de-empresa',
            allowedActions: ['view', 'update'],
          },
        },
      },
      'detalle-de-documento': {
        slug: 'detalle-de-documento',
        name: 'Detalle de Documento',
        tabId: '50000000-0000-0000-0000-000000000005',
        parent: null,
        allowedActions: ['view', 'update'],
        subtabs: {
          'detalle-doc-empresa': {
            slug: 'detalle-doc-empresa',
            name: 'Empresa',
            tabId: '60000000-0000-0000-0000-000000000008',
            parent: 'detalle-de-documento',
            allowedActions: ['view'],
          },
          'detalle-doc-empleado': {
            slug: 'detalle-doc-empleado',
            name: 'Empleado',
            tabId: '60000000-0000-0000-0000-000000000009',
            parent: 'detalle-de-documento',
            allowedActions: ['view'],
          },
          'detalle-doc-documento': {
            slug: 'detalle-doc-documento',
            name: 'Documento',
            tabId: '60000000-0000-0000-0000-000000000010',
            parent: 'detalle-de-documento',
            allowedActions: ['view'],
          },
        },
      },
    },
  },

  // ============================================
  // 7. MANTENIMIENTO
  // ============================================
  mantenimiento: {
    slug: 'mantenimiento',
    name: 'Mantenimiento',
    moduleId: '421e96da-5235-4857-bf81-e63336447f13',
    tabs: {
      // Vista Taller (COD-394) — agrupada por sector de taller
      workshop_view: {
        slug: 'workshop_view',
        name: 'Vista Taller',
        tabId: '60000000-0000-0000-0000-000000000071',
        parent: null,
        allowedActions: ['view'],
        subtabs: {},
      },
      // Tab raíz desde que se movió fuera de Operaciones (ver MantenimientoComponent).
      // Mientras figuró como subtab de `maint_operaciones`, la visibilidad inferida
      // del TabsManager hacía aparecer Operaciones a quien solo tuviera Nuevo Pedido
      // (ticket 593).
      nuevo_pedido: {
        slug: 'nuevo_pedido',
        name: 'Nuevo Pedido',
        tabId: '60000000-0000-0000-0000-000000000024',
        parent: null,
        allowedActions: ['view', 'create'], // create = crear pedidos de mantenimiento
        subtabs: {},
      },
      // Tab 1: Operaciones
      maint_operaciones: {
        slug: 'maint_operaciones',
        name: 'Operaciones',
        tabId: '60000000-0000-0000-0000-000000000030',
        parent: null,
        allowedActions: ['view'],
        subtabs: {
          equipments_with_deviations: {
            slug: 'equipments_with_deviations',
            name: 'Equipos con Desvíos',
            tabId: '60000000-0000-0000-0000-000000000015',
            parent: 'maint_operaciones',
            allowedActions: ['view'],
          },
          maintenance_requests: {
            slug: 'maintenance_requests',
            name: 'Solicitudes de Mantenimiento',
            tabId: '60000000-0000-0000-0000-000000000020',
            parent: 'maint_operaciones',
            allowedActions: ['view', 'update', 'view_all_requests'], // update = aprobar/denegar, view_all_requests = ver todas sin filtro de supervisor
          },
          // Legacy — desconectada de la UI pero mantenida para compatibilidad.
          // El paso "Aprobar Fecha" se eliminó del circuito: la fecha que programa
          // el taller es directamente la fecha de reparación.
          pendientes_ejecutar: {
            slug: 'pendientes_ejecutar',
            name: 'Pendientes de Ejecutar (Legacy)',
            tabId: '60000000-0000-0000-0000-000000000023',
            parent: 'maint_operaciones',
            allowedActions: ['view', 'update', 'view_all_requests'],
          },
          // Legacy — desconectada de la UI pero mantenida para compatibilidad.
          // Su información se migró al paso "Seguimiento" con el estado
          // "Pendiente de ingreso a taller".
          para_taller: {
            slug: 'para_taller',
            name: 'Para Taller (Legacy)',
            tabId: '60000000-0000-0000-0000-000000000025',
            parent: 'maint_operaciones',
            allowedActions: ['view', 'update', 'view_all_requests'],
          },
          seguimiento_taller: {
            slug: 'seguimiento_taller',
            name: 'Seguimiento en Taller',
            tabId: '60000000-0000-0000-0000-000000000026',
            parent: 'maint_operaciones',
            allowedActions: ['view', 'update'], // update = validar/rechazar orden desde operaciones
          },
        },
      },
      // Tab 2: Taller
      maint_taller: {
        slug: 'maint_taller',
        name: 'Taller',
        tabId: '60000000-0000-0000-0000-000000000040',
        parent: null,
        allowedActions: ['view'],
        subtabs: {
          maintenance_orders: {
            slug: 'maintenance_orders',
            name: 'Pedidos de Mantenimiento',
            tabId: '60000000-0000-0000-0000-000000000021',
            parent: 'maint_taller',
            allowedActions: ['view', 'update'], // update = planificar fecha, aprobar entrada
            subtabs: {
              pedidos_pendientes: {
                slug: 'pedidos_pendientes',
                name: 'Pendientes',
                tabId: '60000000-0000-0000-0000-000000000211',
                parent: 'maintenance_orders',
                allowedActions: ['view', 'update'], // update = planificar fecha
              },
              pedidos_confirmados: {
                slug: 'pedidos_confirmados',
                name: 'Confirmados',
                tabId: '60000000-0000-0000-0000-000000000212',
                parent: 'maintenance_orders',
                allowedActions: ['view', 'update'], // update = aprobar entrada a taller
              },
            },
          },
          gestion_ordenes: {
            slug: 'gestion_ordenes',
            name: 'Gestión de Órdenes',
            tabId: '60000000-0000-0000-0000-000000000043',
            parent: 'maint_taller',
            allowedActions: ['view', 'create', 'update'],
          },
          bandeja_aprobaciones: {
            slug: 'bandeja_aprobaciones',
            name: 'Bandeja de Aprobaciones',
            tabId: '60000000-0000-0000-0000-000000000044',
            parent: 'maint_taller',
            allowedActions: ['view', 'update'],
          },
          ordenes_mantenimiento: {
            slug: 'ordenes_mantenimiento',
            name: 'Órdenes de Mantenimiento',
            tabId: '60000000-0000-0000-0000-000000000045',
            parent: 'maint_taller',
            allowedActions: ['view', 'update'],
          },
          // Legacy tabs - desconectadas de la UI pero mantenidas para compatibilidad
          planificacion: {
            slug: 'planificacion',
            name: 'Planificación (Legacy)',
            tabId: '60000000-0000-0000-0000-000000000041',
            parent: 'maint_taller',
            allowedActions: ['view', 'update'],
          },
        },
      },
      // Tab 4: Gomería
      gomeria: {
        slug: 'gomeria',
        name: 'Gomería',
        tabId: '60000000-0000-0000-0000-000000000070',
        parent: null,
        allowedActions: ['view'],
        subtabs: {
          catalogo_cubiertas: {
            slug: 'catalogo_cubiertas',
            name: 'Catálogo de Cubiertas',
            tabId: '60000000-0000-0000-0000-000000000061',
            parent: 'gomeria',
            allowedActions: ['view', 'create', 'update', 'delete'],
          },
          plantillas_cubiertas: {
            slug: 'plantillas_cubiertas',
            name: 'Plantillas de Cubiertas',
            tabId: '60000000-0000-0000-0000-000000000062',
            parent: 'gomeria',
            allowedActions: ['view', 'create', 'update'],
          },
          ordenes_gomeria: {
            slug: 'ordenes_gomeria',
            name: 'Órdenes de Gomería',
            tabId: '60000000-0000-0000-0000-000000000063',
            parent: 'gomeria',
            allowedActions: ['view', 'create', 'update'],
          },
          marcas_cubiertas: {
            slug: 'marcas_cubiertas',
            name: 'Marcas de Cubiertas',
            tabId: '60000000-0000-0000-0000-000000000064',
            parent: 'gomeria',
            allowedActions: ['view', 'create', 'update'],
          },
          tipos_cubiertas: {
            slug: 'tipos_cubiertas',
            name: 'Tipos de Cubierta',
            tabId: '60000000-0000-0000-0000-000000000065',
            parent: 'gomeria',
            allowedActions: ['view', 'create', 'update'],
          },
        },
      },
      // Tab 3: Configuración
    },
  },

  // ============================================
  // 11. COMERCIAL
  // ============================================
  comercial: {
    slug: 'comercial',
    name: 'Comercial',
    moduleId: '92bfac14-dc5b-41be-b366-740bfbeaea13',
    tabs: {
      comerce: {
        slug: 'comerce',
        name: 'Comercial',
        tabId: '40000000-0000-0000-0000-000000000001',
        parent: null,
        allowedActions: ['view'],
        subtabs: {
          customers: {
            slug: 'customers',
            name: 'Clientes',
            tabId: '40000000-0000-0000-0000-000000000011',
            parent: 'comerce',
            allowedActions: ['view', 'create'],
            subtabs: {
              'detalle-cliente': {
                slug: 'detalle-cliente',
                name: 'Detalle',
                tabId: '40000000-0000-0000-0000-000000000111',
                parent: 'customers',
                allowedActions: ['view', 'update'],
              },
              'empleados-cliente': {
                slug: 'empleados-cliente',
                name: 'Empleados',
                tabId: '40000000-0000-0000-0000-000000000112',
                parent: 'customers',
                allowedActions: ['view', 'update'],
              },
              'areas-cliente': {
                slug: 'areas-cliente',
                name: 'Areas del Cliente',
                tabId: '40000000-0000-0000-0000-000000000114',
                parent: 'customers',
                allowedActions: ['view', 'create', 'update', 'delete'],
              },
              'sectores-cliente': {
                slug: 'sectores-cliente',
                name: 'Sectores del Cliente',
                tabId: '40000000-0000-0000-0000-000000000115',
                parent: 'customers',
                allowedActions: ['view', 'create', 'update', 'delete'],
              },
              'equipos-cliente': {
                slug: 'equipos-cliente',
                name: 'Equipos',
                tabId: '40000000-0000-0000-0000-000000000113',
                parent: 'customers',
                // `create` y `update` son el CRUD de los equipos DEL cliente (`equipos_clientes`);
                // `update` tambien cubre afectar/desafectar equipos de la empresa al cliente.
                // La base ya concedia `create`, pero faltaba declararlo: sin estar en el mapa, el
                // editor de permisos no lo ofrece como tildeable.
                allowedActions: ['view', 'create', 'update'],
              },
              // 'contratos-cliente': HEREDA permisos de 'comercial/comerce/service'
              // Esta tab no debe estar aquí porque hereda permisos de la tab Contratos/Servicios.
              // Ver implementación en: src/features/Empresa/Clientes/components/CustomerDetail/CustomerDetail.tsx
            },
          },
          service: {
            slug: 'service',
            name: 'Contratos',
            tabId: '40000000-0000-0000-0000-000000000015',
            parent: 'comerce',
            allowedActions: ['view', 'create'],
            subtabs: {
              'detalle-contrato': {
                slug: 'detalle-contrato',
                name: 'Detalle',
                tabId: '40000000-0000-0000-0000-000000000151',
                parent: 'service',
                allowedActions: ['view', 'update'],
              },
              'documentos-contrato': {
                slug: 'documentos-contrato',
                name: 'Documentos',
                tabId: '40000000-0000-0000-0000-000000000152',
                parent: 'service',
                allowedActions: ['view'],
              },
              'items-contrato': {
                slug: 'items-contrato',
                name: 'Items del Servicio',
                tabId: '40000000-0000-0000-0000-000000000153',
                parent: 'service',
                // `view` deja ver el item; `view_prices` deja ver lo que vale, y
                // `update_prices` deja cambiarlo. Separados a proposito.
                allowedActions: ['view', 'create', 'update', 'view_prices', 'update_prices'],
              },
            },
          },
          mensure_units: {
            slug: 'mensure_units',
            name: 'Unidades de Medida',
            tabId: '40000000-0000-0000-0000-000000000016',
            parent: 'comerce',
            allowedActions: ['view', 'create', 'update'],
          },
          'reglas-precio': {
            slug: 'reglas-precio',
            name: 'Reglas de Actualizacion de Precios',
            tabId: '40000000-0000-0000-0000-000000000154',
            parent: 'comerce',
            allowedActions: ['view', 'create', 'update', 'delete'],
            subtabs: {},
          },
          certificaciones: {
            slug: 'certificaciones',
            name: 'Certificaciones',
            tabId: '40000000-0000-0000-0000-000000000018',
            parent: 'comerce',
            // `approve` es confirmar la certificacion emitida; `delete` es anularla.
            // `view_prices` decide quien ve los importes del documento.
            allowedActions: ['view', 'create', 'update', 'delete', 'approve', 'view_prices'],
            subtabs: {},
          },
          // Facturación electrónica ARCA. `create` arma y edita borradores (y NC/ND);
          // `approve` emite ante ARCA y consulta pendientes; `delete` descarta borradores;
          // `view_prices` muestra importes (emitir exige además ver lo que se emite).
          facturacion: {
            slug: 'facturacion',
            name: 'Facturación',
            tabId: '40000000-0000-0000-0000-000000000019',
            parent: 'comerce',
            allowedActions: ['view', 'create', 'delete', 'approve', 'view_prices'],
            subtabs: {},
          },
          daily_reports: {
            slug: 'daily_reports',
            name: 'Partes Diarios',
            tabId: '40000000-0000-0000-0000-000000000017',
            parent: 'comerce',
            allowedActions: ['view', 'create', 'update'],
          },
        },
      },
    },
  },
  // ============================================
  // 11. SELECCION
  // ============================================
  // Era la tab "Candidatos" del modulo Empleados. Se saca a modulo propio porque no es una
  // vista mas del legajo: es un circuito con estados (carga -> documentacion -> aprobacion o
  // rechazo -> conversion en legajo) con su maquina de estados, su checklist de documentos y
  // su pantalla de detalle.
  //
  // El `tabId` viaja sin cambiar, asi que los permisos ya asignados siguen valiendo. Conserva
  // el prefijo `20000000-` del modulo Empleados, donde nacio; no se renumera porque renumerar
  // un id es justamente lo que romperia esos permisos.
  seleccion: {
    slug: 'seleccion',
    name: 'Selección',
    moduleId: 'cbe0ae38-37ab-48cd-bfeb-f39582d8043b',
    tabs: {
      candidatos: {
        slug: 'candidatos',
        name: 'Candidatos',
        tabId: '20000000-0000-0000-0000-000000000007',
        parent: null,
        // 'approve' habilita aprobar y rechazar: es la decisión de gerencia,
        // separada de la carga y edición que hace RRHH con 'create'/'update'.
        allowedActions: ['view', 'create', 'update', 'approve'],
        subtabs: {},
      },
    },
  },
  // ============================================
  // 12. ALMACENES
  // ============================================
  // Inventario multi-deposito (spec docs/superpowers/specs/2026-10-04-almacenes-etapa-1-design.md).
  // Prefijo de ids `b0000000-`: `50000000-` ya es de Documentacion. Antes de elegir un prefijo,
  // verificar que no exista: `SELECT DISTINCT substr(id::text,1,8) FROM tabs`.
  // Las pantallas de detalle (movimiento, material) heredan el permiso del tab desde el que
  // se llega: movimientos/view y stock/view respectivamente.
  almacenes: {
    slug: 'almacenes',
    name: 'Almacenes',
    moduleId: 'b0000000-0000-0000-0000-000000000000',
    tabs: {
      stock: {
        slug: 'stock',
        name: 'Stock',
        tabId: 'b0000000-0000-0000-0000-000000000001',
        parent: null,
        allowedActions: ['view', 'view_prices'],
        subtabs: {},
      },
      movimientos: {
        slug: 'movimientos',
        name: 'Movimientos',
        tabId: 'b0000000-0000-0000-0000-000000000002',
        parent: null,
        // 'create' registra entradas, salidas y transferencias; 'adjust' y 'reverse' son
        // aparte (ver ACTIONS).
        allowedActions: ['view', 'create', 'adjust', 'reverse', 'view_prices', 'direct_exit'],
        subtabs: {},
      },
      prestamos: {
        slug: 'prestamos',
        name: 'Préstamos',
        tabId: 'b0000000-0000-0000-0000-000000000006',
        parent: null,
        // 'create' registra la devolucion; 'delete' da de baja una herramienta que no vuelve.
        allowedActions: ['view', 'create', 'delete'],
        subtabs: {},
      },
      pedidos: {
        slug: 'pedidos',
        name: 'Pedidos',
        tabId: 'b0000000-0000-0000-0000-000000000007',
        parent: null,
        // 'view' ve los propios, 'view_all_requests' todos; 'approve' aprueba o rechaza;
        // 'update' entrega y cierra.
        allowedActions: ['view', 'view_all_requests', 'create', 'approve', 'update'],
        subtabs: {},
      },
      materiales: {
        slug: 'materiales',
        name: 'Materiales',
        tabId: 'b0000000-0000-0000-0000-000000000003',
        parent: null,
        allowedActions: ['view', 'create', 'update', 'delete'],
        subtabs: {},
      },
      depositos: {
        slug: 'depositos',
        name: 'Depósitos',
        tabId: 'b0000000-0000-0000-0000-000000000004',
        parent: null,
        allowedActions: ['view', 'create', 'update', 'delete'],
        subtabs: {},
      },
      'config-almacen': {
        slug: 'config-almacen',
        name: 'Configuración',
        tabId: 'b0000000-0000-0000-0000-000000000005',
        parent: null,
        allowedActions: ['view', 'create', 'update', 'delete'],
        subtabs: {},
      },
    },
  },

} as const;

// ============================================
// TIPOS INFERIDOS
// ============================================

export type ModuleSlug = keyof typeof PERMISSIONS;

export type TabSlug<M extends ModuleSlug> = keyof (typeof PERMISSIONS)[M]['tabs'];

// Tipo para subtabs con autocompletado real
export type SubtabSlug<M extends ModuleSlug, T extends TabSlug<M>> = (typeof PERMISSIONS)[M]['tabs'][T] extends {
  subtabs: infer S;
}
  ? keyof S
  : never;

// Tipo helper para obtener subtabs de nivel 3 (subtabs de subtabs)
type SubSubtabSlug<M extends ModuleSlug, T extends TabSlug<M>> = {
  [ST in SubtabSlug<M, T>]: (typeof PERMISSIONS)[M]['tabs'][T] extends { subtabs: infer S }
    ? S extends Record<string, any>
      ? ST extends keyof S
        ? S[ST] extends { subtabs: infer SS }
          ? keyof SS
          : never
        : never
      : never
    : never;
}[SubtabSlug<M, T>];

// Tipo para obtener todos los slugs de tabs, subtabs y sub-subtabs de un módulo (hasta 3 niveles)
export type AllTabSlugs<M extends ModuleSlug> =
  | TabSlug<M> // Nivel 1: tabs principales
  | {
      [T in TabSlug<M>]: SubtabSlug<M, T>;
    }[TabSlug<M>] // Nivel 2: subtabs
  | {
      [T in TabSlug<M>]: SubSubtabSlug<M, T>;
    }[TabSlug<M>]; // Nivel 3: sub-subtabs

// Tipo helper para distribuir AllTabSlugs sobre uniones de módulos
// Esto permite que funcione correctamente cuando M es una unión como 'empleados' | 'documentacion'
export type AllTabSlugsUnion<M extends ModuleSlug> = M extends any ? AllTabSlugs<M> : never;

/** Forma mínima de una tab indexable por slug arbitrario (helpers `getTabId`/`getSubtabId`). */
type TabsByKey = Record<string, { tabId: string; subtabs?: Record<string, { tabId: string }> }>;

// Helper para obtener el tabId correcto
export function getTabId(module: ModuleSlug, tab: string): string {
  const moduleData = PERMISSIONS[module];
  if (!moduleData || !moduleData.tabs) return '';
  const tabData = (moduleData.tabs as TabsByKey)[tab];
  return tabData?.tabId || '';
}

// Helper para obtener el subtabId correcto
export function getSubtabId(module: ModuleSlug, tab: string, subtab: string): string {
  const moduleData = PERMISSIONS[module];
  if (!moduleData || !moduleData.tabs) return '';
  const tabData = (moduleData.tabs as TabsByKey)[tab];
  if (!tabData || !tabData.subtabs) return '';
  const subtabData = tabData.subtabs[subtab];
  return subtabData?.tabId || '';
}
