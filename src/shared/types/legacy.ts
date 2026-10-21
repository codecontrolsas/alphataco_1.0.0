

export type profileUser = {
  id?: string;
  created_at?: string;
  firstname: string;
  lastname: string;
  credential_id: string;
  email: string;
  avatar?: string;
  fullname?: string;
  role: string;
};

export type company = {
  id?: string;
  company_name: string;
  company_cuit: string;
  description: string;
  website: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  city: {
    id: number;
    name: string;
  };
  country: string;
  industry: string;
  company_logo: string;
  province_id: {
    id: number;
    name: string;
  };
  by_defect: boolean;
  owner_id: string | undefined;
};

export type industry_type = {
  id: number;
  name: string;
}[];

export type login = {
  email: string;
  password: string;
};

export type names =
  | 'lastname'
  | 'firstname'
  | 'nationality'
  | 'cuil'
  | 'document_type'
  | 'document_number'
  | 'birthplace'
  | 'gender'
  | 'marital_status'
  | 'level_of_education'
  | 'picture'
  | 'covenants_id'
  | 'category_id'
  | 'guild_id';

export type Employee = {
  id?: string;
  lastname: string;
  covenants_id: string | undefined;
  category_id: string | undefined;
  guild_id: string | undefined;
  firstname: string;
  nationality: string | undefined;
  born_date: Date | undefined | string;
  cuil: string; //!si
  document_type: string | undefined;
  document_number: string; //!si
  birthplace: string | undefined;
  gender: string | undefined;
  marital_status: string | undefined;
  level_of_education: string | undefined; //!si
  picture?: string | undefined;
  street: string;
  street_number: string;
  province: string | undefined;
  city: string | undefined;
  postal_code: string;
  phone: string;
  email?: string; //!si
  file: undefined | null | string | number;
  hierarchical_position: string | undefined; //!si
  company_position: string; //!si
  workflow_diagram: string;
  normal_hours?: string | undefined | null; //!si
  type_of_contract?: string | undefined | null; //!si
  allocated_to?: string | string[] | null; //!si
  date_of_admission: Date | undefined | string;
  full_name?: string; //!si
  is_active?: boolean;
  reason_for_termination?: string | undefined;
  termination_date?: Date | undefined | string;
  status?: 'Avalado' | 'No avalado';
  guild?: string | null;
  covenant?: string | null;
  category?: string | null;
  aptitudes?: string[] | null;
};

export type SharedUser = {
  id: string;
  role: string;
  email: string;
  avatar: string;
  fullname: string;
  created_at: Date;
  credential_id: string;
  profile_id: profileUser;
  customer_id: {
    id: string;
    cuit: number;
    name: string;
    address: string;
    is_active: boolean;
    company_id: string;
    created_at: string;
    client_email: string;
    client_phone: number;
    termination_date: null | string;
    reason_for_termination: null | string;
  };
};

export type TypeOfVehicle = {
  id: string;
  name: string;
  created_at: string;
};

export type Brand = {
  id: string;
  name: string;
  created_at: string;
};
export type Model = {
  id: string;
  name: string;
  created_at: string;
};

export type Vechicle = {
  id: string;
  created_at: string;
  picture: string;
  type_of_vehicle: TypeOfVehicle;
  domain: string;
  chassis: string;
  engine: string;
  serie: string;
  intern_number: string;
  year: string;
  brand: Brand;
  model: Model;
  company_id: string;
  is_active: boolean;
  termination_date: string;
  reason_for_termination: string;
  user_id: string;
  status: 'Avalado' | 'No avalado';
  kilometer: string;
  type: Model;
  condition: 'operativo' | 'no operativo' | 'en reparacion' | 'operativo condicionado';
};

type Resource = Vechicle | Employee;

type DocumentType = {
  id: string;
  name: string;
  description: string;
  applies: 'Equipos' | 'Persona';
  multiresource: boolean;
  mandatory: boolean;
  expired: boolean;
  special: boolean;
  is_active: boolean;
  created_at: string;
};

type Document2 = {
  id: string;
  created_at: string;
  id_storage: string;
  id_document_types: DocumentType;
  validity: string;
  state: 'presentado' | 'rechazado' | 'aprobado' | 'vencido';
  is_active: boolean;
  user_id: string;
  applies: Resource;
  document_url: string;
};

export type Type = {
  id: string;
  name: string;
  created_at: Date;
};
export enum types {
  Texto = 'Texto',
  AreaTexto = 'Área de texto',
  Separador = 'Separador',
  NombreFormulario = 'Nombre del formulario',
  Radio = 'Radio',
  SeleccionMultiple = 'Seleccion multiple',
  Date = 'Fecha',
  Seleccion = 'Seleccion',
  SeleccionPredefinida = 'Seleccion Predefinida',
  Subtitulo = 'Subtitulo',
  SiNo = 'Si-No',
  Titulo = 'Titulo',
  Seccion = 'Seccion',
  Archivo = 'Archivo',
  Observaciones = 'Observaciones',
  SectionDate = 'SectionDate',
  SectionObservaciones = 'SectionObservaciones',
}
export interface Campo {
  tipo: types;
  placeholder?: string;
  opciones: string[];
  value?: string;
  id: string;
  title: string;
  observation?: boolean;
  date?: boolean;
  sectionCampos?: Campo[];
  formName?: string;
  required?: boolean;
  apply?: string;
}
export interface FormField {
  formName?: string;
  title: string;
  value?: string;
  tipo: string;
  opciones?: string[];
  date?: boolean;
  id: string;
  placeholder?: string;
  Observaciones?: boolean;
  observation?: boolean;
  required?: boolean;
}

export interface Document {
  date: string;
  allocated_to: string;
  documentName: string;
  multiresource: string;
  validity: string;
  id: string;
  resource: string;
  state: string;
  document_path?: string;
  is_active: boolean;
  isItMonthly: boolean;
  applies: string;
  mandatory: string;
  id_document_types?: string;
}

export interface SectionCampo {
  id: string;
  date: boolean;
  tipo: string;
  title: string;
  opciones: string[];
  required: boolean;
  observation: boolean;
  placeholder: string;
  value?: string; // opcional ya que algunos campos no tienen 'value'
}

export interface FormField {
  id: string;
  tipo: string;
  title: string;
  value?: string; // opcional ya que algunos campos no tienen 'value'
  opciones?: string[];
  placeholder?: string;
  required?: boolean; // opcional ya que algunos campos no tienen 'required'
  observation?: boolean; // opcional ya que algunos campos no tienen 'observation'
  date?: boolean; // opcional ya que algunos campos no tienen 'date'
  sectionCampos?: SectionCampo[]; // opcional ya que algunos campos no tienen 'sectionCampos'
}

export interface FormData {
  id: string;
  created_at: string;
  company_id: string;
  form: FormField[];
  name: string;
}

// Tipo para las categorías dentro de un convenio
export type Category = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  covenant_id: string;
};

export type WorkDiagram = {
  id: string;
  name: string;
  is_active: boolean;
  active_working_days: number;
  inactive_working_days: number;
  active_novelty: string | undefined;
  inactive_novelty: string | undefined;
  company_id: string;
  created_at: string;
};
export type Position = {
  id?: string;
  created_at?: string;
  name?: string;
  hierarchical_position_id?: string[];
  is_active?: boolean;
  aptitudes?: {
    id: string;
    nombre: string;
  }[];
  aptitudes_tecnicas_id?: string[];
};
