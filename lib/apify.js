import { Logger } from './logger.js';

const logger = new Logger('APIFY');

const APIFY_API = 'https://api.apify.com/v2';

function buildActorInput(targetUrls, settings) {
  // Calcular fecha hace N días según posted_limit
  function getPostedLimitDate(limit) {
    const now = new Date();
    
    switch (limit) {
      case '24h':
        now.setDate(now.getDate() - 1);
        break;
      case '7d':
        now.setDate(now.getDate() - 7);
        break;
      case '30d':
        now.setDate(now.getDate() - 30);
        break;
      default: // 'all' - no limitar
        return undefined;
    }
    
    return now.toISOString().split('T')[0]; // Formato: YYYY-MM-DD
  }

  return {
    targetUrls: targetUrls,
    maxPosts: settings.max_posts_per_company || 5,
    postedLimitDate: getPostedLimitDate(settings.posted_limit || '24h'),
    includeQuotePosts: true,
    includeReposts: true,
    scrapeComments: false,
    scrapeReactions: false,
    maxComments: 5,
    maxReactions: 5,
  };
}

export async function executeActor(targetUrls, settings) {
  const actorId = process.env.APIFY_ACTOR_ID;
  const token = process.env.APIFY_TOKEN;

  if (!actorId || !token) {
    throw new Error('APIFY_ACTOR_ID o APIFY_TOKEN no configurados');
  }

  const input = buildActorInput(targetUrls, settings);

  logger.info(`Ejecutando Actor ${actorId} (SYNC) con ${targetUrls.length} empresa(s)...`);

  try {
    logger.debug(`Input:`, input);

    // Usar endpoint SINCRÓNICO que devuelve los datos directamente
    const response = await fetch(
      `${APIFY_API}/acts/${actorId}/run-sync-get-dataset-items?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      }
    );

    logger.debug(`Response status: ${response.status}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Apify API error: ${error.message || JSON.stringify(error)}`);
    }

    const items = await response.json();

    logger.success(`Actor completado. ${items.length} posts extraídos`);

    // Normalizar formato
    return items.map(item => ({
      url: item.url || item.postUrl,
      title: item.title || item.text || '',
      description: item.description || item.text || '',
      publishedDate: item.createdTime || new Date().toISOString(),
    }));
  } catch (error) {
    logger.error(`Error ejecutando Actor: ${error.message}`);
    throw error;
  }
}