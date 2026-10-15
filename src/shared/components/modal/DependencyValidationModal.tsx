'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Logger } from '@/lib/logger';
import { useIsInCatalogSheet } from '@/shared/components/common/CatalogFormSheet';
import { AlertTriangle, Users } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

const logger = new Logger('DependencyValidationModal');

export interface DependencyConfig {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  displayColumns: string[];
  displayLabels: string[];
  relationName?: string;
}

export interface DependencyValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (action: 'force' | 'replace', replacementValue?: string) => void;
  recordId: string;
  recordName: string;
  dependencies: DependencyConfig[];
  title?: string;
  description?: string;
  fetchDependencies: (
    config: DependencyConfig,
    recordId: string
  ) => Promise<{ data: Record<string, unknown>[]; count: number }>;
  fetchReplacementOptions?: (config: DependencyConfig, excludeId?: string) => Promise<{ id: string; name: string }[]>;
}

interface DependencyResult {
  config: DependencyConfig;
  records: Record<string, unknown>[];
  totalCount: number;
  loading: boolean;
  error?: string;
}

export default function DependencyValidationModal({
  isOpen,
  onClose,
  onConfirm,
  recordId,
  recordName,
  dependencies,
  title = 'Confirmar desactivación',
  description = 'Este registro está siendo utilizado por otros elementos del sistema.',
  fetchDependencies,
  fetchReplacementOptions,
}: DependencyValidationModalProps) {
  const [dependencyResults, setDependencyResults] = useState<DependencyResult[]>([]);
  const [allReplacementOptions, setAllReplacementOptions] = useState<{ id: string; name: string }[]>([]);
  const [globalReplacement, setGlobalReplacement] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && dependencies.length > 0) {
      loadDependencies();
      if (fetchReplacementOptions) {
        loadReplacementOptions();
      }
    }
  }, [isOpen, dependencies, recordId]);

  const loadDependencies = async () => {
    setLoading(true);
    const results: DependencyResult[] = [];

    for (const config of dependencies) {
      try {
        const { data, count } = await fetchDependencies(config, recordId);
        results.push({
          config,
          records: data,
          totalCount: count,
          loading: false,
        });
      } catch (error) {
        results.push({
          config,
          records: [],
          totalCount: 0,
          loading: false,
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    setDependencyResults(results);
    setLoading(false);
  };

  const loadReplacementOptions = async () => {
    if (!fetchReplacementOptions) return;

    try {
      // Usar la primera configuración para obtener las opciones (asumiendo que todas son del mismo tipo)
      const configOptions = await fetchReplacementOptions(dependencies[0], recordId);
      setAllReplacementOptions(configOptions);
    } catch (error) {
      logger.error('Error al cargar opciones de reemplazo', { data: { error } });
    }
  };

  const getTotalDependencies = () => {
    return dependencyResults.reduce((total, result) => total + result.totalCount, 0);
  };

  const handleConfirm = (action: 'force' | 'replace') => {
    if (action === 'replace') {
      // Crear objeto de reemplazos para todas las tablas dependientes
      // const replacements: { [key: string]: string } = {};
      // dependencyResults.forEach(result => {
      //     if (result.totalCount > 0) {
      //         replacements[result.config.targetTable] = globalReplacement;
      //     }
      // });

      onConfirm(action, globalReplacement);
    } else {
      onConfirm(action);
    }
  };

  const totalDependencies = getTotalDependencies();
  const inSheet = useIsInCatalogSheet();

  const content = (
    <DependencyValidationContent
      variant={inSheet ? 'panel' : 'dialog'}
      title={title}
      description={description}
      recordName={recordName}
      totalDependencies={totalDependencies}
      loading={loading}
      dependencyResults={dependencyResults}
      allReplacementOptions={allReplacementOptions}
      hasReplacementFetcher={Boolean(fetchReplacementOptions)}
      globalReplacement={globalReplacement}
      onGlobalReplacementChange={setGlobalReplacement}
      onClose={onClose}
      onReplace={() => handleConfirm('replace')}
    />
  );

  if (inSheet) {
    return isOpen ? <InlinePanel onClose={onClose}>{content}</InlinePanel> : null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">{content}</DialogContent>
    </Dialog>
  );
}

/**
 * Panel superpuesto dentro del cuerpo del Sheet: Escape lo cierra sin cerrar el Sheet, y mientras
 * está abierto el formulario de atrás queda inerte.
 */
function InlinePanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Captura en window: corre antes que el listener de Escape del Sheet (Radix) y lo corta.
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Si hay un Select/Popover abierto (portal de Radix), Escape lo cierra a él primero.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-radix-popper-content-wrapper]') || document.querySelector('[role="listbox"]')) return;
      event.stopPropagation();
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose]);

  useEffect(() => {
    // Todo lo que rodea al panel hasta el diálogo del Sheet (formulario, encabezado) queda inerte.
    const panel = panelRef.current;
    if (!panel) return;
    const madeInert: HTMLElement[] = [];
    let node: HTMLElement = panel;
    while (node.parentElement) {
      const parent: HTMLElement = node.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true;
          madeInert.push(sibling);
        }
      }
      if (parent.getAttribute('role') === 'dialog') break;
      node = parent;
    }
    return () => {
      for (const element of madeInert) element.inert = false;
    };
  }, []);

  const focusTitle = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const target = node.querySelector<HTMLElement>('[data-autofocus]');
    target?.focus();
  }, []);

  return (
    <div
      ref={(node) => {
        panelRef.current = node;
        focusTitle(node);
      }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={PANEL_TITLE_ID}
      className="absolute inset-0 z-10 overflow-y-auto bg-background p-4 sm:p-6"
    >
      {children}
    </div>
  );
}

