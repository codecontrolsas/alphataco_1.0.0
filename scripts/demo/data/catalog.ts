/**
 * Catalogos de la demo. Cada entrada tiene una `key` estable: el id en la base sale de
 * `demoId(<tipo>, key)`, asi los dominios se referencian entre si sin consultar la base.
 */
import { KPI_FIXED_IDS } from '../lib/ids.ts';

export const COMPANY_PROFILE = {
  name: 'Transportes Patagonia DEMO S.A.',
  cuit: '30716543214',
  description: 'Servicios de transporte y apoyo a la industria petrolera en la Cuenca Neuquina',
  email: 'administracion@patagonia-demo.com.ar',
  phone: '2994480000',
  address: 'Ruta Provincial 7 Km 5, Parque Industrial',
  industry: 'Servicios petroleros y transporte',
  website: 'https://patagonia-demo.com.ar',
};

/** Provincias y ciudades: tablas que conserva el reset, se upsertean con id fijo. */
export const PROVINCES: Array<{ id: number; name: string }> = [
  { id: 2, name: 'Neuquén' },
  { id: 3, name: 'Río Negro' },
  { id: 4, name: 'Mendoza' },
  { id: 5, name: 'La Pampa' },
  { id: 6, name: 'Chubut' },
  { id: 7, name: 'Buenos Aires' },
];

export const CITIES: Array<{ id: number; province: number; name: string }> = [
  { id: 2, province: 2, name: 'Neuquén' },
  { id: 3, province: 2, name: 'Añelo' },
  { id: 4, province: 2, name: 'Plottier' },
  { id: 5, province: 2, name: 'Centenario' },
  { id: 6, province: 2, name: 'Cutral Có' },
  { id: 7, province: 2, name: 'Plaza Huincul' },
  { id: 8, province: 2, name: 'Rincón de los Sauces' },
  { id: 9, province: 2, name: 'Zapala' },
  { id: 10, province: 3, name: 'Cipolletti' },
  { id: 11, province: 3, name: 'General Roca' },
  { id: 12, province: 3, name: 'Allen' },
  { id: 13, province: 3, name: 'Catriel' },
  { id: 14, province: 4, name: 'Malargüe' },
  { id: 15, province: 5, name: '25 de Mayo' },
  { id: 16, province: 6, name: 'Comodoro Rivadavia' },
  { id: 17, province: 7, name: 'Bahía Blanca' },
];

export const COUNTRIES = ['Argentina', 'Chile', 'Bolivia', 'Paraguay', 'Perú', 'Uruguay', 'Venezuela'];

export const MEASURE_UNITS: Array<{ id: number; unit: string; simbol: string; tipo: string }> = [
  { id: 1, unit: 'Hora', simbol: 'hs', tipo: 'Tiempo' },
  { id: 2, unit: 'Día', simbol: 'd', tipo: 'Tiempo' },
  { id: 3, unit: 'Mes', simbol: 'mes', tipo: 'Tiempo' },
  { id: 4, unit: 'Viaje', simbol: 'vje', tipo: 'Unidad' },
  { id: 5, unit: 'Kilómetro', simbol: 'km', tipo: 'Distancia' },
  { id: 6, unit: 'Metro cúbico', simbol: 'm3', tipo: 'Volumen' },
  { id: 7, unit: 'Unidad', simbol: 'u', tipo: 'Unidad' },
  { id: 8, unit: 'Tonelada', simbol: 't', tipo: 'Peso' },
];

// ── RRHH ─────────────────────────────────────────────────────────────────────

/** Sectores. `parent` = sector del que dependen en el organigrama (la raíz no tiene). */
export const HIERARCHY: Array<{ key: string; name: string; parent?: string }> = [
  { key: 'direccion', name: 'Dirección General' },
  { key: 'operaciones', name: 'Operaciones', parent: 'direccion' },
  { key: 'mantenimiento', name: 'Mantenimiento', parent: 'direccion' },
  { key: 'logistica', name: 'Logística', parent: 'direccion' },
  { key: 'hse', name: 'HSE', parent: 'direccion' },
  { key: 'administracion', name: 'Administración', parent: 'direccion' },
  { key: 'rrhh', name: 'Recursos Humanos', parent: 'direccion' },
];

