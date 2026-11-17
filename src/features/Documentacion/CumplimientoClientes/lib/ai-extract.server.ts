import 'server-only';

import { Logger } from '@/lib/logger';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';

const logger = new Logger('features/Documentacion/CumplimientoClientes/ai-extract');

/** La carga con IA se habilita con la clave de la API en el entorno (`ANTHROPIC_API_KEY`). */
export function isAiExtractionEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

const MODEL = 'claude-opus-5-5';

const extractionSchema = z.object({
  documentTypeId: z
    .string()
    .nullable()
    .describe('Id del tipo de la lista que corresponde al documento, o null si ninguno'),
  resourceKind: z.enum(['Persona', 'Equipos']).nullable(),
  holderName: z.string().nullable().describe('Nombre del titular tal como figura'),
  cuil: z.string().nullable().describe('CUIL/CUIT del titular, solo dígitos'),
  dni: z.string().nullable().describe('DNI del titular, solo dígitos'),
  domain: z.string().nullable().describe('Dominio (patente) del vehículo'),
  internalNumber: z.string().nullable().describe('Número interno del equipo, si figura'),
  validity: z.string().nullable().describe('Fecha de vencimiento YYYY-MM-DD, o null si no vence'),
  period: z.string().nullable().describe('Período YYYY-MM si es un documento mensual'),
  confidence: z.number().describe('Confianza de 0 a 1 en el tipo, el titular y la fecha'),
  notes: z
    .string()
    .nullable()
    .describe('Algo que la persona que valida tiene que saber (ilegible, vencido, otra persona)'),
});

export type AiExtraction = z.infer<typeof extractionSchema>;

export interface ExtractableType {
  id: string;
  name: string;
  kind: 'Persona' | 'Equipos';
  hasExpiry: boolean;
  monthly: boolean;
}

const IMAGE_TYPES = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
} as const;

function contentBlockFor(file: File, base64: string): Anthropic.Beta.BetaContentBlockParam | null {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
  }
  const media = IMAGE_TYPES[file.type as keyof typeof IMAGE_TYPES];
  return media ? { type: 'image', source: { type: 'base64', media_type: media, data: base64 } } : null;
}

export type AiExtractionResult = { ok: true; data: AiExtraction } | { ok: false; reason: string };

/**
 * Lee un documento (PDF o imagen) y devuelve tipo, titular, identificadores y vencimiento con salida estructurada.
 * Nunca lanza: ante cualquier problema (formato no soportado, rechazo, error de la API) devuelve el motivo, que queda a
 * la vista en la bandeja para que una persona lo valide.
 */
export async function extractDocumentWithAi(
  file: File,
  types: readonly ExtractableType[],
  today: string
): Promise<AiExtractionResult> {
  if (!isAiExtractionEnabled()) return { ok: false, reason: 'La carga con IA no está configurada' };
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  const block = contentBlockFor(file, base64);
  if (!block) return { ok: false, reason: 'La IA lee PDF e imágenes; este formato hay que clasificarlo a mano' };

  const typeList = types
    .map(
      (t) =>
        `- ${t.id} | ${t.name} | ${t.kind === 'Persona' ? 'personal' : 'equipos'}${t.hasExpiry ? ' | vence' : ''}${t.monthly ? ' | mensual' : ''}`
    )
    .join('\n');

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(extractionSchema) },
      system:
        'Clasificás documentación laboral y de vehículos de una empresa argentina (ART, aptos médicos, licencias de conducir, seguros, VTV, etc.). Respondés solo con lo que figura en el documento: si un dato no está, va null. Las fechas, en formato YYYY-MM-DD.',
      messages: [
        {
          role: 'user',
          content: [
            block,
            {
              type: 'text',
              text: `Hoy es ${today}. Tipos de documento de la empresa (id | nombre | recurso | marcas):\n${typeList}\n\nIdentificá a qué tipo corresponde este documento, de quién es (persona: CUIL y DNI; equipo: dominio y número interno) y hasta cuándo vale. Si es mensual, el período. Si no estás seguro del tipo, documentTypeId va null.`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') return { ok: false, reason: 'La IA no pudo leer este documento' };
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      return { ok: false, reason: 'La IA no devolvió un resultado completo' };
    }
    return { ok: true, data: response.parsed_output };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError)
      return { ok: false, reason: 'La IA está saturada; validalo a mano o reintentá más tarde' };
    if (error instanceof Anthropic.AuthenticationError) {
      logger.error('Clave de IA inválida', { data: { status: error.status } });
      return { ok: false, reason: 'La clave de la IA no es válida' };
    }
    if (error instanceof Anthropic.APIError) {
      logger.error('Error de la API de IA', { data: { status: error.status, message: error.message } });
      return { ok: false, reason: 'La IA no respondió' };
    }
    logger.error('Error al leer el documento con IA', { data: { error } });
    return { ok: false, reason: 'La IA no respondió' };
  }
}
