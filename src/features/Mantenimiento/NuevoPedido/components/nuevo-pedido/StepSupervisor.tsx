'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, User } from 'lucide-react';
import type { CurrentUserForSupervisorCheck } from '../../actions/queries.server';
import type { SupervisorOption } from './types';

export interface StepSupervisorProps {
  currentUser: CurrentUserForSupervisorCheck | undefined;
  isCurrentUserSupervisor: boolean | null;
  isLoadingCurrentUser: boolean;
  isLoadingSupervisors: boolean;
  /** La carga de supervisores falló: se avisa y se ofrece reintentar en vez de mostrar una lista vacía. */
  hasSupervisorsError?: boolean;
  refetchSupervisors?: () => void;
  selectedSupervisor: SupervisorOption | undefined;
  selectedSupervisorId: string;
  setIsCurrentUserSupervisor: (value: boolean | null) => void;
  setSelectedSupervisorId: (value: string) => void;
  setSupervisorOpen: (value: boolean) => void;
  skipSupervisorQuestion: boolean;
  supervisorOpen: boolean;
  supervisors: SupervisorOption[];
}

/** Paso "Supervisor": el usuario declara si es supervisor o elige al de turno. */
export function StepSupervisor({
  currentUser,
  isCurrentUserSupervisor,
  isLoadingCurrentUser,
  isLoadingSupervisors,
  hasSupervisorsError = false,
  refetchSupervisors,
  selectedSupervisor,
  selectedSupervisorId,
  setIsCurrentUserSupervisor,
  setSelectedSupervisorId,
  setSupervisorOpen,
  skipSupervisorQuestion,
  supervisorOpen,
  supervisors,
}: StepSupervisorProps) {
  return (
    <div className="space-y-4">
      {/* Pregunta inicial: ¿Eres el supervisor? (omitir si skipSupervisorQuestion) */}
      {isLoadingCurrentUser ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          {!skipSupervisorQuestion && (
            <div className="space-y-3">
              <Label id="is-supervisor-label" className="text-base font-medium">
                ¿Eres el supervisor de este pedido?
              </Label>
              <p className="text-sm text-muted-foreground">
                Si eres el supervisor, el pedido se creará directamente. Si no lo eres, el pedido deberá ser aprobado
                por el supervisor que selecciones.
              </p>
              <div role="group" aria-labelledby="is-supervisor-label" className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant={isCurrentUserSupervisor === true ? 'success' : 'outline'}
                  aria-pressed={isCurrentUserSupervisor === true}
                  className="h-12 flex-1 text-base"
                  onClick={() => {
                    setIsCurrentUserSupervisor(true);
                    setSelectedSupervisorId('');
                  }}
                >
                  <Check aria-hidden="true" className="mr-2 h-4 w-4" />
                  Sí, soy el supervisor
                </Button>
                <Button
                  type="button"
                  variant={isCurrentUserSupervisor === false ? 'default' : 'outline'}
                  aria-pressed={isCurrentUserSupervisor === false}
                  className="h-12 flex-1 text-base"
                  onClick={() => {
                    setIsCurrentUserSupervisor(false);
                  }}
                >
                  <User aria-hidden="true" className="mr-2 h-4 w-4" />
                  No, seleccionaré uno
                </Button>
              </div>
            </div>
          )}

          {skipSupervisorQuestion && (
            <div className="space-y-3">
              <Label className="text-base font-medium">Seleccionar Supervisor</Label>
            </div>
          )}

          {/* Si ES supervisor: mostrar información del usuario actual */}
          {isCurrentUserSupervisor === true && currentUser && (
            <Card className="mt-4 border-ok/30 bg-ok-subtle text-ok-subtle-foreground">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ok/15">
                    <User aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{currentUser.fullname}</p>
                    <p className="text-sm opacity-80">{currentUser.email}</p>
                    <Badge variant="success" className="mt-1">
                      Supervisor del pedido
                    </Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm">
                  El pedido se creará directamente y aparecerá en &quot;Pedidos de Mantenimiento&quot; →
                  &quot;Pendientes&quot;.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Si NO es supervisor: mostrar selector */}
          {isCurrentUserSupervisor === false && (
            <div className="mt-4 space-y-3">
              <Label>Selecciona el supervisor de turno</Label>
              <div className="mb-3 rounded-lg border border-info/30 bg-info-subtle p-3">
                <p className="text-sm text-info-subtle-foreground">
                  La solicitud será enviada al supervisor para su aprobación. Una vez aprobada, pasará a &quot;Pedidos
                  de Mantenimiento&quot;.
                </p>
              </div>

              {isLoadingSupervisors ? (
                <Skeleton className="h-12 w-full" />
              ) : hasSupervisorsError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-danger-subtle p-3 text-sm text-danger-subtle-foreground"
                >
                  No se pudo cargar la lista de supervisores.
                  {refetchSupervisors && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="ml-1 h-auto p-0 text-sm"
                      onClick={refetchSupervisors}
                    >
                      Reintentar
                    </Button>
                  )}
                </div>
              ) : supervisors.length === 0 ? (
                <div role="status" className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  No hay supervisores configurados para la empresa de este equipo. Avisá a tu responsable.
                </div>
              ) : (
                <Popover open={supervisorOpen} onOpenChange={setSupervisorOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={supervisorOpen}
                      className="h-12 w-full justify-between text-base"
                    >
                      {selectedSupervisor ? selectedSupervisor.fullName : 'Selecciona un supervisor'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar supervisor..." />
                      <CommandList>
                        <CommandEmpty>No se encontró supervisor</CommandEmpty>
                        <CommandGroup>
                          {supervisors.map((supervisor) => (
                            <CommandItem
                              key={supervisor.id}
                              className={cn('min-h-12', !supervisor.isAvailable && 'opacity-50')}
                              value={supervisor.fullName}
                              disabled={!supervisor.isAvailable}
                              onSelect={() => {
                                if (!supervisor.isAvailable) return;
                                setSelectedSupervisorId(supervisor.id);
                                setSupervisorOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  supervisor.id === selectedSupervisorId ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span>{supervisor.fullName}</span>
                                  {!supervisor.hasLinkedEmployee && (
                                    <Badge variant="outline" className="text-xs">
                                      Sin empleado vinculado
                                    </Badge>
                                  )}
                                  {supervisor.hasLinkedEmployee && !supervisor.hasActiveDiagram && (
                                    <Badge variant="warning" className="text-xs">
                                      Sin diagrama activo
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-sm text-muted-foreground">{supervisor.email}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}

              {selectedSupervisor && (
                <Card className="mt-4">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{selectedSupervisor.fullName}</p>
                        <p className="text-sm text-muted-foreground">{selectedSupervisor.email}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