export const POSITIONS = [
  { key: 'chofer', name: 'Chofer', hierarchy: ['operaciones', 'logistica'] },
  { key: 'operador', name: 'Operador de equipo', hierarchy: ['operaciones'] },
  { key: 'ayudante', name: 'Ayudante de campo', hierarchy: ['operaciones'] },
  { key: 'supervisor', name: 'Supervisor de campo', hierarchy: ['operaciones'] },
  { key: 'mecanico', name: 'Mecánico', hierarchy: ['mantenimiento'] },
  { key: 'electricista', name: 'Electricista', hierarchy: ['mantenimiento'] },
  { key: 'gomero', name: 'Gomero', hierarchy: ['mantenimiento'] },
  { key: 'jefe_taller', name: 'Jefe de taller', hierarchy: ['mantenimiento'] },
  { key: 'tecnico_hse', name: 'Técnico HSE', hierarchy: ['hse'] },
  { key: 'administrativo', name: 'Administrativo', hierarchy: ['administracion'] },
  { key: 'analista_rrhh', name: 'Analista de RRHH', hierarchy: ['rrhh'] },
  { key: 'jefe_base', name: 'Jefe de base', hierarchy: ['operaciones'] },
  // Conducción: un solo titular cada uno (van al final para no mover el orden de los legajos de campo).
  { key: 'gerente_general', name: 'Gerente General', hierarchy: ['direccion'] },
  { key: 'gerente_operaciones', name: 'Gerente de Operaciones', hierarchy: ['operaciones'] },
  { key: 'coordinador_logistica', name: 'Coordinador de Logística', hierarchy: ['logistica'] },
  { key: 'gerente_administracion', name: 'Gerente de Administración', hierarchy: ['administracion'] },
  { key: 'jefe_rrhh', name: 'Jefe de RRHH', hierarchy: ['rrhh'] },
  { key: 'responsable_hse', name: 'Responsable HSE', hierarchy: ['hse'] },
] as const;

/** Puestos de conducción: un legajo cada uno, siempre activo. */
export const MANAGEMENT_POSITIONS = [
  'gerente_general',
  'gerente_operaciones',
  'coordinador_logistica',
  'gerente_administracion',
  'jefe_rrhh',
  'responsable_hse',
] as const satisfies readonly (typeof POSITIONS)[number]['key'][];

export type PositionKey = (typeof POSITIONS)[number]['key'];

/** Cuantos empleados de cada puesto (suman ~120). */
export const POSITION_HEADCOUNT: Record<PositionKey, number> = {
  chofer: 46,
  operador: 16,
  ayudante: 18,
  supervisor: 6,
  mecanico: 9,
  electricista: 3,
  gomero: 3,
  jefe_taller: 1,
  tecnico_hse: 4,
  administrativo: 7,
  analista_rrhh: 3,
  jefe_base: 2,
  gerente_general: 1,
  gerente_operaciones: 1,
  coordinador_logistica: 1,
  gerente_administracion: 1,
  jefe_rrhh: 1,
  responsable_hse: 1,
};

/** Cargo del organigrama. `reportsTo` = `key` del cargo superior; el titular se elige entre los legajos activos con ese sector y puesto. */
export interface OrgChartSeedPosition {
  key: string;
  sector: string;
  position: PositionKey;
  reportsTo?: string;
}

