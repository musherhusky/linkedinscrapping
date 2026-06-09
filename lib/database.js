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

export async function getActivePeople(userId) {
  const supabase = getSupabaseClient();

  logger.debug(`Obteniendo personas activas del usuario: ${userId}`);

  try {
    const { data, error } = await supabase
      .from('target_people')
      .select('url')
      .eq('user_id', userId)
      .eq('active', true);

    if (error) throw error;

    const urls = data?.map(d => d.url) || [];
    logger.success(`${urls.length} persona(s) activa(s) encontrada(s)`);

    return urls;
  } catch (error) {
    logger.error(`Error obteniendo personas: ${error.message}`);
    throw error;
  }
}

export async function deduplicatePosts(posts, userId) {
  const supabase = getSupabaseClient();

  logger.debug(`Deduplicando ${posts.length} posts...`);

  try {
    const { data: existing, error } = await supabase
      .from('posts')
      .select('url')
      .eq('user_id', userId);

    if (error) throw error;

    const existingUrls = new Set(existing?.map(e => e.url) || []);

    // Deduplicar por url (no por linkedinUrl, que puede repetirse
    // en reposts del mismo artículo por distintas personas)
    const newPosts = posts.filter(p => !existingUrls.has(p.url));
    const duplicates = posts.length - newPosts.length;

    logger.success(`${newPosts.length} nuevas, ${duplicates} duplicadas`);

    return { newPosts, duplicates };
  } catch (error) {
    logger.error(`Error deduplicando: ${error.message}`);
    throw error;
  }
}

export async function savePost(userId, post, status = 'sent', dispatchResponse = null, sourceType = 'company') {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase
      .from('posts')
      .insert({
        user_id:            userId,
        url:                post.url,
        linkedin_url:       post.linkedinUrl || null,
        titulo:             post.title || '',
        descripcion:        post.description || '',
        article_source:     post.articleSource || null,
        fecha_post:         post.publishedDate,
        content_type:       post.contentType || null,
        post_type:          post.postType || null,
        author_name:        post.authorName || null,
        author_type:        post.authorType || null,
        author_id:          post.authorId || null,
        entity_id:          post.entityId || null,
        is_repost:          post.isRepost || false,
        repost_comment:     post.repostComment || null,
        reposted_by:        post.repostedBy || null,
        likes:                      post.likes || 0,
        comments:                   post.comments || 0,
        shares:                     post.shares || 0,
        reactions:                  post.reactions || [],
        reactions_like:             post.reactionsLike || 0,
        reactions_empathy:          post.reactionsEmpathy || 0,
        reactions_praise:           post.reactionsPraise || 0,
        reactions_appreciation:     post.reactionsAppreciation || 0,
        reactions_interest:         post.reactionsInterest || 0,
        reactions_entertainment:    post.reactionsEntertainment || 0,
        source_type:        sourceType,
        external_id:        dispatchResponse?.id || null,
        dispatch_response:  dispatchResponse,
        status:             status,
        sent_to_published_at: status === 'sent' ? new Date().toISOString() : null,
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
  dispatchResponse = null,
  errorMessage = null,
  errorType = null
) {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase
      .from('activity_log')
      .insert({
        user_id:           userId,
        url:               post.url,
        titulo:            post.title || '',
        status:            status,
        external_id:       dispatchResponse?.id || null,
        dispatch_response: dispatchResponse,
        error_message:     errorMessage,
        error_type:        errorType,
        attempted_at:      new Date().toISOString(),
        attempt_number:    1,
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
      .from('posts')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'sent')
      .gte('sent_to_published_at', new Date(today).toISOString());

    const { data: failedToday } = await supabase
      .from('activity_log')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'failed')
      .gte('attempted_at', new Date(today).toISOString());

    return {
      sentToday:   sentToday?.length  || 0,
      failedToday: failedToday?.length || 0,
    };
  } catch (error) {
    logger.warn(`Error obteniendo estadísticas: ${error.message}`);
    return { sentToday: 0, failedToday: 0 };
  }
}
