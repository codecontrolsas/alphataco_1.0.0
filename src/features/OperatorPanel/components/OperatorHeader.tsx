'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getWorkOrdersForOperator } from '@/features/OperatorPanel/actions/queries.server';
import { operatorLogout, setActiveOperatorSector } from '@/features/OperatorPanel/actions/session.server';
import { useOperatorContext } from '@/features/OperatorPanel/components/operator-layout-provider';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, LogOut, Wrench } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

const logger = new Logger('OperatorPanel/OperatorHeader');

export function OperatorHeader() {
  const context = useOperatorContext();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [isSwitching, startTransition] = useTransition();

  const { data: workOrders } = useQuery({
    queryKey: ['operator-work-orders', context.sectorId],
    queryFn: () => getWorkOrdersForOperator(context.sectorId),
  });

  const activeCount = workOrders?.filter((wo) => !wo.is_blocked).length ?? 0;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await operatorLogout();
    } catch (error) {
      logger.error('Logout error', { data: { error } });
      setIsLoggingOut(false);
    }
  };

  const handleSelectSector = (sectorId: string) => {
    if (sectorId === context.sectorId) {
      setPopoverOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await setActiveOperatorSector(sectorId);
      if (result.error) {
        logger.error('Error al cambiar sector activo', { data: { error: result.error } });
        toast.error('No se pudo cambiar de sector. Probá de nuevo.');
        return;
      }
      setPopoverOpen(false);
      // Reload para que todas las queries del panel re-ejecuten con el nuevo sector
      window.location.reload();
    });
  };

  const hasMultipleSectors = context.sectors.length > 1;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between px-4 sm:h-16 sm:px-6">
        <div className="flex flex-1 items-center gap-2.5 sm:gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 sm:h-10 sm:w-10">
            <Wrench className="h-4.5 w-4.5 text-primary sm:h-5 sm:w-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold sm:text-base">{context.employeeName}</span>
              {activeCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs tabular-nums">
                  {activeCount} OT
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              {hasMultipleSectors ? (
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isSwitching}
                      aria-label={`Sector activo: ${context.sectorName}. Cambiar de sector`}
                      className="inline-flex min-h-11 items-center gap-1 rounded-md hover:bg-accent hover:text-accent-foreground px-1.5 py-0.5 -ml-1.5 transition-colors disabled:opacity-50"
                    >
                      <span>{context.sectorName}</span>
                      <span className="hidden sm:inline"> · {context.workshopName}</span>
                      <ChevronsUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar sector..." />
                      <CommandList>
                        <CommandEmpty>Sin sectores asignados.</CommandEmpty>
                        <CommandGroup>
                          {context.sectors.map((sector) => (
                            <CommandItem
                              className="min-h-11"
                              key={sector.sectorId}
                              value={`${sector.sectorName} ${sector.workshopName}`}
                              onSelect={() => handleSelectSector(sector.sectorId)}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  sector.sectorId === context.sectorId ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="text-sm">{sector.sectorName}</span>
                                <span className="text-sm text-muted-foreground">{sector.workshopName}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              ) : (
                <>
                  <span>{context.sectorName}</span>
                  <span className="hidden sm:inline"> · {context.workshopName}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-label="Salir"
          className="h-11 min-w-11 gap-2"
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
          <span className="hidden sm:inline">Salir</span>
        </Button>
      </div>
    </header>
  );
}