/** Organigrama de la demo: 4 niveles de cargos (Gerente General > Gerente de Operaciones > Jefe de base > Supervisor de campo). */
export const ORG_CHART: OrgChartSeedPosition[] = [
  { key: 'gg', sector: 'direccion', position: 'gerente_general' },
  // Operaciones
  { key: 'gte_ops', sector: 'operaciones', position: 'gerente_operaciones', reportsTo: 'gg' },
  { key: 'base_anelo', sector: 'operaciones', position: 'jefe_base', reportsTo: 'gte_ops' },
  { key: 'base_rincon', sector: 'operaciones', position: 'jefe_base', reportsTo: 'gte_ops' },
  { key: 'sup_anelo_1', sector: 'operaciones', position: 'supervisor', reportsTo: 'base_anelo' },
  { key: 'sup_anelo_2', sector: 'operaciones', position: 'supervisor', reportsTo: 'base_anelo' },
  { key: 'sup_rincon_1', sector: 'operaciones', position: 'supervisor', reportsTo: 'base_rincon' },
  { key: 'sup_rincon_2', sector: 'operaciones', position: 'supervisor', reportsTo: 'base_rincon' },
  // Logística
  { key: 'coord_log', sector: 'logistica', position: 'coordinador_logistica', reportsTo: 'gte_ops' },
  { key: 'chofer_log', sector: 'logistica', position: 'chofer', reportsTo: 'coord_log' },
  // Mantenimiento
  { key: 'jefe_taller', sector: 'mantenimiento', position: 'jefe_taller', reportsTo: 'gg' },
  { key: 'mecanico', sector: 'mantenimiento', position: 'mecanico', reportsTo: 'jefe_taller' },
  { key: 'electricista', sector: 'mantenimiento', position: 'electricista', reportsTo: 'jefe_taller' },
  { key: 'gomero', sector: 'mantenimiento', position: 'gomero', reportsTo: 'jefe_taller' },
  // HSE
  { key: 'resp_hse', sector: 'hse', position: 'responsable_hse', reportsTo: 'gg' },
  { key: 'tecnico_hse', sector: 'hse', position: 'tecnico_hse', reportsTo: 'resp_hse' },
  // Recursos Humanos
  { key: 'jefe_rrhh', sector: 'rrhh', position: 'jefe_rrhh', reportsTo: 'gg' },
  { key: 'analista_rrhh', sector: 'rrhh', position: 'analista_rrhh', reportsTo: 'jefe_rrhh' },
  // Administración
  { key: 'gte_admin', sector: 'administracion', position: 'gerente_administracion', reportsTo: 'gg' },
  { key: 'administrativo', sector: 'administracion', position: 'administrativo', reportsTo: 'gte_admin' },
];

export const COST_CENTERS = [
  { key: 'anelo', name: 'CC Operaciones Añelo' },
  { key: 'rincon', name: 'CC Operaciones Rincón de los Sauces' },
  { key: 'taller', name: 'CC Taller y Mantenimiento' },
  { key: 'admin', name: 'CC Administración Central' },
];

export const GUILDS = [
  { key: 'petroleros', name: 'Sindicato de Petroleros Privados de Río Negro, Neuquén y La Pampa' },
  { key: 'camioneros', name: 'Sindicato de Choferes de Camiones' },
  { key: 'comercio', name: 'Sindicato de Empleados de Comercio' },
];

export const COVENANTS = [
  { key: 'cct644', guild: 'petroleros', name: 'CCT 644/12 Petroleros' },
  { key: 'cct40', guild: 'camioneros', name: 'CCT 40/89 Camioneros' },
  { key: 'cct130', guild: 'comercio', name: 'CCT 130/75 Comercio' },
];

/**
 * Categorias. `get_kpi_range` (KPI-0002/0003) busca por nombre 'Chofer de 1°' y
 * 'Chofer de 3°': se llaman exactamente asi.
 */
