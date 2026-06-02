import { Logger } from './logger.js';

const logger = new Logger('APIFY');

const APIFY_API = 'https://api.apify.com/v2';

function buildActorInput(targetUrls, settings) {
  return {
    targetUrls: targetUrls,
    maxPosts: settings.max_posts_per_company || 5,
    postedLimit: settings.posted_limit || '24h',  // ← CORRECTO
    includeQuotePosts: true,
    includeReposts: true,
    scrapeComments: false,
    scrapeReactions: false,
    maxComments: 5,
    maxReactions: 5,
    postNestedComments: false,      // ← NUEVO
    postNestedReactions: false,     // ← NUEVO
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
  logger.info(`INPUT:`, JSON.stringify(input, null, 2));

  try {
    // Paso 1: Ejecutar Actor (asincrónico)
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
      throw new Error(`Apify run error: ${error.message || JSON.stringify(error)}`);
    }

    const runData = await runResponse.json();
    const runId = runData.data.id;
    const datasetId = runData.data.defaultDatasetId;

    logger.success(`Actor iniciado. Run ID: ${runId}, Dataset ID: ${datasetId}`);

    // Paso 2: Esperar a que termine (con waitForFinish)
    logger.info(`Esperando a que Actor termine...`);
    
    const waitResponse = await fetch(
      `${APIFY_API}/acts/${actorId}/runs/${runId}?token=${token}&waitForFinish=120`,
      {
        method: 'GET',
      }
    );

    const waitData = await waitResponse.json();
    const finalStatus = waitData.data.status;

    logger.info(`Actor status: ${finalStatus}`);

    if (finalStatus !== 'SUCCEEDED') {
      throw new Error(`Actor terminó con status: ${finalStatus}`);
    }

    // Paso 3: Obtener datos del dataset
    logger.info(`Obteniendo datos del dataset ${datasetId}...`);

    const datasetResponse = await fetch(
      `${APIFY_API}/datasets/${datasetId}/items`,
      {
        method: 'GET',
      }
    );

    if (!datasetResponse.ok) {
      throw new Error(`Dataset error: ${datasetResponse.statusText}`);
    }

    const datasetData = await datasetResponse.json();
    const items = datasetData.items || [];

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