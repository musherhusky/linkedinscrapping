import { getSupabaseClient } from './supabase.js';
import { Logger } from './logger.js';

const logger = new Logger('DATABASE');

export async function getAllUsersForHour(hourUtc) {
  const supabase = getSupabaseClient();

  logger.debug(`Obteniendo usuarios con hora de sync configurada: ${hourUtc}h UTC`);

  try {
    const { data, error } = await supabase
      .from('user_sync_hours')
      .select('user_id')
      .eq('hour_utc', hourUtc);

    if (error) throw error;

    // Filtrar solo usuarios con auto_execution_enabled y plan activo
    const userIds = data?.map(d => d.user_id) || [];

    if (userIds.length === 0) {
      if (!data || data.length === 0) {
        logger.warn(`user_sync_hours no tiene registros para la hora ${hourUtc}h — posible tabla vacía o sin usuarios configurados`);
      }
      return [];
    }

    const { data: activeUsers, error: settingsError } = await supabase
      .from('user_settings')
      .select('user_id')
      .in('user_id', userIds)
      .eq('auto_execution_enabled', true);

    if (settingsError) throw settingsError;

    logger.success(`${activeUsers?.length || 0} usuario(s) activo(s) para la hora ${hourUtc}h`);
    return activeUsers?.map(u => u.user_id) || [];
  } catch (error) {
    logger.error(`Error obteniendo usuarios por hora: ${error.message}`);
    throw error;
  }
}

export async function deactivateExcessUrls(userId, maxUrls) {
  const supabase = getSupabaseClient();

  logger.info(`Desactivando URLs sobrantes para usuario ${userId} (límite: ${maxUrls})`);

  try {
    // Obtener todas las URLs activas ordenadas por fecha de creación (más recientes primero)
    const [companies, people] = await Promise.all([
      supabase.from('target_companies').select('id, created_at').eq('user_id', userId).eq('active', true).order('created_at', { ascending: false }),
      supabase.from('target_people').select('id, created_at').eq('user_id', userId).eq('active', true).order('created_at', { ascending: false }),
    ]);

    const allUrls = [
      ...(companies.data || []).map(r => ({ ...r, table: 'target_companies' })),
      ...(people.data || []).map(r => ({ ...r, table: 'target_people' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const toDeactivate = allUrls.slice(maxUrls);

    if (toDeactivate.length === 0) {
      logger.info(`No hay URLs sobrantes`);
      return 0;
    }

    const companyIds = toDeactivate.filter(u => u.table === 'target_companies').map(u => u.id);
    const peopleIds  = toDeactivate.filter(u => u.table === 'target_people').map(u => u.id);

    await Promise.all([
      companyIds.length > 0 && supabase.from('target_companies').update({ active: false }).in('id', companyIds),
      peopleIds.length  > 0 && supabase.from('target_people').update({ active: false }).in('id', peopleIds),
    ]);

    logger.success(`${toDeactivate.length} URL(s) desactivada(s)`);
    return toDeactivate.length;
  } catch (error) {
    logger.error(`Error desactivando URLs: ${error.message}`);
    throw error;
  }
}

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

export async function upsertTargetProfile(userId, enrichment) {
  const supabase = getSupabaseClient();
  const isCompany = enrichment.authorType === 'company';
  const table = isCompany ? 'target_companies' : 'target_people';

  const update = {
    linkedin_id:       enrichment.linkedinId,
    avatar_url:        enrichment.avatarUrl,
    last_enriched_at:  new Date().toISOString(),
    ...(isCompany
      ? { followers_count: enrichment.followersCount }
      : { headline: enrichment.headline, website: enrichment.website }
    ),
  };

  const { error } = await supabase
    .from(table)
    .update(update)
    .eq('user_id', userId)
    .eq('url', enrichment.queryTargetUrl);

  if (error) logger.warn(`upsertTargetProfile error (${table}): ${error.message}`);
}

export async function insertFollowerHistory(userId, targetUrl, followersCount, scrapedAt) {
  const supabase = getSupabaseClient();

  const scrapedDate = new Date(scrapedAt).toISOString().split('T')[0];

  const { error } = await supabase
    .from('source_follower_history')
    .insert({
      user_id:         userId,
      target_url:      targetUrl,
      followers_count: followersCount ?? null,
      scraped_at:      scrapedAt,
      scraped_date:    scrapedDate,
    })
    .onConflict('user_id, target_url, scraped_date')
    .ignore();

  if (error && !error.message?.includes('duplicate')) {
    logger.warn(`insertFollowerHistory error: ${error.message}`);
  }
}

export async function upsertDiscoveredProfile(profile) {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('discovered_profiles')
    .upsert(
      {
        linkedin_url:      profile.linkedinUrl,
        linkedin_id:       profile.linkedinId,
        universal_name:    profile.universalName,
        public_identifier: profile.publicIdentifier,
        name:              profile.name,
        type:              profile.type,
        headline:          profile.headline,
        avatar_url:        profile.avatarUrl,
        first_seen_at:     now,
        last_seen_at:      now,
      },
      {
        onConflict: 'linkedin_url',
        ignoreDuplicates: false,
      }
    )
    .select('id')
    .single();

  if (error) {
    logger.warn(`upsertDiscoveredProfile error: ${error.message}`);
    return null;
  }
  return data?.id || null;
}

export async function upsertDiscoveredProfileRelation(discoveredProfileId, sourceUrl, sourceType) {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { error } = await supabase.rpc('increment_discovered_relation', {
    p_discovered_profile_id: discoveredProfileId,
    p_source_url:            sourceUrl,
    p_source_type:           sourceType,
    p_now:                   now,
  });

  if (error) logger.warn(`upsertDiscoveredProfileRelation error: ${error.message}`);
}
