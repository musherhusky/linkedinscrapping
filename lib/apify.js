import { Logger } from './logger.js';

const logger = new Logger('APIFY');

const APIFY_API = 'https://api.apify.com/v2';
const APIFY_TIMEOUT = 600000;

function buildActorInput(targetUrls, settings) {
  return {
    includeQuotePosts: true,
    includeReposts: true,
    maxComments: 5,
    maxPosts: settings.max_posts_per_company || 5,
    maxReactions: 5,
    postNestedComments: false,
    postNestedReactions: false,
    postedLimit: settings.posted_limit || '24h',
    scrapeComments: false,
    scrapeReactions: false,
    targetUrls: targetUrls,
  };
}

export async function executeActor(targetUrls, settings) {
  const actorId = process.env.APIFY_ACTOR_ID;
  const token = process.env.APIFY_TOKEN;

  if (!actorId || !token) {
    throw new Error('APIFY_ACTOR_ID o APIFY_TOKEN no configurados');
  }

  const input = buildActorInput(targetUrls, settings);

  logger.info(`Ejecutando Actor ${actorId} con ${targetUrls.length} empresa(s)...`);

  try {
    const runResponse = await fetch(
      `${APIFY_API}/acts/${actorId}/runs?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      }
    );

    if (!runResponse.ok) {
      const error = await runResponse.json();
      throw new Error(`Apify API error: ${error.message}`);
    }

    const runData = await runResponse.json();
    const runId = runData.data.id;

    logger.success(`Actor iniciado. Run ID: ${runId}`);

    const status = await waitForActorCompletion(actorId, runId, token);

    if (status !== 'SUCCEEDED') {
      throw new Error(`Actor terminó con status: ${status}`);
    }

    const items = await getActorDataset(actorId, runId, token);

    logger.success(`Actor completado. ${items.length} posts extraídos`);

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

async function waitForActorCompletion(actorId, runId, token) {
  const startTime = Date.now();
  let attempts = 0;

  logger.debug(`Esperando a que Actor termine...`);

  while (Date.now() - startTime < APIFY_TIMEOUT) {
    try {
      const response = await fetch(
        `${APIFY_API}/acts/${actorId}/runs/${runId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      const status = data.data.status;

      if (status === 'SUCCEEDED') {
        logger.success(`Actor completado exitosamente`);
        return status;
      }

      if (status === 'FAILED' || status === 'ABORTED') {
        throw new Error(`Actor terminó con status: ${status}`);
      }

      process.stdout.write('.');
      attempts++;

      await delay(5000);
    } catch (error) {
      logger.error(`Error verificando status: ${error.message}`);
      throw error;
    }
  }

  throw new Error(`Actor timeout (>10 minutos)`);
}

async function getActorDataset(actorId, runId, token) {
  logger.debug(`Obteniendo Dataset...`);

  try {
    const response = await fetch(
      `${APIFY_API}/acts/${actorId}/runs/${runId}/dataset/items`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Dataset API error: ${response.statusText}`);
    }

    const items = await response.json();

    logger.success(`Dataset obtenido. ${items.length} items`);
    return items;
  } catch (error) {
    logger.error(`Error obteniendo Dataset: ${error.message}`);
    throw error;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
