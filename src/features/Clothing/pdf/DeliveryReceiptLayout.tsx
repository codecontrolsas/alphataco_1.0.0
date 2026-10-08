'use client';

import { Document, Image, Page, Text, View } from '@react-pdf/renderer';
import moment from 'moment';
import type { DeliveryPdfData } from '../actions/pdf.server';
import { buildReceiptRows, formatCuit } from '../lib/receipt-format';
import { BRAND_NAME } from '@/shared/lib/branding';
import { styles } from './receipt-styles';

// ============================================================================
// CONSTANTS
// ============================================================================


// ============================================================================
// PROPS
// ============================================================================

interface DeliveryReceiptLayoutProps {
  data: DeliveryPdfData;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DeliveryReceiptLayout({ data }: DeliveryReceiptLayoutProps) {
  const employee = data.employees_clothing_deliveries_employee_idToemployees;
  const comp = data.company;
  const items = data.clothing_delivery_items;
  const isReplacement = data.delivery_type === 'REPLACEMENT';
  const deliveredAtFormatted = moment(data.delivered_at).format('DD/MM/YYYY');

  // Filas del formulario: los artículos entregados + las vacías que completan la hoja.
  const rows = buildReceiptRows(items);

  const cuitFormatted = comp?.company_cuit ? formatCuit(comp.company_cuit) : '';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── HEADER ROW 1: Logo | (empty) | Meta ────────────────── */}
        <View style={styles.headerRow1}>
          <View style={styles.logoCell}>
            {/* El logo de la EMPRESA manda. Sin logo cargado cae a la marca, que hoy es
                tipografica: `react-pdf` no entiende clases, asi que el estilo va inline. */}
            {comp?.company_logo ? (
              <Image style={styles.logo} src={comp.company_logo} />
            ) : (
              <Text style={styles.brandFallback}>{BRAND_NAME}</Text>
            )}
          </View>
          <View style={styles.headerMiddle} />
          <View style={styles.metaCell}>
            <Text style={styles.metaText}>RG 12-4</Text>
            <Text style={styles.metaText}>{moment().format('DD/MM/YYYY')}</Text>
            <Text style={styles.metaText}>Rev. 4</Text>
          </View>
        </View>

        {/* ── HEADER ROW 2: Full-width title ─────────────────────── */}
        <View style={styles.titleRow}>
          <Text style={styles.titleText}>
            CONSTANCIA DE ENTREGA DE ROPA DE TRABAJO Y ELEMENTOS DE PROTECCION PERSONAL
          </Text>
        </View>

        {/* Entrega anulada (Almacenes etapa 5): la constancia se conserva, marcada. */}
        {data.cancelled_at && (
          <View style={styles.cancelledRow}>
            <Text style={styles.cancelledText}>
              ANULADA el {moment(data.cancelled_at).format('DD/MM/YYYY')}
              {data.cancel_reason ? ` — Motivo: ${data.cancel_reason}` : ''}
            </Text>
          </View>
        )}

        {/* ── COMPANY INFO ROW 1: Razon Social | CUIT ────────────── */}
        <View style={styles.infoRow}>
          <View style={[styles.infoCell, styles.infoCellBorder, { width: '65%' }]}>
            <Text>
              <Text style={styles.labelBold}>Razon Social: </Text>
              <Text style={styles.labelBoldValue}>{comp?.company_name ?? ''}</Text>
            </Text>
          </View>
          <View style={[styles.infoCell, { width: '35%' }]}>
            <Text>
              <Text style={styles.labelBold}>CUIT: </Text>
              <Text style={styles.labelBoldValue}>{cuitFormatted}</Text>
            </Text>
          </View>
        </View>

