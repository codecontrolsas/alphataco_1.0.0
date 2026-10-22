'use client';

import moment from 'moment';
import { useEffect, useState } from 'react';
import { PdfDocumentPreview } from '../components/PdfDocumentPreview';
import { BaseChecklistLayout } from '../layouts/BaseChecklistLayout';

interface DailyChecklistPDFProps {
  data?: {
    movil?: string;
    interno?: string;
    dominio?: string;
    kilometraje?: string;
    modelo?: string;
    marca?: string;
    chofer?: string;
    servicio?: string;
    fecha?: string;
    luces?: string;
    licencia?: string;
    puertas?: string;
    extintor?: string;
    estadoGeneral?: string;
    seguro?: string;
    verificacionTecnica?: string;
    alarma?: string;
    parabrisas?: string;
    frenos?: string;
    fluidos?: string;
    matafuegos?: string;
    neumaticos?: string;
    ruedaAuxilio?: string;
    kitHerramientas?: string;
    botiquin?: string;
    manejoDefensivo?: string;
    aptoParaOperar?: 'SI' | 'NO';
    [key: string]: string | undefined;
  };
  preview?: boolean;
  companyLogo?: string;
  singurl?: string | null;
  title?: string;
  description?: string;
}

export const TransporteSPANAYCHKHYS04 = ({
  data,
  preview = true,
  companyLogo,
  singurl,
  title,
  description,
}: DailyChecklistPDFProps) => {
  const [client, setClient] = useState(false);

  useEffect(() => {
    setClient(true);
  }, []);

  const items = [
    {
      label: 'Verificar funcionamiento de todas las luces, altas bajas, de frenos, de posición, giro, balizas',
      result: data?.luces,
    },
    {
      label: 'Alarma acústica de retroceso en funcionamiento',
      result: data?.alarmaRetroceso,
    },
    {
      label: 'Parabrisas, ventanillas y espejos limpios en buen estado',
      result: data?.parabrisasEspejos,
    },
    {
      label: 'Cierre efectivo de puertas',
      result: data?.puertas,
    },
    {
      label: 'Verificar correcto funcionamiento de frenos, freno de mano',
      result: data?.frenos,
    },
    {
      label: 'Correcto nivel de fluidos, lubricantes, verificar fugas. Suficiente combustible',
      result: data?.fluidos,
    },
    {
      label: 'Arrestallamas (si corresponde)',
      result: data?.arrestallamas,
    },
    {
      label:
        'Neumáticos en buen estado, con correcta presión de aire, bien ajustados y con chochomoños en todas las tuercas',
      result: data?.neumaticos,
    },
    {
      label: 'Ruedas de auxilio si están a disposición y se encuentran en buen estado',
      result: data?.ruedaAuxilio,
    },
    {
      label: 'Kit de herramientas, balizas si se encuentran disponibles y en buen estado. Gato Hidráulico',
      result: data?.kitHerramientas,
    },
    {
      label: 'Botiquín de primeros auxilios',
      result: data?.botiquin,
    },
    {
      label: 'Extintor presente, recarga en fecha vigente',
      result: data?.extintor,
    },
    {
      label: 'Estado y aspecto gral correcto',
      result: data?.estadoGeneral,
    },
    {
      label: 'Seguro: vigente',
      result: data?.seguro,
    },
    {
      label: 'Verificación técnica vehicular: Vigente',
      result: data?.verificacionTecnica,
    },
    {
      label: 'Licencia: vigente',
      result: data?.licencia,
    },
    {
      label: 'Manejo defensivo: vigente',
      result: data?.manejoDefensivo,
    },
  ];

  // El logo llega por prop desde el servidor: el PDF se renderiza también sin el store cargado.

  const pdfContent = (
    <BaseChecklistLayout
      data={{
        fecha: data?.fecha ? moment(data?.fecha).format('DD-MM-YYYY') : undefined,
        conductor: data?.chofer,
        interno: data?.interno,
        dominio: data?.dominio,
        servicio: data?.servicio,
        marca: data?.marca,
        modelo: data?.modelo,
        items: items,
        kilometers: data?.kilometraje,
        aptoParaOperar: data?.aptoParaOperar,
      }}
      logoUrl={companyLogo ?? undefined}
      singurl={singurl}
    />
  );

  if (!client) return null;

  if (!preview) {
    return pdfContent;
  }

  return (
    <PdfDocumentPreview
      document={pdfContent}
      title={title}
      description={description}
      dominio={data?.dominio}
      fecha={data?.fecha}
      className="flex flex-col"
    />
  );
};
