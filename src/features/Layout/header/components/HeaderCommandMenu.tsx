'use client';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useRouter } from 'next/navigation';
import { SUB_ITEM_ICONS, subLinkHref, subLinkKey, type NavigationLink } from '../../sidebar/constants/navigation';

interface HeaderCommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Módulos visibles para el usuario, con sus secciones ya recortadas por permisos. */
  items: NavigationLink[];
}

/** Menú "Ir a…": un grupo por módulo con sus secciones. Se carga recién al primer uso. */
export default function HeaderCommandMenu({ open, onOpenChange, items }: HeaderCommandMenuProps) {
  const router = useRouter();

  const go = (href: string, newTab = false) => {
    onOpenChange(false);
    if (newTab) {
      window.open(href, '_blank', 'noopener');
      return;
    }
    router.push(href);
  };

  return (
    <CommandDialog
      filter={matchesEveryWord}
      open={open}
      onOpenChange={onOpenChange}
      title="Ir a un módulo o sección"
      description="Buscá un módulo o una sección y presioná Enter para abrirlo."
    >
      <CommandInput placeholder="Buscá un módulo o una sección…" />
      <CommandList>
        <CommandEmpty>No hay coincidencias</CommandEmpty>
        {items.map((module) => {
          const ModuleIcon = module.icon;
          const subItems = module.items ?? [];

          return (
            <CommandGroup key={module.moduleSlug} heading={module.name}>
              {subItems.length === 0 ? (
                <CommandItem value={module.name} onSelect={() => go(module.href)}>
                  <ModuleIcon />
                  {module.name}
                </CommandItem>
              ) : (
                subItems.map((sub) => {
                  const key = subLinkKey(sub);
                  const Icon = SUB_ITEM_ICONS[`${module.moduleSlug}:${key}`] ?? ModuleIcon;

                  return (
                    <CommandItem
                      key={key}
                      value={`${module.name} ${sub.name}`}
                      onSelect={() => go(subLinkHref(module.href, sub), sub.newTab)}
                    >
                      <Icon />
                      {sub.name}
                    </CommandItem>
                  );
                })
              )}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}

/** Sin mayúsculas ni acentos: "seleccion" encuentra "Selección". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Coincidencia por palabras: cada palabra buscada tiene que aparecer en "módulo sección".
 * La coincidencia difusa de cmdk por defecto mostraba resultados sin relación (con "remit"
 * aparecían Vencimientos, Movimientos y Mantenimiento).
 */
function matchesEveryWord(value: string, search: string): number {
  const haystack = normalize(value);
  const words = normalize(search).split(/\s+/).filter(Boolean);
  return words.every((word) => haystack.includes(word)) ? 1 : 0;
}
