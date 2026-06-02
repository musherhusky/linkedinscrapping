import { getSupabaseClient } from './supabase.js';
import { Logger } from './logger.js';

const logger = new Logger('DATABASE');

export async function getActiveCompanies(userId) {
  const supabase = getSupabaseClient();

  logger.debug(`Obteniendo empresas activas del usuario: ${userId}`);

  try {
    const { data, error } = await supabase
      .from('target_companies')
      .select('url')
      .eq('user_id', userId)
      .eq('active', true);

    if (error) throw error;

    const urls = data?.map(d => d.url) || [];
    logger.success(`${urls.length} empresa(s) activa(s) encontrada(s)`);

    return urls;
  } catch (error) {
    logger.error(`Error obteniendo empresas: ${error.message}`);
    throw error;
  }
}

export async function deduplicatePosts(posts, userId) {
  const supabase = getSupabaseClient();

  logger.debug(`Deduplicando ${posts.length} posts...`);

  try {
    const { data: existing, error } = await supabase
      .from('hallon_posts')
      .select('url')
      .eq('user_id', userId);

    if (error) throw error;

    const existingUrls = new Set(existing?.map(e => e.url) || []);

    const newPosts = posts.filter(p => !existingUrls.has(p.url));
    const duplicates = posts.length - newPosts.length;

    logger.success(`${newPosts.length} nuevas, ${duplicates} duplicadas`);

    return { newPosts, duplicates };
  } catch (error) {
    logger.error(`Error deduplicando: ${error.message}`);
    throw error;
  }
}

export async function savePost(userId, post, status = 'sent', hallonResponse = null) {
  const supabase = getSupabaseClient();

  logger.debug(`savePost data: ${JSON.stringify({ post_type: post.postType, author_name: post.authorName, entity_id: post.entityId, likes: post.likes })}`);

  try {
    const { error } = await supabase
      .from('hallon_posts')
      .insert({
        user_id: userId,
        url: post.url,
        titulo: post.title || '',
        descripcion: post.description || '',
        fecha_post: post.publishedDate,
        post_type: post.postType || null,
        author_name: post.authorName || null,
        author_type: post.authorType || null,
        author_id: post.authorId || null,
        entity_id: post.entityId || null,
        likes: post.likes || 0,
        comments: post.comments || 0,
        shares: post.shares || 0,
        reactions: post.reactions || [],
        hallon_id: hallonResponse?.id || null,
        hallon_response: hallonResponse,
        status: status,
        sent_to_hallon: status === 'sent' ? new Date().toISOString() : null,
      });

    if (error) throw error;

    return true;
  } catch (error) {
    logger.error(`Error guardando post: ${error.message}`);
    throw error;
  }
}

export async function savelog(
  userId,
  post,
  status = 'sent',
  hallonResponse = null,
  errorMessage = null,
  errorType = null
) {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase
      .from('hallon_log')
      .insert({
        user_id: userId,
        url: post.url,
        titulo: post.title || '',
        status: status,
        hallon_id: hallonResponse?.id || null,
        hallon_response: hallonResponse,
        error_message: errorMessage,
        error_type: errorType,
        attempted_at: new Date().toISOString(),
        attempt_number: 1,
      });

    if (error) throw error;

    return true;
  } catch (error) {
    logger.error(`Error guardando log: ${error.message}`);
    throw error;
  }
}

export async function getTodayStats(userId) {
  const supabase = getSupabaseClient();
  const today = new Date().toDateString();

  try {
    const { data: sentToday } = await supabase
      .from('hallon_posts')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'sent')
      .gte('sent_to_hallon', new Date(today).toISOString());

    const { data: failedToday } = await supabase
      .from('hallon_log')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'failed')
      .gte('attempted_at', new Date(today).toISOString());

    return {
      sentToday: sentToday?.length || 0,
      failedToday: failedToday?.length || 0,
    };
  } catch (error) {
    logger.warn(`Error obteniendo estadísticas: ${error.message}`);
    return { sentToday: 0, failedToday: 0 };
  }
}
