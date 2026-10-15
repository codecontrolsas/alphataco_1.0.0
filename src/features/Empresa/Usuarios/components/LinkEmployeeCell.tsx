'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2, Search, Unlink, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { searchEmployeesForLink } from '../lookups.server';
import { linkEmployeeToProfile } from '../mutations.server';
import { COMPANY_USERS_QUERY_KEY } from '../table/UserStatusCell';

const logger = new Logger('LinkEmployeeCell');

interface LinkEmployeeCellProps {
  profileId: string;
  employee:
    | {
        id: string;
        firstname: string;
        lastname: string;
        cuil: string;
      }
    | null
    | undefined;
}

type EmployeeSearchResult = Awaited<ReturnType<typeof searchEmployeesForLink>>[number];

function getInitials(firstname: string | null, lastname: string | null): string {
  const f = firstname?.charAt(0)?.toUpperCase() ?? '';
  const l = lastname?.charAt(0)?.toUpperCase() ?? '';
  return `${l}${f}` || '??';
}

export function LinkEmployeeCell({ profileId, employee }: LinkEmployeeCellProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<EmployeeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const queryClient = useQueryClient();

  const handleSearch = useCallback(async () => {
    if (searchQuery.length < 2) return;
    setIsSearching(true);
    setHasSearched(true);
    try {
      const data = await searchEmployeesForLink(searchQuery);
      setResults(data);
    } catch (error) {
      logger.error('Error searching employees', { data: { error } });
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleLink = async (employeeId: string) => {
    setIsLinking(true);
    try {
      await linkEmployeeToProfile(profileId, employeeId);
      toast.success('Empleado vinculado exitosamente');
      setOpen(false);
      setSearchQuery('');
      setResults([]);
      setHasSearched(false);
      queryClient.invalidateQueries({ queryKey: [...COMPANY_USERS_QUERY_KEY] });
    } catch (error) {
      logger.error('Error linking employee', { data: { error } });
      toast.error('Error al vincular empleado');
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    setIsLinking(true);
    try {
      await linkEmployeeToProfile(profileId, null);
      toast.success('Empleado desvinculado');
      queryClient.invalidateQueries({ queryKey: [...COMPANY_USERS_QUERY_KEY] });
    } catch (error) {
      logger.error('Error unlinking employee', { data: { error } });
      toast.error('Error al desvincular empleado');
    } finally {
      setIsLinking(false);
    }
  };

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setSearchQuery('');
      setResults([]);
      setHasSearched(false);
    }
  };

  // ── Estado: Empleado ya vinculado ──────────────────────────────────────────
  if (employee) {
    return (
      <div className="flex items-center gap-2">
        <UserCheck className="h-3.5 w-3.5 text-ok shrink-0" />
        <span className="text-sm font-medium truncate">
          {employee.lastname} {employee.firstname}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleUnlink}
          disabled={isLinking}
          title="Desvincular empleado"
        >
          {isLinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3 text-destructive" />}
        </Button>
      </div>
    );
  }

  // ── Estado: Sin empleado vinculado — botón para abrir modal ────────────────
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-muted-foreground">
          <UserX className="h-3.5 w-3.5" />
          <span className="text-xs">Vincular</span>
          <Link2 className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                <UserPlus className="h-4 w-4 text-primary" />
              </div>
              Vincular empleado
            </DialogTitle>
            <DialogDescription className="text-sm">
              Busca por nombre, CUIL o legajo para vincular un empleado a este usuario.
            </DialogDescription>
          </DialogHeader>

          {/* Buscador */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ej: García, 20-12345678-9, L001..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9 pr-20 h-10"
              autoFocus
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching || searchQuery.length < 2}
              size="sm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-3 text-xs"
            >
              {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Buscar'}
            </Button>
          </div>
        </div>

        <Separator />

        {/* Resultados */}
        <div className="max-h-[340px] overflow-y-auto">
          {/* Estado: Sin buscar todavía */}
          {!hasSearched && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">Ingresá un término de búsqueda</p>
              <p className="text-xs mt-1">Mínimo 2 caracteres</p>
            </div>
          )}

          {/* Estado: Buscando */}
          {isSearching && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Buscando empleados...</p>
            </div>
          )}

          {/* Estado: Sin resultados */}
          {hasSearched && !isSearching && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <UserX className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm font-medium">No se encontraron empleados</p>
              <p className="text-xs mt-1">Probá con otro término o verificá que no esté ya vinculado</p>
            </div>
          )}

          {/* Estado: Resultados */}
          {!isSearching && results.length > 0 && (
            <div className="p-2">
              <p className="text-xs text-muted-foreground px-2 pb-2">
                {results.length} empleado{results.length !== 1 ? 's' : ''} disponible{results.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-0.5">
                {results.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => handleLink(emp.id)}
                    disabled={isLinking}
                    className={cn(
                      'w-full flex items-center gap-3 p-2.5 rounded-lg text-left',
                      'transition-colors duration-150',
                      'hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none',
                      'disabled:opacity-50 disabled:pointer-events-none'
                    )}
                  >
                    <Avatar className="h-9 w-9 shrink-0 border">
                      <AvatarImage src={emp.picture || undefined} alt={`${emp.lastname} ${emp.firstname}`} />
                      <AvatarFallback className="text-xs font-medium bg-muted">
                        {getInitials(emp.firstname, emp.lastname)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {emp.lastname} {emp.firstname}
                        </span>
                        {emp.file && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-mono">
                            L{emp.file}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">CUIL: {emp.cuil || '—'}</p>
                    </div>

                    <div className="shrink-0">
                      {isLinking ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Link2 className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
