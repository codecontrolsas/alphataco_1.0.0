'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface DisclosureMenuProps {
  /** Contenido del `<summary>` (el disparador). */
  summary: ReactNode;
  /** Texto accesible del disparador. */
  summaryLabel: string;
  /** Panel desplegable (normalmente una lista de enlaces renderizada en el servidor). */
  children: ReactNode;
  className?: string;
  /** Clases del panel; el contenedor `<div>` es el que se posiciona. */
  panelClassName?: string;
  /** Clases del `<summary>`. */
  summaryClassName?: string;
}

/**
 * Selector desplegable sobre `<details>` que cierra con Escape (devolviendo el foco al disparador),
 * con un toque o clic fuera y al elegir un enlace. Los listeners existen solo mientras está abierto.
 */
export function DisclosureMenu({
  summary,
  summaryLabel,
  children,
  className,
  panelClassName,
  summaryClassName,
}: DisclosureMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const details = detailsRef.current;
    if (!details) return;

    const close = () => {
      details.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
      summaryRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !details.contains(event.target)) close();
    };
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href]')) close();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    details.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      details.removeEventListener('click', onClick);
    };
  }, [isOpen]);

  return (
    <details ref={detailsRef} className={className} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary ref={summaryRef} aria-label={summaryLabel} className={summaryClassName}>
        {summary}
      </summary>
      <div className={panelClassName}>{children}</div>
    </details>
  );
}
