'use client';

import { createContext, useContext } from 'react';

/** Superficie en la que se está mostrando un `ResponsiveDialog`. */
export type ResponsiveDialogSurface = 'dialog' | 'sheet' | 'drawer' | 'fullscreen';

export type ResponsiveDialogContextValue = { surface: ResponsiveDialogSurface };

/**
 * Lo publica `ResponsiveDialog` para sus hijos. `DatePicker` y `SearchSelect` lo leen para abrir su panel
 * mobile como drawer anidado cuando ya están dentro de un drawer (un Popover ahí pelearía con el arrastre
 * y el foco atrapado de vaul). Vive aparte para que esos primitivos no dependan del `ResponsiveDialog`.
 */
export const ResponsiveDialogContext = createContext<ResponsiveDialogContextValue | null>(null);

/** Superficie del `ResponsiveDialog` que contiene al componente, o `null` si no está dentro de uno. */
export function useResponsiveDialogSurface(): ResponsiveDialogSurface | null {
  return useContext(ResponsiveDialogContext)?.surface ?? null;
}
