import { Logger } from './logger.js';

const logger = new Logger('APIFY');

const APIFY_API = 'https://api.apify.com/v2';
const APIFY_TIMEOUT = 1800000;

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
    logger.debug(`Llamando Apify con token: ${token ? '***SET***' : 'NOT SET'}`);
    logger.debug(`Actor ID: ${actorId}`);
    logger.debug(`URL: ${APIFY_API}/acts/${actorId}/runs?token=***`);

    const runResponse = await fetch(
      `${APIFY_API}/acts/${actorId}/runs?token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      }
    );

    logger.debug(`Response status: ${runResponse.status}`);
    
    const responseData = await runResponse.json();
    logger.debug(`Response data:`, responseData);

    if (!runResponse.ok) {
      throw new Error(`Apify API error: ${responseData.message || JSON.stringify(responseData)}`);
    }

    const runData = responseData;

    //const runData = await runResponse.json();
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
  const maxAttempts = 120;

  logger.debug(`Esperando a que Actor termine...`);

  while (attempts < maxAttempts) {
    try {
      logger.debug(`Llamando a: ${APIFY_API}/v2/runs/${runId}`);
      
      const response = await fetch(
        `${APIFY_API}/acts/${actorId}/runs/${runId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      
      // Loguea TODA la respuesta para ver estructura
      logger.debug(`Response completo:`, data);

      // Intenta acceder a status de diferentes formas
      const status = data?.data?.status || data?.status;
      
      if (!status) {
        logger.error(`No se encontró status. Estructura:`, Object.keys(data));
        throw new Error(`No status found in response`);
      }

      logger.debug(`Intento ${attempts + 1}: Status = ${status}`);

      if (status === 'SUCCEEDED') {
        logger.success(`Actor completado exitosamente`);
        return status;
      }

      if (status === 'FAILED' || status === 'ABORTED') {
        throw new Error(`Actor terminó con status: ${status}`);
      }

      process.stdout.write('.');
      attempts++;
      
      await delay(15000);
    } catch (error) {
      logger.error(`Error:`, error.message);
      throw error;
    }
  }

  throw new Error(`Actor timeout`);
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
