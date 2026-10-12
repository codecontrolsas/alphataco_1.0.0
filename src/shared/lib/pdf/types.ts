/**
 * Tipos del kit de PDF que arma el servidor (Compras, Certificaciones). Sin código: se pueden
 * importar desde cualquier lado, incluso desde un Client Component.
 */

/**
 * Componentes de react-pdf que usan los documentos. react-pdf se carga fuera del bundle (ver
 * `loadReactPdf`) y llega por parámetro: los layouts solo importan tipos.
 */
export type ReactPdf = Pick<
  typeof import('@react-pdf/renderer'),
  'Document' | 'Page' | 'Text' | 'View' | 'Image' | 'renderToBuffer'
>;

/** Logo ya leído de MinIO. Sin logo, el membrete va solo con texto. */
export type PdfLogo = { data: Buffer; format: 'png' | 'jpg' } | null;

/** PDF ya renderizado en el servidor. */
export type RenderedPdf = { filename: string; content: Uint8Array };

/** Lo que devuelve una action de descarga: el cliente arma el Blob con el base64. */
export type PdfDownload = { filename: string; base64: string };

/** Empresa emisora, tal como la consumen los builders de datos. */
export type PdfCompanySource = {
  name: string;
  cuit: string;
  address: string | null;
  city: string | null;
  province: string | null;
};
