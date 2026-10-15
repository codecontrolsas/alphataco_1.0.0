/**
 * TabsManager Feature
 *
 * Sistema unificado de pestañas con estado en URL.
 * Soporta anidamiento, limpieza automática de parámetros y futura validación de roles.
 */

export { SectionManagerServer } from './SectionManagerServer';
export { TabsManagerClient } from './TabsManagerClient';
export { TabsManagerClientSide } from './TabsManagerClientSide';
export { TabsManagerServer } from './TabsManagerServer';
export { ViewManagerServer } from './ViewManagerServer';
export type {
  SectionManagerServerProps,
  TabDefinition,
  TabsManagerClientProps,
  TabsManagerServerProps,
  TabsManagerVariant,
  ViewDefinition,
  ViewManagerServerProps,
} from './types';
