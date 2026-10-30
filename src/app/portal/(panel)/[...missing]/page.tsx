import { notFound } from 'next/navigation';

/** Cualquier URL desconocida bajo `/portal` cae acá, así el 404 se ve dentro del marco del portal. */
export default function PortalUnknownPage() {
  notFound();
}