export const CATEGORIES = [
  { key: 'chofer1', covenant: 'cct644', name: 'Chofer de 1°' },
  { key: 'chofer3', covenant: 'cct644', name: 'Chofer de 3°' },
  { key: 'operador', covenant: 'cct644', name: 'Operador' },
  { key: 'ayudante', covenant: 'cct644', name: 'Ayudante' },
  { key: 'oficial', covenant: 'cct644', name: 'Oficial de mantenimiento' },
  { key: 'supervisor', covenant: 'cct644', name: 'Supervisor' },
  { key: 'camion_1', covenant: 'cct40', name: 'Chofer 1ra categoría' },
  { key: 'admin_a', covenant: 'cct130', name: 'Administrativo A' },
  { key: 'admin_b', covenant: 'cct130', name: 'Administrativo B' },
];

export const CONTRACT_TYPES = [
  { key: 'indeterminado', name: 'Tiempo indeterminado' },
  { key: 'plazo_fijo', name: 'Plazo fijo' },
  { key: 'prueba', name: 'Período de prueba' },
  { key: 'eventual', name: 'Eventual' },
];

/**
 * Novedades de diagrama. `work_active` = cuenta como dia trabajado; `computes_absenteeism` =
 * suma al ausentismo (KPI-0001 y graficos de RRHH).
 */
export const DIAGRAM_TYPES = [
  { key: 'trabajando', name: 'Trabajando', short: 'T', color: '#16a34a', work: true, absent: false },
  { key: 'franco', name: 'Franco', short: 'F', color: '#94a3b8', work: false, absent: false },
  { key: 'vacaciones', name: 'Vacaciones', short: 'V', color: '#0ea5e9', work: false, absent: false },
  { key: 'enfermedad', name: 'Licencia por enfermedad', short: 'LE', color: '#f97316', work: false, absent: true },
  { key: 'accidente', name: 'Accidente laboral (ART)', short: 'ART', color: '#dc2626', work: false, absent: true },
  { key: 'ausente', name: 'Ausente sin aviso', short: 'A', color: '#7f1d1d', work: false, absent: true },
  { key: 'estudio', name: 'Licencia por examen', short: 'LX', color: '#a855f7', work: false, absent: true },
  { key: 'capacitacion', name: 'Capacitación', short: 'C', color: '#0d9488', work: true, absent: false },
  { key: 'guardia', name: 'Guardia', short: 'G', color: '#ca8a04', work: true, absent: false },
] as const;

export type DiagramKey = (typeof DIAGRAM_TYPES)[number]['key'];

/** Diagramas de trabajo: ciclo de dias trabajados / francos. `weekdays` = lunes a viernes fijo. */
export const WORK_DIAGRAMS = [
  { key: '14x14', name: 'Diagrama 14x14', on: 14, off: 14 },
  { key: '7x7', name: 'Diagrama 7x7', on: 7, off: 7 },
  { key: '5x2', name: 'Lunes a viernes', on: 5, off: 2, weekdays: true },
  { key: '6x1', name: 'Diagrama 6x1', on: 6, off: 1 },
] as const;

export type WorkDiagramKey = (typeof WORK_DIAGRAMS)[number]['key'];

export const APTITUDES = [
  { key: 'manejo_defensivo', name: 'Manejo defensivo', positions: ['chofer', 'operador', 'supervisor'] },
  { key: 'izaje', name: 'Operación de hidrogrúa / izaje', positions: ['operador'] },
  { key: 'mercancias', name: 'Transporte de mercancías peligrosas', positions: ['chofer'] },
  { key: 'altura', name: 'Trabajo en altura', positions: ['ayudante', 'electricista', 'mecanico'] },
  { key: 'primeros_auxilios', name: 'Primeros auxilios', positions: ['supervisor', 'tecnico_hse', 'jefe_base'] },
  { key: 'soldadura', name: 'Soldadura', positions: ['mecanico'] },
] as const;

// ── Equipos ──────────────────────────────────────────────────────────────────

/** `types_of_vehicles`: la lista de Equipos solo muestra `type_of_vehicle = 1`. */
export const VEHICLE_KINDS = [
  { id: 1, name: 'Vehículos' },
  { id: 2, name: 'Otros' },
];

export const TYPE_OPERATIVE = [
  { key: 'liviano', name: 'Liviano' },
  { key: 'pesado', name: 'Pesado' },
  { key: 'especial', name: 'Especial' },
];

