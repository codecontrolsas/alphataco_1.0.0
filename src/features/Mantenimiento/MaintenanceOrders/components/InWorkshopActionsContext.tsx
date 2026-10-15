'use client';

import { createContext, useContext } from 'react';

export interface InWorkshopActions {
  /** Abre el wizard de gestión de la orden (lo monta la tabla, que es dueña del diálogo). */
  manageOrder: (orderId: string) => void;
  /** Mientras se cargan los datos de gestión: evita un segundo clic. */
  isManageLoading: boolean;
}

const InWorkshopActionsContext = createContext<InWorkshopActions | null>(null);

export const InWorkshopActionsProvider = InWorkshopActionsContext.Provider;

/** Acciones de la tabla "En Taller" para la banda y las tarjetas, que se renderizan desde el servidor. */
export function useInWorkshopActions(): InWorkshopActions {
  const actions = useContext(InWorkshopActionsContext);
  if (!actions) throw new Error('useInWorkshopActions debe usarse dentro de la tabla "En Taller"');
  return actions;
}