const PANEL_TITLE_ID = 'dependency-validation-title';

interface DependencyValidationContentProps {
  variant: 'dialog' | 'panel';
  title: string;
  description: string;
  recordName: string;
  totalDependencies: number;
  loading: boolean;
  dependencyResults: DependencyResult[];
  allReplacementOptions: { id: string; name: string }[];
  hasReplacementFetcher: boolean;
  globalReplacement: string;
  onGlobalReplacementChange: (value: string) => void;
  onClose: () => void;
  onReplace: () => void;
}

function DependencyValidationContent({
  variant,
  title,
  description,
  recordName,
  totalDependencies,
  loading,
  dependencyResults,
  allReplacementOptions,
  hasReplacementFetcher,
  globalReplacement,
  onGlobalReplacementChange,
  onClose,
  onReplace,
}: DependencyValidationContentProps) {
  const isPanel = variant === 'panel';
  const fallbackId = useId();
  const titleId = isPanel ? PANEL_TITLE_ID : fallbackId;
  const Header = isPanel ? 'div' : DialogHeader;
  const Footer = isPanel ? 'div' : DialogFooter;
  const dependenciesList = (
    <div className="space-y-6">
      {dependencyResults.map((result, index) => (
        <div key={index} className="border rounded-lg p-4">
          <h4 className="font-medium mb-3">
            {result.config.relationName || result.config.targetTable} ({result.totalCount} registros)
          </h4>

          {result.error ? (
            <div className="text-red-600 text-sm">Error: {result.error}</div>
          ) : result.totalCount > 0 ? (
            <div className="mb-4 max-h-32 overflow-y-auto">
              <div className="grid gap-2">
                {result.records.map((record, recordIndex) => (
                  <div key={recordIndex} className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    {result.config.displayColumns.map((column, colIndex) => (
                      <span key={colIndex} className="mr-4">
                        <strong>{result.config.displayLabels[colIndex]}:</strong>{' '}
                        {String(record[column] ?? '') || 'N/A'}
                      </span>
                    ))}
                  </div>
                ))}
                {result.totalCount > 10 && (
                  <div className="text-sm text-gray-500 italic">... y {result.totalCount - 10} registros más</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-green-600 text-sm">✓ Sin dependencias</div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Header className={isPanel ? 'mb-4 flex flex-col gap-1.5' : undefined}>
        {isPanel ? (
          <h2
            id={titleId}
            tabIndex={-1}
            data-autofocus
            className="flex items-center gap-2 text-lg font-semibold outline-none"
          >
            <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
            {title}
          </h2>
        ) : (
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {title}
          </DialogTitle>
        )}
        {isPanel ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : (
          <DialogDescription>{description}</DialogDescription>
        )}
      </Header>

      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <Users className="h-4 w-4" />
            <span className="font-medium">
              El registro {recordName} está siendo utilizado por {totalDependencies} elemento(s)
            </span>
          </div>
        </div>

        <div className="mt-3 p-3  border border-red-300 rounded-md flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-700 flex-shrink-0 mt-0.5" />
          <div className="text-red-800 text-sm">
            <strong className="font-semibold">Atención:</strong> Por favor revisa si este registro tiene documentos
            especiales asociados luego de proceder.
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">Cargando dependencias...</p>
          </div>
        ) : (
          <>
            {/* Select global para reemplazo */}
            {totalDependencies > 0 && hasReplacementFetcher && allReplacementOptions.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-blue-900">Opciones de reemplazo</h4>
                <p className="text-sm text-blue-700">
                  Selecciona con qué valor reemplazar todas las referencias a {recordName}:
                </p>
                <Select value={globalReplacement} onValueChange={onGlobalReplacementChange}>
                  <SelectTrigger className="bg-white dark:bg-gray-800 dark:text-white">
                    <SelectValue
                      className="dark:text-white placeholder:text-white"
                      placeholder="Seleccionar opción de reemplazo..."
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NULL__">
                      <div className="flex flex-col items-start">
                        <span className="font-medium">Dejar vacío</span>
                        <span className="text-xs text-gray-500">Remover la referencia sin reemplazar</span>
                      </div>
                    </SelectItem>
                    {allReplacementOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{option.name}</span>
                          <span className="text-xs text-gray-500">Reemplazar con este valor</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isPanel ? (
              dependenciesList
            ) : (
              <ScrollArea className="max-h-[calc(80vh-200px)]">{dependenciesList}</ScrollArea>
            )}
          </>
        )}
      </div>

      <Footer className={isPanel ? 'mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end' : 'gap-2'}>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>

        {totalDependencies > 0 && hasReplacementFetcher && allReplacementOptions.length > 0 && (
          <Button type="button" variant="default" onClick={onReplace} disabled={loading || !globalReplacement}>
            Reemplazar y desactivar
          </Button>
        )}
      </Footer>
    </>
  );
}