export const EQUIPMENT_TYPES = [
  {
    key: 'tractor',
    id: KPI_FIXED_IDS.typeTractor,
    name: 'Tractor',
    hitch: true,
    tractor: true,
    operative: true,
    count: 24,
    operativeKind: 'pesado',
  },
  {
    key: 'chasis',
    id: KPI_FIXED_IDS.typeChasis,
    name: 'Chasis',
    hitch: false,
    tractor: false,
    operative: true,
    count: 20,
    operativeKind: 'pesado',
  },
  {
    key: 'semirremolque',
    name: 'Semirremolque',
    hitch: true,
    tractor: false,
    operative: false,
    count: 18,
    operativeKind: 'pesado',
  },
  {
    key: 'camioneta',
    name: 'Camioneta',
    hitch: false,
    tractor: false,
    operative: true,
    count: 34,
    operativeKind: 'liviano',
  },
  {
    key: 'hidrogrua',
    name: 'Camión hidrogrúa',
    hitch: false,
    tractor: false,
    operative: true,
    count: 10,
    operativeKind: 'especial',
  },
  {
    key: 'minibus',
    name: 'Minibús',
    hitch: false,
    tractor: false,
    operative: true,
    count: 8,
    operativeKind: 'liviano',
  },
  {
    key: 'cisterna',
    name: 'Camión cisterna',
    hitch: false,
    tractor: false,
    operative: true,
    count: 6,
    operativeKind: 'especial',
  },
] as const;

export type EquipmentTypeKey = (typeof EQUIPMENT_TYPES)[number]['key'];

export const SUB_TYPES: Array<{ key: string; type: EquipmentTypeKey; name: string }> = [
  { key: 'tractor_6x4', type: 'tractor', name: 'Tractor 6x4' },
  { key: 'tractor_4x2', type: 'tractor', name: 'Tractor 4x2' },
  { key: 'chasis_volcador', type: 'chasis', name: 'Chasis con volcador' },
  { key: 'chasis_caja', type: 'chasis', name: 'Chasis con caja' },
  { key: 'semi_batea', type: 'semirremolque', name: 'Batea' },
  { key: 'semi_carretón', type: 'semirremolque', name: 'Carretón' },
  { key: 'semi_playo', type: 'semirremolque', name: 'Playo' },
  { key: 'camioneta_4x4', type: 'camioneta', name: 'Camioneta 4x4 doble cabina' },
  { key: 'camioneta_4x2', type: 'camioneta', name: 'Camioneta 4x2' },
  { key: 'hidro_20', type: 'hidrogrua', name: 'Hidrogrúa 20 t' },
  { key: 'minibus_19', type: 'minibus', name: 'Minibús 19 asientos' },
  { key: 'cisterna_agua', type: 'cisterna', name: 'Cisterna de agua' },
];

export const OTHER_EQUIPMENT_TYPES = [
  { key: 'generador', name: 'Grupo electrógeno', count: 5 },
  { key: 'torre', name: 'Torre de iluminación', count: 5 },
  { key: 'compresor', name: 'Compresor de aire', count: 3 },
  { key: 'bomba', name: 'Motobomba', count: 3 },
] as const;

