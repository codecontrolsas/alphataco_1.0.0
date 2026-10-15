import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Check,
  CircleSlash,
  CreditCard,
  FileSignature,
  Globe,
  GraduationCap,
  Handshake,
  Heart,
  LogOut,
  ShieldCheck,
  ShieldX,
  TrendingDown,
  TrendingUp,
  User,
  UserCheck,
  UserCircle,
  UserX,
  Users,
  X,
  XCircle,
  XOctagon,
} from 'lucide-react';

export const employeeStatusIcons: Record<string, LucideIcon> = {
  Avalado: ShieldCheck,
  No_avalado: ShieldX,
  Incompleto: X,
  Completo: Check,
  Completo_con_doc_vencida: AlertTriangle,
};

export const genderIcons: Record<string, LucideIcon> = {
  Masculino: User,
  Femenino: UserCircle,
  No_Declarado: Users,
};

export const nationalityIcons: Record<string, LucideIcon> = {
  Argentina: Globe,
  Extranjero: Globe,
};

export const documentTypeIcons: Record<string, LucideIcon> = {
  DNI: CreditCard,
  LE: CreditCard,
  LC: CreditCard,
  PASAPORTE: Globe,
};

export const maritalStatusIcons: Record<string, LucideIcon> = {
  Casado: Heart,
  Soltero: User,
  Divorciado: UserX,
  Viudo: UserX,
  Separado: Users,
  Union_de_hecho: Heart,
};

export const levelOfEducationIcons: Record<string, LucideIcon> = {
  Primario: GraduationCap,
  Secundario: GraduationCap,
  Terciario: GraduationCap,
  Universitario: GraduationCap,
  PosGrado: GraduationCap,
};

export const costTypeIcons: Record<string, LucideIcon> = {
  Directo: TrendingUp,
  Indirecto: TrendingDown,
};

export const affiliateStatusIcons: Record<string, LucideIcon> = {
  Dentro_de_convenio: UserCheck,
  Fuera_de_convenio: UserX,
};

export const reasonForTerminationIcons: Record<string, LucideIcon> = {
  Despido_sin_causa: XOctagon,
  Renuncia: LogOut,
  Despido_con_causa: XCircle,
  Acuerdo_de_partes: Handshake,
  Fin_de_contrato: FileSignature,
  Fallecimiento: CircleSlash,
};
