'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { Download, Eye, FileSpreadsheet, FileText, ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ContractDocument } from '../../actions/services.server';
import { QueryErrorState } from '../CustomerDetail/QueryErrorState';

interface ContractDocumentsListProps {
  documents: ContractDocument[];
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  canManageDocuments: boolean;
  onPreview: (doc: ContractDocument) => void;
  onDownload: (doc: ContractDocument) => void;
  onDelete: (doc: ContractDocument) => void;
}

function DocumentTypeIcon({ type }: { type: string }) {
  if (type === 'pdf') return <FileText aria-hidden="true" className="mr-2 h-4 w-4 text-danger-subtle-foreground" />;
  if (type === 'image') return <ImageIcon aria-hidden="true" className="mr-2 h-4 w-4 text-info-subtle-foreground" />;
  if (type === 'spreadsheet')
    return <FileSpreadsheet aria-hidden="true" className="mr-2 h-4 w-4 text-ok-subtle-foreground" />;
  return null;
}

/** Lista de documentos de un contrato con buscador; ver y descargar para todos, eliminar solo con permiso. */
export function ContractDocumentsList({
  documents,
  isLoading,
  isError,
  isRetrying,
  onRetry,
  canManageDocuments,
  onPreview,
  onDownload,
  onDelete,
}: ContractDocumentsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const term = searchTerm.toLowerCase();
  const filteredDocuments = documents.filter(
    (doc) => doc.name.toLowerCase().includes(term) || doc.type.toLowerCase().includes(term)
  );

  let body: React.ReactNode;
  if (isError) {
    body = (
      <div className="px-4 py-8">
        <QueryErrorState title="No se pudieron cargar los documentos" isRetrying={isRetrying} onRetry={onRetry} />
      </div>
    );
  } else if (isLoading) {
    body = (
      <div role="status" className="flex flex-col items-center justify-center px-4 py-8 text-center">
        <Loader2 aria-hidden="true" className="mb-2 h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Cargando documentos...</p>
      </div>
    );
  } else if (filteredDocuments.length === 0) {
    body = (
      <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
        <FileText aria-hidden="true" className="mb-2 h-12 w-12 text-muted-foreground/50" />
        {searchTerm ? (
          <>
            <p className="mb-1 text-muted-foreground">No se encontraron documentos que coincidan con {searchTerm}</p>
            <p className="text-sm text-muted-foreground/80">Probá con otro término de búsqueda</p>
          </>
        ) : (
          <>
            <p className="mb-1 text-muted-foreground">No hay documentos para este contrato</p>
            {canManageDocuments && (
              <p className="text-sm text-muted-foreground/80">
                Subí documentos arrastrándolos o con el botón de selección
              </p>
            )}
          </>
        )}
      </div>
    );
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Tamaño</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredDocuments.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell>
                <div className="flex items-center">
                  <DocumentTypeIcon type={doc.type} />
                  <span className="text-sm">{doc.name}</span>
                </div>
              </TableCell>
              <TableCell>{doc.type.toUpperCase()}</TableCell>
              <TableCell className="tabular-nums">{doc.date ? formatArgentinaDay(doc.date) : '-'}</TableCell>
              <TableCell>{doc.size}</TableCell>
              <TableCell>
                <div className="flex space-x-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onPreview(doc)}
                    aria-label={`Ver ${doc.name}`}
                    title="Ver"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onDownload(doc)}
                    aria-label={`Descargar ${doc.name}`}
                    title="Descargar"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {canManageDocuments && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-danger-subtle-foreground"
                      onClick={() => onDelete(doc)}
                      aria-label={`Eliminar ${doc.name}`}
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-medium">Documentos del Contrato</h3>
        <Input
          placeholder="Buscar documentos..."
          aria-label="Buscar documentos"
          className="max-w-xs"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto rounded-lg border">{body}</div>
    </div>
  );
}
