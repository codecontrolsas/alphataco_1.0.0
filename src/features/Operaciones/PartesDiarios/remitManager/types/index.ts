// Re-exportar tipos de las acciones
import type {
  RemitDocument as RemitDocumentType,
  RemitoWithDocuments as RemitoWithDocumentsType,
} from '../actions/remitos.server';

export type {
  RemitDocument,
  RemitoWithDocuments,
} from '../actions/remitos.server';

// Tipos adicionales para el frontend
export interface RemitosManagerProps {
  dailyReportRowId: string;
  customerName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export interface RemitTabProps {
  remito: RemitoWithDocumentsType;
  isActive: boolean;
  onActivate: () => void;
  customerName?: string;
  dailyReportRowId: string;
}

export interface AddRemitFormProps {
  dailyReportRowId: string;
  onClose: () => void;
  existingNumbers: string[];
  onRemitoCreated?: (remitoId: string) => void;
}

export interface DocumentUploadAreaProps {
  remitId: string;
  dailyReportRowId: string;
  customerName?: string;
}

export interface DocumentViewerProps {
  document: RemitDocumentType;
  dailyReportRowId: string;
  customerName?: string;
}

// Constantes
export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
