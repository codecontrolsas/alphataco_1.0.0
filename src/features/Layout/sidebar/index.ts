/**
 * Sidebar Feature - Exports centralizados
 */

// Componentes
export { AppSidebar } from './AppSidebar';
export { NavMain } from './components/NavMain';

// Constants
export { SUB_ITEM_ICONS, navigationLinks } from './constants/navigation';
export type { NavigationLink, NavigationSubLink } from './constants/navigation';

// Types
export type { AccessibleModule, CompanyRow } from './types/types';

// Utils
export { buildSidebarItems, createLinkRegex, findBestMatch, resolveActiveTab } from './utils/sidebar.utils';
export { resolveVisibleTabs } from './utils/tabs-visibility';
