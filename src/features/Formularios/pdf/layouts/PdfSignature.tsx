'use client';

import { Image, Text, View, type Styles } from '@react-pdf/renderer';

interface PdfSignatureProps {
  /** URL de la imagen de la firma; las rutas que terminan en `_files/` son un valor vacío del formulario. */
  singurl?: string | null;
  /** Nombre del conductor: si está cargado y no hay firma se imprime «Sin firma». */
  driverName?: string;
  /** Estilos del layout que la usa (cada formulario tiene su propia hoja). */
  styles: Styles;
}

/** Bloque «FIRMA DEL CONDUCTOR» al pie de los checklists de transporte. */
export function PdfSignature({ singurl, driverName, styles }: PdfSignatureProps) {
  return (
    <View style={styles.signatureContainer}>
      {singurl && !singurl.endsWith('_files/') ? (
        <Image style={styles.signatureImage} src={singurl} />
      ) : driverName ? (
        <Text>Sin firma</Text>
      ) : null}
      <Text style={styles.signatureText}>FIRMA DEL CONDUCTOR</Text>
    </View>
  );
}
