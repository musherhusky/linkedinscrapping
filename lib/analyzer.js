import { getSupabaseClient } from './supabase.js';
import { analyzeBatch } from './claude.js';
import { Logger } from './logger.js';

const logger = new Logger('ANALYZER');
const BATCH_SIZE = 20;

export async function analyzeNewPostsForUser(userId) {
  const supabase = getSupabaseClient();

  logger.section(`ANALIZANDO POSTS USUARIO: ${userId}`);

  // 1. Obtener IDs de posts ya analizados
  const { data: analyzed } = await supabase
    .from('post_categories')
    .select('post_id')
    .eq('user_id', userId);

  const analyzedIds = analyzed?.map(r => r.post_id) || [];

  // 2. Obtener posts sin analizar del usuario
  let query = supabase
    .from('posts')
    .select('id, titulo, descripcion, author_id, source_type')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (analyzedIds.length > 0) {
    query = query.not('id', 'in', `(${analyzedIds.join(',')})`);
  }

  const { data: posts, error } = await query;

  if (error) throw error;

  if (!posts || posts.length === 0) {
    logger.info(`No hay posts pendientes de analizar`);
    return { analyzed: 0, skipped: 0 };
  }

  logger.info(`${posts.length} posts pendientes de analizar`);

  // 2. Obtener user_topics del usuario
  const { data: userTopics } = await supabase
    .from('user_topics')
    .select('topic, url')
    .eq('user_id', userId);

  const genericTopics = userTopics?.filter(t => !t.url).map(t => t.topic) || [];

  // 3. Procesar en batches de 20
  let totalAnalyzed = 0;
  let totalSkipped = 0;

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);

    logger.info(`Procesando batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(posts.length / BATCH_SIZE)}...`);

    try {
      // Para este batch, obtener temas forzados por URL específica
      const batchAuthorIds = [...new Set(batch.map(p => p.author_id).filter(Boolean))];
      const urlSpecificTopics = userTopics
        ?.filter(t => t.url && batchAuthorIds.includes(t.url))
        .map(t => t.topic) || [];

      const forcedTopics = [...new Set([...genericTopics, ...urlSpecificTopics])];

      // Llamar a Claude
      const results = await analyzeBatch(batch, forcedTopics);

      // Guardar resultados
      await saveAnalysisResults(userId, results);
      totalAnalyzed += batch.length;
    } catch (error) {
      logger.error(`Error en batch ${i}: ${error.message}`);
      logger.error(`Stack: ${error.stack}`);
      totalSkipped += batch.length;
    }

    // Pausa entre batches para no saturar la API
    if (i + BATCH_SIZE < posts.length) {
      await delay(1000);
    }
  }

  logger.success(`Análisis completado. Analizados: ${totalAnalyzed}, Fallidos: ${totalSkipped}`);
  return { analyzed: totalAnalyzed, skipped: totalSkipped };
}

async function saveAnalysisResults(userId, results) {
  const supabase = getSupabaseClient();

  const categoriesToInsert = [];
  const topicsToInsert = [];

  for (const result of results) {
    const postId = result.post_id;

    // Categorías
    for (const category of result.categories || []) {
      if (category?.trim()) {
        categoriesToInsert.push({ post_id: postId, user_id: userId, category: category.trim() });
      }
    }

    // Temas libres
    for (const topic of result.topics || []) {
      if (topic?.trim()) {
        topicsToInsert.push({ post_id: postId, user_id: userId, topic: topic.trim(), forced: false, confidence: 'high' });
      }
    }

    // Temas forzados mencionados
    for (const ft of result.forced_topics || []) {
      if (ft.mentioned) {
        topicsToInsert.push({ post_id: postId, user_id: userId, topic: ft.topic, forced: true, confidence: ft.confidence || 'low' });
      }
    }
  }

  if (categoriesToInsert.length > 0) {
    const { error } = await supabase.from('post_categories').insert(categoriesToInsert);
    if (error) logger.error(`Error guardando categorías: ${error.message}`);
  }

  if (topicsToInsert.length > 0) {
    const { error } = await supabase.from('post_topics').insert(topicsToInsert);
    if (error) logger.error(`Error guardando temas: ${error.message}`);
  }

  logger.success(`Guardados: ${categoriesToInsert.length} categorías, ${topicsToInsert.length} temas`);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