        {/* ── COMPANY INFO ROW 2: Direccion | Localidad | CP | Prov ── */}
        <View style={styles.infoRow}>
          <View style={[styles.infoCell, styles.infoCellBorder, { width: '35%' }]}>
            <Text>
              <Text style={styles.labelBold}>Direccion: </Text>
              <Text style={styles.labelBoldValue}>{comp?.address ?? ''}</Text>
            </Text>
          </View>
          <View style={[styles.infoCell, styles.infoCellBorder, { width: '25%' }]}>
            <Text>
              <Text style={styles.labelBold}>Localidad: </Text>
              <Text style={styles.labelBoldValue}>{comp?.cities?.name?.toUpperCase() ?? ''}</Text>
            </Text>
          </View>
          <View style={[styles.infoCell, styles.infoCellBorder, { width: '12%' }]}>
            <Text>
              <Text style={styles.labelBold}>CP:</Text>
              <Text style={styles.labelNormal}>{employee?.postal_code ?? ''}</Text>
            </Text>
          </View>
          <View style={[styles.infoCell, { width: '28%' }]}>
            <Text>
              <Text style={styles.labelBold}>Provincia: </Text>
              <Text style={styles.labelBoldValue}>{comp?.provinces?.name?.toUpperCase() ?? ''}</Text>
            </Text>
          </View>
        </View>

        {/* ── WORKER: Name | DNI | Legajo ────────────────────────── */}
        <View style={styles.infoRow}>
          <View style={[styles.infoCell, styles.infoCellBorder, { width: '55%' }]}>
            <Text>
              <Text style={styles.labelBold}>Nombre y Apellido del Trabajador: </Text>
              <Text style={styles.labelNormal}>{employee ? `${employee.lastname} ${employee.firstname}` : ''}</Text>
            </Text>
          </View>
          <View style={[styles.infoCell, styles.infoCellBorder, { width: '25%' }]}>
            <Text>
              <Text style={styles.labelBold}>DNI: </Text>
              <Text style={styles.labelNormal}>{employee?.document_number ?? ''}</Text>
            </Text>
          </View>
          <View style={[styles.infoCell, { width: '20%' }]}>
            <Text>
              <Text style={styles.labelBold}>LEGAJO: </Text>
              <Text style={styles.labelNormal}>{employee?.file ?? ''}</Text>
            </Text>
          </View>
        </View>

        {/* ── PUESTO ─────────────────────────────────────────────── */}
        <View style={styles.infoRow}>
          <View style={[styles.infoCell, { width: '100%' }]}>
            <Text>
              <Text style={styles.labelBold}>Puesto que desempena:</Text>
              <Text style={styles.labelNormal}> {employee?.company_positions?.name ?? ''}</Text>
            </Text>
          </View>
        </View>

        {/* ── EPP NECESARIOS ─────────────────────────────────────── */}
        <View style={styles.infoRow}>
          <View style={[styles.infoCell, styles.infoCellBorder, { width: '40%' }]}>
            <Text style={styles.labelBold}>EPP Necesarios para el trabajador segun puesto de trabajo</Text>
          </View>
          <View style={[styles.infoCell, { width: '60%' }]}>
            <Text style={styles.labelNormal}>
              {items
                .map((i) => i.clothing_items?.name ?? '')
                .filter(Boolean)
                .join(', ')}
            </Text>
          </View>
        </View>

        {/* ── TABLE HEADER ───────────────────────────────────────── */}
        <View style={styles.tableHeaderRow}>
          <View style={styles.colNum}>
            <Text style={styles.headerCellText}> </Text>
          </View>
          <View style={styles.colProducto}>
            <Text style={styles.headerCellText}>Producto</Text>
          </View>
          <View style={styles.colTipoModelo}>
            <Text style={styles.headerCellText}>Tipo / Modelo</Text>
          </View>
          <View style={styles.colTalle}>
            <Text style={styles.headerCellText}>Talle</Text>
          </View>
          <View style={styles.colCodigo}>
            <Text style={[styles.headerCellText, { fontSize: 6 }]}>Codigo</Text>
          </View>
          <View style={styles.colMarca}>
            <Text style={styles.headerCellText}>Marca</Text>
          </View>
          {/* Posee Certificado */}
          <View style={styles.colCertHeader}>
            <Text style={[styles.headerCellText, { fontSize: 5.5 }]}>Posee{'\n'}Certificado</Text>
            <View style={styles.subHeaderRow}>
              <Text style={[styles.headerCellText, { fontSize: 6 }]}>SI</Text>
              <Text style={[styles.headerCellText, { fontSize: 6 }]}>NO</Text>
            </View>
          </View>
          <View style={styles.colCant}>
            <Text style={styles.headerCellText}>Cant</Text>
          </View>
          <View style={styles.colFecha}>
            <Text style={[styles.headerCellText, { fontSize: 6 }]}>Fecha de{'\n'}Entrega</Text>
          </View>
          <View style={styles.colFirma}>
            <Text style={[styles.headerCellText, { fontSize: 6 }]}>Firma del{'\n'}Trabajador</Text>
          </View>
          {/* Reposicion */}
          <View style={styles.colRepHeader}>
            <Text style={[styles.headerCellText, { fontSize: 5.5 }]}>Reposicion</Text>
            <View style={styles.subHeaderRow}>
              <Text style={[styles.headerCellText, { fontSize: 6 }]}>SI</Text>
              <Text style={[styles.headerCellText, { fontSize: 6 }]}>NO</Text>
            </View>
          </View>
        </View>

