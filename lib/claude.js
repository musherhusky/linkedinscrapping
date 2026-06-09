import Anthropic from '@anthropic-ai/sdk';
import { Logger } from './logger.js';

const logger = new Logger('CLAUDE');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
1. "categories": array de 2-3 categorías de nivel alto (ej: "Tecnología", "Economía", "Sostenibilidad")
2. "topics": array de 4-5 temas específicos detectados (ej: "Inteligencia Artificial", "Regulación europea")
3. "forced_topics": para cada tema forzado, indica si se menciona y con qué confianza
${forcedSection}

Formato de respuesta:
{
  "results": [
    {
      "post_id": <id numérico>,
      "categories": ["...", "..."],
      "topics": ["...", "..."],
      "forced_topics": [
        { "topic": "...", "mentioned": true, "confidence": "high|medium|low" }
      ]
    }
  ]
}

Si no puedes analizar un post devuelve arrays vacíos para ese post.
Los posts pueden estar en cualquier idioma, responde siempre en el mismo idioma del post para categorías y temas.

Posts a analizar:
${JSON.stringify(postsText, null, 2)}`;
}

export async function analyzeBatch(posts, forcedTopics = []) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no configurada');
  }

  logger.info(`Analizando batch de ${posts.length} posts con ${forcedTopics.length} temas forzados...`);

  const prompt = buildPrompt(posts, forcedTopics);

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0].text.trim();
    const parsed = JSON.parse(content);

    logger.success(`Batch analizado. ${parsed.results?.length || 0} posts procesados`);
    return parsed.results || [];
  } catch (error) {
    logger.error(`Error en análisis Claude: ${error.message}`);
    throw error;
  }
}
