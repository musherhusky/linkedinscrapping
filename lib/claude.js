import Anthropic from '@anthropic-ai/sdk';
import { Logger } from './logger.js';
import { saveApiUsage } from './database.js';

const logger = new Logger('CLAUDE');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export function getAnalysisModel() {
  return process.env.ANTHROPIC_MODEL_ANALYSIS || 'claude-opus-4-5';
}

// Verified per-1K-token rates (USD), cached from Anthropic pricing as of 2026-06-24.
// Models not listed here have no verified rate — cost is left null rather than guessed.
const CLAUDE_RATE_TABLE_PER_1K = {
  'claude-fable-5':    { input: 0.010, output: 0.050 },
  'claude-mythos-5':   { input: 0.010, output: 0.050 },
  'claude-opus-4-8':   { input: 0.005, output: 0.025 },
  'claude-opus-4-7':   { input: 0.005, output: 0.025 },
  'claude-opus-4-6':   { input: 0.005, output: 0.025 },
  'claude-sonnet-5':   { input: 0.003, output: 0.015 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5':  { input: 0.001, output: 0.005 },
};

function getClaudeRates(model) {
  return CLAUDE_RATE_TABLE_PER_1K[model] || null;
}

const SYSTEM_PROMPT = `Eres un experto en análisis de contenido de posts de LinkedIn.
Tu tarea es analizar posts y extraer categorías temáticas y temas específicos.
Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown, sin explicaciones.`;

function buildPrompt(posts, forcedTopics) {
  const postsText = posts.map(p => ({
    id: p.id,
    titulo: p.titulo || '',
    descripcion: p.descripcion ? p.descripcion.substring(0, 500) : '',
  }));

  const forcedSection = forcedTopics.length > 0
    ? `\nTemas a verificar obligatoriamente (aunque sea de refilón): ${JSON.stringify(forcedTopics)}`
    : '';

  return `Analiza los siguientes posts de LinkedIn.

Para cada post devuelve:
1. "categories": array de 2-3 categorías de nivel alto. Cada categoría es un objeto con:
   - "display": la categoría en el idioma del post (ej: "Sostenibilidad", "Sustainability", "Durabilité")
   - "canonical": la misma categoría SIEMPRE en inglés (ej: "Sustainability"). Nunca uses otro idioma para canonical.
2. "topics": array de 4-5 temas específicos detectados. Cada tema es un objeto con:
   - "display": el tema en el idioma del post (ej: "Inteligencia Artificial")
   - "canonical": el mismo tema SIEMPRE en inglés (ej: "Artificial Intelligence"). Nunca uses otro idioma para canonical.
3. "forced_topics": para cada tema forzado, indica si se menciona y con qué confianza
${forcedSection}

Formato de respuesta:
{
  "results": [
    {
      "post_id": <id numérico>,
      "categories": [{ "display": "...", "canonical": "..." }],
      "topics": [{ "display": "...", "canonical": "..." }],
      "forced_topics": [
        { "topic": "...", "mentioned": true, "confidence": "high|medium|low" }
      ]
    }
  ]
}

Si no puedes analizar un post devuelve arrays vacíos para ese post.
IMPORTANTE: "canonical" debe ser SIEMPRE en inglés, independientemente del idioma del post.

Posts a analizar:
${JSON.stringify(postsText, null, 2)}`;
}

export async function analyzeBatch(posts, forcedTopics = [], userId = null, deps = {}) {
  const {
    createMessage = (params) => client.messages.create(params),
    saveUsage = saveApiUsage,
  } = deps;

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no configurada');
  }

  logger.info(`Analizando batch de ${posts.length} posts con ${forcedTopics.length} temas forzados...`);

  const prompt = buildPrompt(posts, forcedTopics);

  try {
    const model = getAnalysisModel();
    const message = await createMessage({
      model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    if (userId && message.usage) {
      try {
        const inputTokens = message.usage.input_tokens;
        const outputTokens = message.usage.output_tokens;
        const rates = getClaudeRates(model);

        if (!rates) {
          logger.warn(`Sin tarifa verificada para el modelo "${model}" — coste no estimado (tokens sí se registran)`);
        }

        const estimatedCostUsd = rates
          ? (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output
          : null;

        await saveUsage(userId, 'claude', {
          modelOrActor: model,
          inputTokens,
          outputTokens,
          postsReceived: posts.length,
          estimatedCostUsd,
          rateSnapshot: rates
            ? { input_cost_per_1k: rates.input, output_cost_per_1k: rates.output }
            : { note: 'no verified rate for this model' },
        });
      } catch (usageError) {
        logger.warn(`No se pudo registrar el uso de Claude: ${usageError.message}`);
      }
    }

    let content = message.content[0].text.trim();
    content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      logger.error(`JSON parse failed (stop_reason: ${message.stop_reason}, content length: ${content.length}): ${parseError.message} — first 200 chars: ${content.substring(0, 200)}`);
      throw parseError;
    }

    logger.success(`Batch analizado. ${parsed.results?.length || 0} posts procesados`);
    return parsed.results || [];
  } catch (error) {
    logger.error(`Error en análisis Claude: ${error.message}`);
    throw error;
  }
}