        {/* ── TABLE DATA ROWS ────────────────────────────────────── */}
        {rows.map((row, i) => (
          <View key={i} style={styles.tableDataRow}>
            <View style={styles.colNum}>
              <Text style={styles.cellTextBold}>{i + 1}</Text>
            </View>
            <View style={styles.colProducto}>
              <Text style={styles.cellText}>{row?.producto ?? ''}</Text>
            </View>
            <View style={styles.colTipoModelo}>
              <Text style={styles.cellText}>{row?.tipoModelo ?? ''}</Text>
            </View>
            <View style={styles.colTalle}>
              <Text style={styles.cellText}>{row?.talle ?? ''}</Text>
            </View>
            <View style={styles.colCodigo}>
              <Text style={styles.cellText}>{row?.codigo ?? ''}</Text>
            </View>
            <View style={styles.colMarca}>
              <Text style={styles.cellText}>{row?.marca ?? ''}</Text>
            </View>
            {/* Certificado */}
            <View style={styles.colCertSi}>
              <Text style={styles.cellText}>{row?.hasCertificate ? 'X' : ''}</Text>
            </View>
            <View style={styles.colCertNo}>
              <Text style={styles.cellText}>{row && !row.hasCertificate ? 'X' : ''}</Text>
            </View>
            <View style={styles.colCant}>
              <Text style={styles.cellText}>{row ? row.cantidad : ''}</Text>
            </View>
            <View style={styles.colFecha}>
              <Text style={styles.cellText}>{row ? deliveredAtFormatted : ''}</Text>
            </View>
            <View style={styles.colFirma}>
              {row && data.signature_url ? <Image style={styles.signatureImage} src={data.signature_url} /> : null}
            </View>
            {/* Reposicion */}
            <View style={styles.colRepSi}>
              <Text style={styles.cellText}>{row && isReplacement ? 'X' : ''}</Text>
            </View>
            <View style={styles.colRepNo}>
              <Text style={styles.cellText}>{row && !isReplacement ? 'X' : ''}</Text>
            </View>
          </View>
        ))}

        {/* ── LEGAL / INFO ADICIONAL ─────────────────────────────── */}
        <View style={styles.legalSection}>
          <Text style={styles.legalTitle}>
            {'Informacion adicional: '}
            <Text style={styles.legalText}>
              Me comprometo a usar los elementos recibidos en forma obligatoria durante todo el horario de trabajo y
              exclusivamente dentro de la empresa.
            </Text>
          </Text>
          <Text style={styles.legalText}>
            El no uso de los mismos permitira se me apliquen las sanciones disciplinarias correspondientes por no
            cumplir con las normas de seguridad
          </Text>
          <Text style={styles.legalText}>
            Asimismo me comprometo a extremar las medidas necesarias para conservar y mantener en buen estado esos
            elementos. Informando a la supervision en forma inmediata cualquier anormalidad o extravio
          </Text>
        </View>

        {/* ── OBSERVATION + LEGAL FOOTER ──────────────────────────── */}
        <View style={styles.observationRow}>
          <View style={{ width: '65%' }}>
            <Text style={styles.observationText}>
              Observacion: el &quot;codigo&quot; solicitado en la planilla es aplicable para la ropa de trabajo
            </Text>
            <Text style={styles.legalFooterText}>
              Segun Resolucion 299/11 de la Superintendencia de Riesgo de Trabajo este formulario sera de utilizacion
              obligatoria por parte de los empleadores, donde se registraran las respectivas entregas de ropa de trabajo
              y Elementos de Proteccion Personal.
            </Text>
          </View>
          <View style={{ width: '35%', alignItems: 'flex-end', justifyContent: 'center' }}>
            <Text style={styles.quedoNotificado}>Quedo notificado:</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