/** Marcas y modelos por tipo de equipo. */
export const BRANDS: Array<{
  key: string;
  name: string;
  models: Array<{ key: string; name: string; types: string[] }>;
}> = [
  {
    key: 'mercedes',
    name: 'Mercedes-Benz',
    models: [
      { key: 'actros', name: 'Actros 2646', types: ['tractor'] },
      { key: 'atego', name: 'Atego 1726', types: ['chasis', 'hidrogrua', 'cisterna'] },
      { key: 'sprinter', name: 'Sprinter 515', types: ['minibus'] },
    ],
  },
  {
    key: 'scania',
    name: 'Scania',
    models: [
      { key: 'g410', name: 'G 410', types: ['tractor'] },
      { key: 'p310', name: 'P 310', types: ['chasis', 'hidrogrua', 'cisterna'] },
    ],
  },
  {
    key: 'iveco',
    name: 'Iveco',
    models: [
      { key: 'stralis', name: 'Stralis 490', types: ['tractor'] },
      { key: 'tector', name: 'Tector 170E28', types: ['chasis', 'cisterna'] },
      { key: 'daily', name: 'Daily 70C17', types: ['minibus'] },
    ],
  },
  { key: 'volvo', name: 'Volvo', models: [{ key: 'fh', name: 'FH 540', types: ['tractor'] }] },
  { key: 'toyota', name: 'Toyota', models: [{ key: 'hilux', name: 'Hilux SRV 2.8', types: ['camioneta'] }] },
  { key: 'ford', name: 'Ford', models: [{ key: 'ranger', name: 'Ranger XLT 3.2', types: ['camioneta'] }] },
  { key: 'volkswagen', name: 'Volkswagen', models: [{ key: 'amarok', name: 'Amarok V6', types: ['camioneta'] }] },
  { key: 'helvetica', name: 'Helvética', models: [{ key: 'batea30', name: 'Batea 30 m3', types: ['semirremolque'] }] },
  { key: 'randon', name: 'Randon', models: [{ key: 'sr3', name: 'SR 3 ejes', types: ['semirremolque'] }] },
  { key: 'caterpillar', name: 'Caterpillar', models: [{ key: 'xq60', name: 'XQ60', types: ['generador'] }] },
  {
    key: 'atlas',
    name: 'Atlas Copco',
    models: [
      { key: 'hilight', name: 'HiLight V5+', types: ['torre'] },
      { key: 'xas', name: 'XAS 185', types: ['compresor'] },
    ],
  },
  { key: 'honda', name: 'Honda', models: [{ key: 'wb30', name: 'WB30XT', types: ['bomba'] }] },
];

export const EQUIPMENT_OWNERS = [
  { key: 'leasing_patagonia', name: 'Leasing Patagonia S.A.', cuit: '30712345671', type: 'Leasing' as const },
  { key: 'rental_sur', name: 'Rental del Sur S.R.L.', cuit: '30714567892', type: 'Alquiler' as const },
  { key: 'banco_comahue', name: 'Banco del Comahue', cuit: '30500012343', type: 'Prendado' as const },
];

// ── Documentos ───────────────────────────────────────────────────────────────

export interface DocTypeDef {
  key: string;
  name: string;
  applies: 'Persona' | 'Equipos' | 'Empresa';
  /** Vence (lleva fecha de vigencia). */
  expires: boolean;
  /** Dias de vigencia tipica cuando se renueva. */
  validityDays?: number;
  mandatory: boolean;
  monthly?: boolean;
  private?: boolean;
  policy?: boolean;
  preFile?: boolean;
  description: string;
}

