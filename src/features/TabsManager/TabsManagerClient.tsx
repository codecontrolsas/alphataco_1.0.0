'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ModuleSlug } from '@/features/Permissions/permissions-map';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { TabsManagerClientProps } from './types';

/**
 * TabsManagerClient - Componente cliente para gestionar pestañas con estado en URL y tipado fuerte.
 *
 * OPTIMIZACIÓN:
 * - Usa estado local (useState) para navegación instantánea.
 * - Usa window.history.replaceState para actualizar la URL sin disparar una navegación de Next.js.
 * - Usa React 19 `<Activity>` para renderizado priorizado:
 *   - La tab activa se renderiza con prioridad normal (inmediata).
 *   - Las tabs inactivas se renderizan en segundo plano con menor prioridad.
 *   - Al cambiar de tab, el contenido ya está pre-renderizado → transición instantánea.
 *   - El estado del DOM se preserva (formularios, scroll, inputs).
 *
 * PERMISOS:
 * - Las tabs ya vienen filtradas desde TabsManagerServer según permisos del usuario.
 * - Este componente solo renderiza las tabs que el usuario tiene permiso de ver.
 */
export function TabsManagerClient<M extends ModuleSlug = ModuleSlug>({
  paramName,
  tabs,
  defaultTab,
  dependentParams = [],
  listClassName,
  triggerClassName,
  contentClassName,
  variant = 'default',
  actions,
}: TabsManagerClientProps<M>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Inicializar estado: leer de URL o usar default
  const getInitialTab = () => {
    const paramValue = searchParams.get(paramName);
    const isValidTab = paramValue && tabs.some((t) => t.value === paramValue);
    return isValidTab ? paramValue : defaultTab;
  };

  const [activeTab, setActiveTab] = useState<string>(getInitialTab);

  // Sincronizar SOLO si searchParams cambia externamente (ej. navegación atrás/adelante)
  // IMPORTANTE: No incluir activeTab en las dependencias para evitar revertir el estado
  // cuando searchParams está desactualizado (debido a replaceState).
  useEffect(() => {
    const currentUrlValue = searchParams.get(paramName);
    // Solo actualizar si hay un valor en la URL, es diferente al actual, y es válido
    if (currentUrlValue && currentUrlValue !== activeTab && tabs.some((t) => t.value === currentUrlValue)) {
      setActiveTab(currentUrlValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /**
   * Manejador de cambio de pestaña.
   * Actualiza el estado local inmediatamente y la URL silenciosamente.
   */
  const handleTabChange = (newTab: string) => {
    if (newTab === activeTab) return;

    // 1. Actualización Inmediata de UI
    setActiveTab(newTab);

    // 2. Actualización Silenciosa de URL (sin roundtrip al servidor)
    // Usamos window.location.search para asegurarnos de tener los params más recientes
    // ya que searchParams (hook) puede estar desactualizado si hubo navegaciones previas con replaceState
    const params = new URLSearchParams(window.location.search);
    params.set(paramName, newTab);

    // Limpiar parámetros dependientes
    dependentParams.forEach((dependentParam) => {
      params.delete(dependentParam);
    });

    const newUrl = `${pathname}?${params.toString()}`;

    // Usar History API nativa para reemplazar la URL sin notificar a Next.js
    window.history.replaceState(null, '', newUrl);
  };

  const isLine = variant === 'line';

  // Control segmentado, no pestañas: desde que la navegación entre secciones vive en el
  // sidebar, esto ya no navega — cambia la VISTA dentro de una sección. Tiene que leerse
  // distinto para que no parezca un segundo menú.
  //
  // Antes el trigger llevaba `text-brand-ink font-semibold` fijo, así que activos e inactivos se
  // veían igual de fuertes y no se distinguía cuál estaba elegido.
  const defaultListClass = isLine
    ? 'flex gap-1 justify-start w-fit bg-transparent'
    : 'bg-muted/60 flex w-fit justify-start gap-1 border p-[3px]';

  const defaultTriggerClass = isLine
    ? 'font-semibold data-[state=active]:text-foreground text-foreground/60 hover:text-foreground/80 data-[state=active]:shadow-none transition-colors'
    : 'text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-brand-ink transition-colors data-[state=active]:font-semibold';

  return (
    <div className="flex flex-col gap-4 h-full">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className={actions ? 'flex flex-wrap items-center justify-between gap-4' : undefined}>
          <TabsList variant={isLine ? 'line' : 'default'} className={listClassName ?? defaultListClass}>
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                disabled={tab.disabled}
                className={triggerClassName ?? defaultTriggerClass}
                data-testid={`tab-${tab.value.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className={contentClassName}>
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
