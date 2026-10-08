import {
  Boxes,
  BriefcaseBusiness,
  ClipboardCheck,
  ClipboardList,
  Compass,
  FileText,
  HardHat,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  Truck,
  UserPlus,
  Users,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { SectionIcon } from '../catalog/types';

/** Traducción del nombre de ícono del catálogo (puro, sin React) a un ícono real. */
export const SECTION_ICONS: Record<SectionIcon, LucideIcon> = {
  start: Compass,
  process: Workflow,
  dashboard: LayoutDashboard,
  employees: Users,
  recruitment: UserPlus,
  equipment: Truck,
  commercial: BriefcaseBusiness,
  documents: FileText,
  operations: ClipboardList,
  maintenance: Wrench,
  warehouse: Boxes,
  forms: ClipboardCheck,
  help: LifeBuoy,
  settings: Settings,
  field: HardHat,
};