export const DOC_TYPES: DocTypeDef[] = [
  {
    key: 'dni',
    name: 'DNI',
    applies: 'Persona',
    expires: false,
    mandatory: true,
    preFile: true,
    description: 'Documento Nacional de Identidad (frente y dorso)',
  },
  {
    key: 'alta_temprana',
    name: 'Alta temprana AFIP',
    applies: 'Persona',
    expires: false,
    mandatory: true,
    description: 'Constancia de alta en el Sistema de Simplificación Registral',
  },
  {
    key: 'apto_medico',
    name: 'Apto psicofísico',
    applies: 'Persona',
    expires: true,
    validityDays: 365,
    mandatory: true,
    preFile: true,
    description: 'Examen preocupacional o periódico',
  },
  {
    key: 'licencia',
    name: 'Licencia de conducir',
    applies: 'Persona',
    expires: true,
    validityDays: 730,
    mandatory: true,
    description: 'Licencia nacional de conducir con categoría habilitante',
  },
  {
    key: 'manejo_defensivo',
    name: 'Curso de manejo defensivo',
    applies: 'Persona',
    expires: true,
    validityDays: 730,
    mandatory: true,
    description: 'Certificado de aprobación del curso de manejo defensivo',
  },
  {
    key: 'induccion_hse',
    name: 'Inducción HSE',
    applies: 'Persona',
    expires: true,
    validityDays: 365,
    mandatory: true,
    description: 'Inducción de seguridad, salud y medio ambiente',
  },
  {
    key: 'antecedentes',
    name: 'Certificado de antecedentes penales',
    applies: 'Persona',
    expires: true,
    validityDays: 180,
    mandatory: false,
    preFile: true,
    description: 'Certificado del Registro Nacional de Reincidencia',
  },
  {
    key: 'recibo',
    name: 'Recibo de sueldo',
    applies: 'Persona',
    expires: false,
    mandatory: false,
    monthly: true,
    private: true,
    description: 'Recibo de haberes mensual firmado',
  },
  {
    key: 'art_nomina',
    name: 'Nómina ART',
    applies: 'Persona',
    expires: false,
    mandatory: false,
    monthly: true,
    description: 'Constancia de cobertura en la nómina de la ART',
  },

  {
    key: 'titulo',
    name: 'Título del automotor',
    applies: 'Equipos',
    expires: false,
    mandatory: true,
    description: 'Título de propiedad del automotor',
  },
  {
    key: 'cedula',
    name: 'Cédula de identificación',
    applies: 'Equipos',
    expires: true,
    validityDays: 730,
    mandatory: true,
    description: 'Cédula verde de identificación del automotor',
  },
  {
    key: 'seguro',
    name: 'Póliza de seguro',
    applies: 'Equipos',
    expires: true,
    validityDays: 180,
    mandatory: true,
    policy: true,
    description: 'Póliza de responsabilidad civil y daños',
  },
  {
    key: 'vtv',
    name: 'RTO / VTV',
    applies: 'Equipos',
    expires: true,
    validityDays: 365,
    mandatory: true,
    description: 'Revisión técnica obligatoria',
  },
  {
    key: 'ruta',
    name: 'Habilitación RUTA',
    applies: 'Equipos',
    expires: true,
    validityDays: 365,
    mandatory: true,
    description: 'Registro Único del Transporte Automotor de cargas',
  },
  {
    key: 'pago_seguro',
    name: 'Comprobante de pago de seguro',
    applies: 'Equipos',
    expires: false,
    mandatory: false,
    monthly: true,
    description: 'Comprobante mensual de pago de la póliza',
  },

  {
    key: 'afip',
    name: 'Constancia de inscripción AFIP',
    applies: 'Empresa',
    expires: false,
    mandatory: true,
    description: 'Constancia de inscripción en AFIP',
  },
  {
    key: 'art_empresa',
    name: 'Certificado de cobertura ART',
    applies: 'Empresa',
    expires: true,
    validityDays: 180,
    mandatory: true,
    description: 'Certificado de cobertura de la aseguradora de riesgos del trabajo',
  },
  {
    key: 'rc',
    name: 'Póliza de responsabilidad civil',
    applies: 'Empresa',
    expires: true,
    validityDays: 365,
    mandatory: true,
    description: 'Póliza de responsabilidad civil general',
  },
  {
    key: 'habilitacion',
    name: 'Habilitación municipal',
    applies: 'Empresa',
    expires: true,
    validityDays: 730,
    mandatory: true,
    description: 'Habilitación comercial de la base operativa',
  },
  {
    key: 'iso',
    name: 'Certificado ISO 9001',
    applies: 'Empresa',
    expires: true,
    validityDays: 1095,
    mandatory: false,
    description: 'Certificación del sistema de gestión de calidad',
  },
  {
    key: 'f931',
    name: 'Formulario 931',
    applies: 'Empresa',
    expires: false,
    mandatory: false,
    monthly: true,
    description: 'Declaración jurada de cargas sociales',
  },
];
