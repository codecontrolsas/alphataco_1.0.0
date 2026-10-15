'use client';

import { Button } from '@/components/ui/button';
import { Logger } from '@/lib/logger';
import { useRouter } from 'next/navigation';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StateBlock } from './StateBlock';

const logger = new Logger('SectionErrorBoundary');

interface SectionErrorFallbackProps {
  title: string;
  description?: string;
  onReset: () => void;
}

/** Fallback aparte porque `useRouter` es un hook y el boundary es un componente de clase. */
function SectionErrorFallback({ title, description, onReset }: SectionErrorFallbackProps) {
  const router = useRouter();

  return (
    <StateBlock
      variant="error"
      title={title}
      description={description ?? 'Ocurrió un error al mostrar esta sección. El resto de la pantalla sigue funcionando.'}
      action={
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onReset();
            router.refresh();
          }}
        >
          Reintentar
        </Button>
      }
    />
  );
}

interface SectionErrorBoundaryProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** Se llama al reintentar, antes de refrescar la ruta. */
  onRetry?: () => void;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
}

/**
 * Aísla un error de render de una sección (por ejemplo un paso del pipeline) para que no se lleve puesta
 * la pantalla entera. Un error de datos de servidor se maneja en la propia sección; esto cubre lo que
 * se escapa en el render.
 */
export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  state: SectionErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SectionErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('Error de render en una sección', {
      data: { message: error.message, componentStack: info.componentStack },
    });
  }

  private reset = () => {
    this.props.onRetry?.();
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <SectionErrorFallback title={this.props.title} description={this.props.description} onReset={this.reset} />
    );
  }
}
